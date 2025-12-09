// src/app/api/news/collect-my/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchNaverNewsByKeyword } from '@/lib/naverNewsClient'
import { simpleKoreanSentiment } from '@/lib/sentiment'

type StockItemActiveRow = {
  user_id: string
  code: string
  name: string
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function extractProviderFromTitle(title: string): string | null {
  const match = title.match(/<([^>]+)>/)
  if (match && match[1]) return match[1]
  return null
}

export async function POST(_req: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {
          // no-op
        },
        remove() {
          // no-op
        },
      },
    }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { error: '로그인이 필요합니다.' },
      { status: 401 }
    )
  }

  // 1. 해당 유저의 보유중(is_sold = false) 종목
  const { data, error } = await supabaseAdmin
    .from('stock_items')
    .select('user_id, code, name')
    .eq('user_id', user.id)
    .eq('is_sold', false)

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[news/collect-my] stock_items 조회 실패', error)
    return NextResponse.json(
      { error: '보유 종목 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }

  const rows = (data ?? []) as StockItemActiveRow[]

  // (code 기준 중복 제거)
  const seen = new Set<string>()
  const targets: StockItemActiveRow[] = []
  for (const row of rows) {
    if (!seen.has(row.code)) {
      seen.add(row.code)
      targets.push(row)
    }
  }

  const insertedCounts: { [code: string]: number } = {}

  // 2. 각 종목별 뉴스 조회 및 저장
  for (const row of targets) {
    const keyword = row.name
    try {
      const newsItems = await fetchNaverNewsByKeyword(keyword, {
        display: 20,
        sort: 'date',
      })

      if (!newsItems.length) continue

      const payload = newsItems.map((item) => {
        const rawTitle = stripHtml(item.title)
        const rawDesc = stripHtml(item.description ?? '')

        const title = decodeHtmlEntities(rawTitle)
        const description = decodeHtmlEntities(rawDesc)

        const textForSentiment = `${title} ${description}`
        const sentiment = simpleKoreanSentiment(textForSentiment)

        return {
          user_id: row.user_id,
          code: row.code,
          name: row.name,
          title,
          link: item.link || item.originallink,
          description,
          provider: extractProviderFromTitle(item.title),
          naver_query: keyword,
          published_at: new Date(item.pubDate).toISOString(),
          sentiment,
        }
      })

      const { error: upsertError, count } = await supabaseAdmin
        .from('stock_news')
        .upsert(payload, {
          onConflict: 'user_id,code,link',
          ignoreDuplicates: true,
          count: 'exact',
        })

      if (upsertError) {
        // eslint-disable-next-line no-console
        console.error(
          `[news/collect-my] stock_news upsert 실패 (code=${row.code})`,
          upsertError
        )
        continue
      }

      insertedCounts[row.code] = count ?? 0
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `[news/collect-my] 네이버 뉴스 수집 실패 (code=${row.code}, name=${row.name})`,
        e
      )
    }
  }

  return NextResponse.json({
    ok: true,
    targets: targets.map((t) => ({ code: t.code, name: t.name })),
    insertedCounts,
  })
}

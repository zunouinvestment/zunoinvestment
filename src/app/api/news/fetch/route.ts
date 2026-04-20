// src/app/api/news/fetch/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyCronRequest } from '@/lib/cronAuth'
import { fetchNaverNewsByKeyword } from '@/lib/naverNewsClient'
import { simpleKoreanSentiment } from '@/lib/sentiment'

type StockItemActiveRow = {
  user_id: string
  code: string
  name: string
}

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  // 1. 보유 중(is_sold = false) 종목 목록 가져오기
  const { data, error } = await supabaseAdmin
    .from('stock_items')
    .select('user_id, code, name')
    .eq('is_sold', false)

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[news/fetch] stock_items 조회 실패', error)
    return NextResponse.json(
      { error: 'stock_items 조회 실패' },
      { status: 500 }
    )
  }

  const rows = (data ?? []) as StockItemActiveRow[]

  // (user_id, code) 기준 중복 제거
  const keySet = new Set<string>()
  const targets: StockItemActiveRow[] = []
  for (const row of rows) {
    const key = `${row.user_id}:${row.code}`
    if (!keySet.has(key)) {
      keySet.add(key)
      targets.push(row)
    }
  }

  const insertedCounts: { [key: string]: number } = {}

  // 2. 각 종목별 뉴스 검색 & 저장
  for (const row of targets) {
    const keyword = row.name // 필요하면 `${row.name} 주식` 등으로 조정
    try {
      const newsItems = await fetchNaverNewsByKeyword(keyword, {
        display: 20,
        sort: 'date',
      })

      if (!newsItems.length) continue

      const payload = newsItems.map((item) => {
        const textForSentiment = `${item.title} ${item.description ?? ''}`
        const sentiment = simpleKoreanSentiment(textForSentiment)

        return {
          user_id: row.user_id,
          code: row.code,
          name: row.name,
          title: stripHtml(item.title),
          link: item.link || item.originallink,
          description: stripHtml(item.description ?? ''),
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
          `[news/fetch] stock_news upsert 실패 (code=${row.code})`,
          upsertError
        )
        continue
      }

      insertedCounts[`${row.user_id}:${row.code}`] = count ?? 0
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `[news/fetch] 네이버 뉴스 수집 실패 (code=${row.code}, name=${row.name})`,
        e
      )
    }
  }

  return NextResponse.json({
    ok: true,
    targets: targets.length,
    insertedCounts,
  })
}

// 네이버 API에서 title/description에 HTML 태그가 껴서 오기 때문에 제거
function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"')
}

function extractProviderFromTitle(title: string): string | null {
  // 예: "한화투자증권, 신사업 확대 <머니투데이>" 같은 형태면 <> 안쪽을 잡을 수도 있고,
  // 실제 패턴은 아이템에 따라 달라서 일단 placeholder. 필요시 개선.
  const match = title.match(/<([^>]+)>/)
  if (match && match[1]) return match[1]
  return null
}

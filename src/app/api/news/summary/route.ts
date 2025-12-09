// src/app/api/news/summary/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type Sentiment = 'positive' | 'negative' | 'neutral'

type NewsRowFromDb = {
  id: string
  user_id: string
  code: string
  name: string
  title: string
  link: string
  description: string | null
  provider: string | null
  naver_query: string | null
  published_at: string | null
  sentiment: Sentiment | null
}

type DailyCount = {
  date: string
  total: number
  positive: number
  negative: number
  neutral: number
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const searchParams = url.searchParams

  const code = searchParams.get('code')
  const name = searchParams.get('name')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // ⛔️ 기존엔 여기서 code/name 없으면 400을 줬는데, 이제는 "전체" 지원을 위해 제거

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

  const query = supabase
    .from('stock_news')
    .select(
      'id, user_id, code, name, title, link, description, provider, naver_query, published_at, sentiment'
    )
    .eq('user_id', user.id)

  if (code) {
    query.eq('code', code)
  } else if (name) {
    query.eq('name', name)
  } // ➜ 둘 다 없으면 전체 종목

  if (from) {
    query.gte('published_at', `${from}T00:00:00+09:00`)
  }
  if (to) {
    query.lte('published_at', `${to}T23:59:59+09:00`)
  }

  query.order('published_at', { ascending: true })

  const { data, error } = await query

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[news/summary] stock_news 조회 실패', error)
    return NextResponse.json(
      { error: 'stock_news 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }

  const items = (data ?? []) as NewsRowFromDb[]

  const dailyMap = new Map<string, DailyCount>()

  for (const row of items) {
    if (!row.published_at) continue
    const d = new Date(row.published_at)
    if (Number.isNaN(d.getTime())) continue

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const key = `${yyyy}-${mm}-${dd}`

    const prev = dailyMap.get(key) ?? {
      date: key,
      total: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
    }

    prev.total += 1
    if (row.sentiment === 'positive') prev.positive += 1
    else if (row.sentiment === 'negative') prev.negative += 1
    else prev.neutral += 1

    dailyMap.set(key, prev)
  }

  const dailyCounts = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return NextResponse.json({
    items,
    dailyCounts,
  })
}

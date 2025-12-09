// src/app/api/news/trend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type TrendStock = {
  code: string
  name: string
}

type NewsRow = {
  code: string
  name: string
  published_at: string | null
}

type TrendSeriesRow = {
  date: string
  [code: string]: string | number
}

export async function GET(_req: NextRequest) {
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

  // 1. 보유 중(is_sold = false) 종목 코드 목록
  const { data: activeItems, error: activeError } = await supabase
    .from('stock_items')
    .select('code, name')
    .eq('user_id', user.id)
    .eq('is_sold', false)

  if (activeError) {
    // eslint-disable-next-line no-console
    console.error('[news/trend] stock_items 조회 실패', activeError)
    return NextResponse.json(
      { error: '보유 종목 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }

  const activeRows = (activeItems ?? []) as TrendStock[]

  const seen = new Set<string>()
  const stocks: TrendStock[] = []
  for (const row of activeRows) {
    if (!seen.has(row.code)) {
      seen.add(row.code)
      stocks.push(row)
    }
  }

  if (stocks.length === 0) {
    return NextResponse.json({
      stocks: [],
      series: [],
    })
  }

  const codes = stocks.map((s) => s.code)

  // 2. 최근 30일
  const end = new Date()
  const start = new Date()
  start.setDate(end.getDate() - 29) // 오늘 포함 30일

  const startIso = start.toISOString()
  const endIso = end.toISOString()

  const { data: newsData, error: newsError } = await supabase
    .from('stock_news')
    .select('code, name, published_at')
    .eq('user_id', user.id)
    .in('code', codes)
    .gte('published_at', startIso)
    .lte('published_at', endIso)
    .order('published_at', { ascending: true })

  if (newsError) {
    // eslint-disable-next-line no-console
    console.error('[news/trend] stock_news 조회 실패', newsError)
    return NextResponse.json(
      { error: '뉴스 추세 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }

  const rows = (newsData ?? []) as NewsRow[]

  const byDate = new Map<string, TrendSeriesRow>()

  for (const row of rows) {
    if (!row.published_at) continue
    const d = new Date(row.published_at)
    if (Number.isNaN(d.getTime())) continue

    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const key = `${yyyy}-${mm}-${dd}`

    const current = byDate.get(key) ?? { date: key }
    const prev = (current[row.code] as number | undefined) ?? 0
    current[row.code] = prev + 1
    byDate.set(key, current)
  }

  const series = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  )

  return NextResponse.json({
    stocks,
    series,
  })
}

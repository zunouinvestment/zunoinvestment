// src/app/api/news/active-stocks/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type ActiveStockRow = {
  code: string
  name: string
}

export async function GET(_req: NextRequest) {
  // 🔧 여기가 포인트: cookies() → await cookies()
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        // Route Handler에서는 응답 쿠키를 직접 안 건드려도 돼서 no-op
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

  const { data, error } = await supabase
    .from('stock_items')
    .select('code, name')
    .eq('user_id', user.id)
    .eq('is_sold', false)

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[news/active-stocks] stock_items 조회 실패', error)
    return NextResponse.json(
      { error: '보유 종목 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }

  const rows = (data ?? []) as ActiveStockRow[]

  // (code 기준 중복 제거)
  const seen = new Set<string>()
  const stocks: ActiveStockRow[] = []
  for (const row of rows) {
    if (!seen.has(row.code)) {
      seen.add(row.code)
      stocks.push(row)
    }
  }

  return NextResponse.json({ stocks })
}

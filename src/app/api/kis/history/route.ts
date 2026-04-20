import { NextRequest, NextResponse } from 'next/server'
import { getDailyStockTrend } from '@/lib/kisClient'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  if (!code) {
    return NextResponse.json(
      { error: 'code 쿼리 파라미터가 필요합니다.' },
      { status: 400 }
    )
  }

  try {
    const rows = await getDailyStockTrend(code)
    return NextResponse.json({ code, rows }, { status: 200 })
  } catch (error) {
    console.error('GET /api/kis/history error', error)
    const message =
      error instanceof Error
        ? error.message
        : 'KIS 일별 데이터 조회 중 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

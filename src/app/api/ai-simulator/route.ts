import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDailyStockTrendByRange } from '@/lib/kisClient'
import { requireUserId } from '@/lib/serverAuth'
import { enforceRateLimit, getClientIp } from '@/lib/rateLimit'

type RecommendationRow = {
  id: number
  recommend_date: string
  code: string
  name: string
  close_price: number | null
  target_price: number | null
  reason_summary: string | null
}

function toIsoDate(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isKisTpsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message =
    'message' in error && typeof error.message === 'string'
      ? error.message
      : ''
  return message.includes('EGW00201') || message.includes('초당 거래건수를 초과')
}

async function fetchTrendWithRetry(
  code: string,
  recDate: string
): Promise<Awaited<ReturnType<typeof getDailyStockTrendByRange>>> {
  const endDate = new Date().toISOString().slice(0, 10)
  let delayMs = 250
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await getDailyStockTrendByRange(code, recDate, endDate, 240)
    } catch (error) {
      if (!isKisTpsError(error) || attempt === 3) throw error
      await sleep(delayMs)
      delayMs *= 2
    }
  }
  return []
}

export async function GET(req: NextRequest) {
  const auth = await requireUserId()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const ip = getClientIp(req)
  const limited = enforceRateLimit(`ai-simulator:${ip}`, 20, 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
    )
  }

  const { searchParams } = new URL(req.url)
  const from = toIsoDate(searchParams.get('from'))
  const to = toIsoDate(searchParams.get('to'))
  const rawLimit = Number(searchParams.get('limit') ?? '40')
  const itemLimit = Number.isFinite(rawLimit)
    ? Math.min(60, Math.max(10, Math.floor(rawLimit)))
    : 40

  try {
    let query = supabaseAdmin
      .from('stock_ai_recommendations')
      .select('id, recommend_date, code, name, close_price, target_price, reason_summary')
      .order('recommend_date', { ascending: false })

    if (from) query = query.gte('recommend_date', from)
    if (to) query = query.lte('recommend_date', to)

    const { data, error } = await query.limit(itemLimit)
    if (error) throw error

    const rows = (data ?? []) as RecommendationRow[]
    const enriched = []

    for (const row of rows) {
      const recDate = row.recommend_date
      const entryPrice = Number(row.close_price ?? 0)
      const thresholdPrice = entryPrice > 0 ? entryPrice * 1.03 : 0

      let currentPrice: number | null = null
      let reachedDate: string | null = null
      let maxHighAfterRec = 0
      let highRowsCount = 0

      try {
        const trend = await fetchTrendWithRetry(row.code, recDate)
        highRowsCount = trend.length

        if (trend.length > 0) {
          currentPrice = trend[trend.length - 1].close
        }

        for (const candle of trend) {
          if (candle.high > maxHighAfterRec) {
            maxHighAfterRec = candle.high
          }
          if (!reachedDate && thresholdPrice > 0 && candle.high >= thresholdPrice) {
            reachedDate = candle.date
          }
        }
      } catch {
        // keep row with partial null values
      }

      const reachedTarget =
        reachedDate !== null ||
        (thresholdPrice > 0 && maxHighAfterRec >= thresholdPrice)

      const currentReturnRate =
        currentPrice !== null && entryPrice > 0
          ? ((currentPrice - entryPrice) / entryPrice) * 100
          : null

      enriched.push({
        ...row,
        entry_price: entryPrice,
        target_price: thresholdPrice,
        current_price: currentPrice,
        reached_target: reachedTarget,
        reached_date: reachedDate,
        max_high_after_recommend: maxHighAfterRec || null,
        current_return_rate: currentReturnRate,
        sample_days: highRowsCount,
      })

      // KIS TPS 보호를 위한 요청 간 짧은 간격
      await sleep(120)
    }

    const total = enriched.length
    const reached = enriched.filter((item) => item.reached_target).length
    const successRate = total > 0 ? (reached / total) * 100 : 0

    return NextResponse.json({
      total,
      reached,
      success_rate: successRate,
      items: enriched,
    })
  } catch (error) {
    console.error('[ai-simulator] error', error)
    return NextResponse.json(
      { error: 'AI Simulator 데이터를 불러오는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

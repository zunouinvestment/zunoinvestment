'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type StrategyRow = {
  id: string
  code: string
  name: string
  isRealBuy: boolean
  isSold: boolean
  soldAt?: string | null

  avgPrice: number
  quantity: number

  currentPrice?: number
  changeRate?: number
  openPrice?: number
  highPrice?: number
  lowPrice?: number

  targetPrice?: number
  buyDate?: string | null
}

type StockItemFromDb = {
  id: string
  user_id: string
  code: string
  name: string
  is_real_buy: boolean
  avg_price: number | null
  quantity: number | null
  is_sold: boolean
  sold_at: string | null
  target_price: number | null
  buy_date: string | null
  created_at: string
  updated_at: string
}

type KisPriceApiResponse = {
  code: string
  name?: string
  currentPrice: number
  openPrice: number
  highPrice: number
  lowPrice: number
  volume: number
  changeRate: number
  changePrice?: number
}

export default function StrategyPage() {
  const [rows, setRows] = useState<StrategyRow[]>([])
  const rowsRef = useRef<StrategyRow[]>([])
  useEffect(() => {
    rowsRef.current = rows
  }, [rows])

  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isAutoRefresh, setIsAutoRefresh] = useState(false)

  // ---------- 날짜 포맷터 (YYYY.M.D) ----------
  const formatDate = (value: string | null | undefined): string => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    const y = date.getFullYear()
    const m = date.getMonth() + 1
    const d = date.getDate()
    return `${y}.${m}.${d}`
  }

  // ---------- 초기 로딩 ----------
  useEffect(() => {
    const load = async (): Promise<void> => {
      setIsInitialLoading(true)
      setErrorMsg(null)

      const {
        data: userData,
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !userData?.user) {
        setErrorMsg('로그인이 필요합니다.')
        setIsInitialLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('stock_items')
        .select(
          'id, user_id, code, name, is_real_buy, avg_price, quantity, is_sold, sold_at, target_price, buy_date, created_at',
        )
        .eq('user_id', userData.user.id)
        .eq('is_sold', false)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('[Strategy] 초기 로딩 에러:', error)
        setErrorMsg('전략 데이터를 불러오는 중 오류가 발생했습니다.')
        setIsInitialLoading(false)
        return
      }

      const mapped: StrategyRow[] = (data as StockItemFromDb[]).map(
        (item) => ({
          id: item.id,
          code: item.code,
          name: item.name,
          isRealBuy: item.is_real_buy,
          isSold: item.is_sold,
          soldAt: item.sold_at,
          avgPrice: Number(item.avg_price ?? 0),
          quantity: Number(item.quantity ?? 0),
          targetPrice: Number(item.target_price ?? 0),
          buyDate: item.buy_date,
        }),
      )

      setRows(mapped)
      setIsInitialLoading(false)

      if (mapped.length > 0) {
        void refreshPricesOnce(mapped)
      }
    }

    void load()
  }, [])

  // ---------- 시세 갱신 ----------
  const refreshPricesOnce = async (
    targetRows?: StrategyRow[],
  ): Promise<void> => {
    const latestRows = targetRows ?? rowsRef.current
    if (latestRows.length === 0) return

    try {
      const results = await Promise.allSettled(
        latestRows.map(async (row) => {
          const res = await fetch(
            `/api/kis/price?code=${encodeURIComponent(row.code)}`,
          )
          if (!res.ok) {
            throw new Error(
              `가격 조회 실패: ${row.code} (${res.status})`,
            )
          }
          const data =
            (await res.json()) as KisPriceApiResponse
          return data
        }),
      )

      const priceMap = new Map<string, KisPriceApiResponse>()
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const value = result.value
          priceMap.set(value.code, value)
        } else if (result.status === 'rejected') {
          console.warn(
            '[Strategy] 일부 종목 시세 갱신 실패:',
            result.reason,
          )
        }
      })

      setRows((prev) =>
        prev.map((row) => {
          const price = priceMap.get(row.code)
          if (!price) return row
          return {
            ...row,
            currentPrice: price.currentPrice,
            changeRate: price.changeRate,
            openPrice: price.openPrice,
            highPrice: price.highPrice,
            lowPrice: price.lowPrice,
          }
        }),
      )
    } catch (error: unknown) {
      console.error('[Strategy] 시세 갱신 에러:', error)
      setErrorMsg('시세를 갱신하는 중 오류가 발생했습니다.')
    }
  }

  // ---------- 실시간 폴링 ----------
  useEffect(() => {
    if (!isAutoRefresh) return

    let cancelled = false

    const loop = async (): Promise<void> => {
      while (!cancelled) {
        const latest = rowsRef.current
        if (latest.length > 0) {
          await refreshPricesOnce(latest)
        }
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 2000)
        })
      }
    }

    void loop()
    return () => {
      cancelled = true
    }
  }, [isAutoRefresh])

  const handleRefreshOnceClick = async (): Promise<void> => {
    setErrorMsg(null)
    await refreshPricesOnce()
  }

  // ---------- 평균단가 / 주수 / 목표단가 수정 ----------
  const handleFieldChange = (
    id: string,
    field: 'avgPrice' | 'quantity' | 'targetPrice',
    value: string,
  ): void => {
    const normalized = value.replace(/,/g, '').trim()
    const num = Number(normalized)
    setRows((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              [field]:
                Number.isNaN(num) || normalized === '' ? 0 : num,
            }
          : row,
      ),
    )
  }

  const handleFieldBlur = async (id: string): Promise<void> => {
    const row = rowsRef.current.find((r) => r.id === id)
    if (!row) return
    setIsMutating(true)
    setErrorMsg(null)

    try {
      const { error } = await supabase
        .from('stock_items')
        .update({
          avg_price: row.avgPrice,
          quantity: row.quantity,
          target_price:
            row.targetPrice && !Number.isNaN(row.targetPrice)
              ? row.targetPrice
              : null,
        })
        .eq('id', id)

      if (error) throw error
    } catch (error: unknown) {
      console.error(
        '[Strategy] 평균단가/주수/목표단가 저장 에러:',
        error,
      )
      setErrorMsg(
        '평균단가/주수/목표단가를 저장하는 중 오류가 발생했습니다.',
      )
    } finally {
      setIsMutating(false)
    }
  }

  // ---------- 매도완료 체크 ----------
  const handleToggleSold = async (
    row: StrategyRow,
  ): Promise<void> => {
    setIsMutating(true)
    setErrorMsg(null)

    const now = new Date().toISOString()
    const newIsSold = !row.isSold

    try {
      const { data, error } = await supabase
        .from('stock_items')
        .update({
          is_sold: newIsSold,
          sold_at: newIsSold ? now : null,
        })
        .eq('id', row.id)
        .select('*')
        .single()

      if (error) throw error

      const updated = data as StockItemFromDb

      if (updated.is_sold) {
        setRows((prev) =>
          prev.filter((r) => r.id !== updated.id),
        )
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === updated.id
              ? {
                  ...r,
                  isSold: updated.is_sold,
                  soldAt: updated.sold_at,
                }
              : r,
          ),
        )
      }
    } catch (error: unknown) {
      console.error(
        '[Strategy] 매도완료 토글 에러:',
        error,
      )
      setErrorMsg(
        '매도완료 상태를 변경하는 중 오류가 발생했습니다.',
      )
    } finally {
      setIsMutating(false)
    }
  }

  // ---------- 숫자/퍼센트 포맷 ----------
  const formatNumber = (
    value: number | undefined,
    digits = 0,
  ): string => {
    if (value === null || value === undefined) return '-'
    if (Number.isNaN(value)) return '-'
    const n = Number(value)
    return n.toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
  }

  const formatPercent = (
    value: number | undefined,
  ): { text: string; className: string } => {
    if (value === null || value === undefined) {
      return { text: '-', className: 'text-gray-500' }
    }
    if (Number.isNaN(value)) {
      return { text: '-', className: 'text-gray-500' }
    }

    let className = 'text-gray-500'
    if (value > 0) className = 'text-red-600'
    else if (value < 0) className = 'text-blue-600'

    const sign = value > 0 ? '+' : value < 0 ? '' : ''
    const text = `${sign}${value.toFixed(2)}%`

    return { text, className }
  }

  const getProfitColorClass = (
    value: number | undefined,
  ): string => {
    if (value === null || value === undefined) {
      return 'text-gray-500'
    }
    if (value > 0) return 'text-red-600'
    if (value < 0) return 'text-blue-600'
    return 'text-gray-500'
  }

  const formatInputNumber = (value: number): string => {
    if (!value || Number.isNaN(value)) return ''
    return value.toLocaleString()
  }

  const formatSignedProfit = (
    value: number | undefined,
  ): { text: string; className: string } => {
    if (value === null || value === undefined || value === 0) {
      return { text: '0', className: 'text-gray-500' }
    }
    const sign = value > 0 ? '+' : '-'
    const absVal = Math.abs(value)
    const text = `${sign}${absVal.toLocaleString()}`
    return { text, className: getProfitColorClass(value) }
  }

  // ---------- Decision 구간 계산 ----------
  const getDecisionInfo = (
    avgPrice: number,
    currentPrice?: number,
  ): { label: string; className: string } => {
    if (!avgPrice || !currentPrice) {
      return {
        label: '-',
        className: 'bg-gray-50 text-gray-500',
      }
    }

    const diffRate =
      ((currentPrice - avgPrice) / avgPrice) * 100

    if (diffRate < -5) {
      return {
        label: 'Drop',
        className:
          'bg-blue-100 text-blue-700 font-semibold',
      }
    }
    if (diffRate < -3) {
      return {
        label: 'Ready',
        className:
          'bg-amber-100 text-amber-700 font-semibold',
      }
    }
    if (diffRate <= 3) {
      return {
        label: 'Keep',
        className:
          'bg-gray-100 text-gray-800 font-semibold',
      }
    }
    if (diffRate < 5) {
      return {
        label: 'Sell1',
        className:
          'bg-pink-100 text-pink-700 font-semibold',
      }
    }
    return {
      label: 'Sell2',
      className: 'bg-red-200 text-red-700 font-semibold',
    }
  }

  // ---------- 정렬 ----------
  const sortedRows = [...rows]
    .filter((r) => !r.isSold)
    .sort((a, b) => {
      if (a.isRealBuy !== b.isRealBuy) {
        return a.isRealBuy ? -1 : 1
      }
      return 0
    })

  // ---------- 렌더링 ----------
  return (
    <div className="flex flex-col gap-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">
            Strategy – 매수 전략 관리
          </h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">
            평균단가와 주수를 기준으로 Drop/Ready/Keep/Sell1/Sell2
            구간과 수익률, 수익 예상을 카드형으로 보여줍니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm sm:text-base font-medium text-gray-700"
            onClick={() =>
              setIsAutoRefresh((prev) => !prev)
            }
          >
            자동 새로고침:{' '}
            <span
              className={
                isAutoRefresh
                  ? 'text-emerald-600'
                  : 'text-gray-500'
              }
            >
              {isAutoRefresh ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm sm:text-base font-medium text-gray-700"
            onClick={() => {
              void handleRefreshOnceClick()
            }}
          >
            수동 새로고침
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm sm:text-base text-red-700">
          {errorMsg}
        </div>
      )}

      {isInitialLoading ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm sm:text-base text-gray-500 shadow-sm">
          전략 데이터를 불러오는 중입니다...
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-md border border-gray-200 bg-white px-3 py-4 text-center text-sm sm:text-base text-gray-500 shadow-sm">
          아직 Strategy에 표시할 종목이 없습니다. Now 화면에서 종목을 등록하고,
          매도완료되지 않은 종목만 이곳에 나타납니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedRows.map((row) => {
            const {
              avgPrice,
              quantity,
              currentPrice,
              openPrice,
              highPrice,
              lowPrice,
              targetPrice,
              buyDate,
            } = row

            const investment =
              avgPrice && quantity ? avgPrice * quantity : 0
            const evalAmount =
              currentPrice && quantity
                ? currentPrice * quantity
                : 0
            const profit = evalAmount - investment
            const profitRate =
              investment > 0
                ? (evalAmount / investment - 1) * 100
                : undefined

            const dropPrice = avgPrice ? avgPrice * 0.95 : 0
            const readyPrice = avgPrice ? avgPrice * 0.97 : 0
            const sell1Price = avgPrice ? avgPrice * 1.03 : 0
            const sell2Price = avgPrice ? avgPrice * 1.05 : 0

            const {
              text: profitRateText,
              className: profitRateClass,
            } = formatPercent(profitRate)

            const {
              text: profitSignedText,
              className: profitSignedClass,
            } = formatSignedProfit(profit)

            const decisionInfo = getDecisionInfo(
              avgPrice,
              currentPrice,
            )

            let currentPriceClass = 'text-gray-900'
            if (avgPrice && currentPrice) {
              if (currentPrice > avgPrice)
                currentPriceClass = 'text-red-600'
              else if (currentPrice < avgPrice)
                currentPriceClass = 'text-blue-600'
            }

            const {
              text: changeRateText,
              className: changeRateClass,
            } = formatPercent(row.changeRate)

            const hasTarget =
              targetPrice && !Number.isNaN(targetPrice)
            const targetEval =
              hasTarget && quantity
                ? Number(targetPrice) * quantity
                : 0
            const simProfit =
              targetEval && investment
                ? targetEval - investment
                : 0
            const simProfitRate =
              investment > 0 && targetEval > 0
                ? (targetEval / investment - 1) * 100
                : undefined
            const {
              text: simProfitRateText,
              className: simProfitRateClass,
            } = formatPercent(simProfitRate)
            const {
              text: simProfitText,
              className: simProfitClass,
            } = formatSignedProfit(simProfit)

            return (
              <div
                key={row.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm text-sm sm:text-base"
              >
                {/* 헤더 영역 */}
                <div className="flex flex-col gap-2">
                  {/* 1행: 전략 라벨 + 체크박스들 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-[2px] text-xs sm:text-sm ${decisionInfo.className}`}
                      >
                        {decisionInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs sm:text-sm">
                      <label className="inline-flex items-center gap-1 text-gray-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={row.isRealBuy}
                          disabled
                        />
                        <span>실매수</span>
                      </label>
                      <label className="inline-flex items-center gap-1 text-gray-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={row.isSold}
                          disabled={isMutating}
                          onChange={() => {
                            void handleToggleSold(row)
                          }}
                        />
                        <span>매도완료</span>
                      </label>
                    </div>
                  </div>

                  {/* 2행: 종목명 + 매수일 + 코드 (👉 여기서 종목명 오른쪽에 매수일) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg sm:text-xl font-semibold">
                      {row.name}
                    </span>
                    {buyDate && (
                      <span className="rounded-full bg-gray-100 px-2 py-[2px] text-[11px] sm:text-xs text-gray-700">
                        매수일 {formatDate(buyDate)}
                      </span>
                    )}

                  </div>

                  {/* 3행: 등락률 + 매도일 */}
                  <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-600">
                    <span className={changeRateClass}>
                      등락률 {changeRateText}
                    </span>
                    {row.soldAt && (
                      <span className="rounded-full bg-gray-100 px-2 py-[2px] text-xs text-gray-700">
                        매도일 {formatDate(row.soldAt)}
                      </span>
                    )}
                  </div>
                </div>

                {/* 현재가 / 시가 / 고가 / 저가 + 수익률/수익금액/투자/평가 */}
                <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                  <div className="col-span-2 flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      현재가 / 시가 / 고가 / 저가
                    </span>
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className={currentPriceClass}>
                        {formatNumber(currentPrice)}
                      </span>
                      <span className="text-xs text-gray-500">
                        시 {formatNumber(openPrice)} / 고{' '}
                        {formatNumber(highPrice)} / 저{' '}
                        {formatNumber(lowPrice)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      수익률
                    </span>
                    <span className={profitRateClass}>
                      {profitRateText}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      수익금액
                    </span>
                    <span className={profitSignedClass}>
                      {profitSignedText}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      투자원금
                    </span>
                    <span>
                      {investment
                        ? formatNumber(investment)
                        : '-'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-500">
                      평가금액
                    </span>
                    <span>
                      {evalAmount
                        ? formatNumber(evalAmount)
                        : '-'}
                    </span>
                  </div>
                </div>

                {/* 전략 구간 */}
                <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 text-xs sm:text-sm">
                  <div className="flex items-center justify_between gap-2">
                    <span className="text-xs font-semibold text-gray-600">
                      전략 구간 (Drop / Ready / Sell1 / Sell2)
                    </span>
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-[2px] text-xs text-gray-700">
                      {decisionInfo.label}
                    </span>
                  </div>
                  {avgPrice ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-blue-50 px-2 py-[2px] text-xs text-blue-700">
                        D {formatNumber(dropPrice, 0)}
                      </span>
                      <span className="rounded-full bg-amber-50 px-2 py-[2px] text-xs text-amber-700">
                        R {formatNumber(readyPrice, 0)}
                      </span>
                      <span className="rounded-full bg-pink-50 px-2 py-[2px] text-xs text-pink-700">
                        S1 {formatNumber(sell1Price, 0)}
                      </span>
                      <span className="rounded-full bg-red-50 px-2 py-[2px] text-xs text-red-700">
                        S2 {formatNumber(sell2Price, 0)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs sm:text-sm text-gray-400">
                      평균단가를 입력하면 전략 구간이 계산됩니다.
                    </span>
                  )}
                </div>

                {/* 수익 예상 */}
                <div className="rounded-lg bg-gray-50 p-3 text-xs sm:text-sm">
                  <div className="mb-2 text-xs font-semibold text-gray-600">
                    수익 예상
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        목표 단가
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-full rounded border px-2 py-1 text-right text-xs sm:text-sm"
                        value={formatInputNumber(Number(targetPrice ?? 0))}
                        onChange={(e) =>
                          handleFieldChange(
                            row.id,
                            'targetPrice',
                            e.target.value,
                          )
                        }
                        onBlur={() => {
                          void handleFieldBlur(row.id)
                        }}
                      />
                    </label>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        수익률
                      </span>
                      <div className="w-full rounded border bg-white px-2 py-1 text-right">
                        <span className={simProfitRateClass}>
                          {hasTarget
                            ? simProfitRateText
                            : '-'}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        수익금액
                      </span>
                      <div className="w-full rounded border bg-white px-2 py-1 text-right">
                        <span className={simProfitClass}>
                          {hasTarget
                            ? simProfitText
                            : '0'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 매수 정보 */}
                <div className="rounded-lg bg-gray-50 p-3 text-xs sm:text-sm">
                  <div className="mb-2 text-xs font-semibold text-gray-600">
                    매수 정보
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        평균단가
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-full rounded border px-2 py-1 text-right text-xs sm:text-sm"
                        value={formatInputNumber(row.avgPrice)}
                        onChange={(e) =>
                          handleFieldChange(
                            row.id,
                            'avgPrice',
                            e.target.value,
                          )
                        }
                        onBlur={() => {
                          void handleFieldBlur(row.id)
                        }}
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-500">
                        주수
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="w-full rounded border px-2 py-1 text-right text-xs sm:text-sm"
                        value={formatInputNumber(row.quantity)}
                        onChange={(e) =>
                          handleFieldChange(
                            row.id,
                            'quantity',
                            e.target.value,
                          )
                        }
                        onBlur={() => {
                          void handleFieldBlur(row.id)
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

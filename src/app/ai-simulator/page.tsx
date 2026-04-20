'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, Target, Trophy, XCircle, Calendar, RefreshCw } from 'lucide-react'

type SimulatorItem = {
  id: number
  recommend_date: string
  code: string
  name: string
  reason_summary: string | null
  entry_price: number
  target_price: number
  current_price: number | null
  reached_target: boolean
  reached_date: string | null
  max_high_after_recommend: number | null
  current_return_rate: number | null
  sample_days: number
}

type SimulatorResponse = {
  total: number
  reached: number
  success_rate: number
  items: SimulatorItem[]
  error?: string
}

const todayIso = new Date().toISOString().slice(0, 10)

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return value.toLocaleString()
}

function formatPercent(value: number | null | undefined): { text: string; className: string } {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return { text: '-', className: 'text-gray-500' }
  }
  const sign = value > 0 ? '+' : ''
  const className = value > 0 ? 'text-red-600' : value < 0 ? 'text-blue-600' : 'text-gray-500'
  return { text: `${sign}${value.toFixed(2)}%`, className }
}

export default function AISimulatorPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })
  const [toDate, setToDate] = useState(todayIso)
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [result, setResult] = useState<SimulatorResponse | null>(null)

  const fetchSimulation = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
      })
      params.set('limit', '40')
      const res = await fetch(`/api/ai-simulator?${params.toString()}`)
      const data = (await res.json()) as SimulatorResponse
      if (!res.ok) {
        throw new Error(data.error ?? 'AI Simulator 조회 실패')
      }
      setResult(data)
    } catch (error) {
      console.error(error)
      setErrorMsg('AI Simulator 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchSimulation()
  }, [])

  const sortedItems = useMemo(() => {
    const list = result?.items ?? []
    return [...list].sort((a, b) => {
      if (a.reached_target !== b.reached_target) return a.reached_target ? -1 : 1
      return b.recommend_date.localeCompare(a.recommend_date)
    })
  }, [result])

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-20">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Bot className="h-6 w-6 text-indigo-600" />
            AI Simulator
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            AI 추천 종목의 추천가 대비 +3% 도달 성과를 시뮬레이션으로 확인합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-600">
            시작일
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 block rounded border px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            종료일
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 block rounded border px-2 py-1 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              void fetchSimulation()
            }}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            조회
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="text-xs text-gray-500">총 추천 건수</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">
            {result?.total ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-1 text-xs text-emerald-700">
            <Trophy className="h-4 w-4" />
            목표가 도달
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {result?.reached ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <div className="flex items-center gap-1 text-xs text-indigo-700">
            <Target className="h-4 w-4" />
            성공률
          </div>
          <div className="mt-1 text-2xl font-bold text-indigo-700">
            {result ? `${result.success_rate.toFixed(1)}%` : '0.0%'}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-100 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">추천일</th>
              <th className="px-3 py-2">종목</th>
              <th className="px-3 py-2 text-right">추천가</th>
              <th className="px-3 py-2 text-right">도달 기준가(+3%)</th>
              <th className="px-3 py-2 text-right">현재가</th>
              <th className="px-3 py-2 text-right">현재수익률</th>
              <th className="px-3 py-2 text-right">이후 최고가</th>
              <th className="px-3 py-2">도달 여부</th>
              <th className="px-3 py-2">도달일</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                  데이터를 불러오는 중입니다...
                </td>
              </tr>
            ) : sortedItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                  기간 내 추천 데이터가 없습니다.
                </td>
              </tr>
            ) : (
              sortedItems.map((item) => {
                const currentRate = formatPercent(item.current_return_rate)
                return (
                  <tr key={item.id} className="border-t">
                    <td className="px-3 py-2">{item.recommend_date}</td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.code}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(item.entry_price)}</td>
                    <td className="px-3 py-2 text-right text-red-600">
                      {formatNumber(item.target_price)}
                    </td>
                    <td className="px-3 py-2 text-right">{formatNumber(item.current_price)}</td>
                    <td className={`px-3 py-2 text-right ${currentRate.className}`}>
                      {currentRate.text}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(item.max_high_after_recommend)}
                    </td>
                    <td className="px-3 py-2">
                      {item.reached_target ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                          <Trophy className="h-3.5 w-3.5" />
                          성공
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
                          <XCircle className="h-3.5 w-3.5" />
                          미도달
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {item.reached_date ? (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-700">
                          <Calendar className="h-3.5 w-3.5 text-gray-500" />
                          {item.reached_date}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

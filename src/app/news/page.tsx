// src/app/news/page.tsx
'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Sentiment = 'positive' | 'negative' | 'neutral'

type NewsItem = {
  id: string
  code: string
  name: string
  title: string
  link: string
  description: string | null
  provider: string | null
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

type ActiveStock = {
  code: string
  name: string
}

type TrendStock = {
  code: string
  name: string
}

type TrendSeriesRow = {
  date: string
  [code: string]: string | number
}

type ViewMode = 'byStock' | 'byDate'

// 🔹 상단 추이 차트: 최대 표시 종목 수 (너무 많으면 복잡해지므로 5개까지만 시각화)
const MAX_TREND_SERIES = 5

// 🔹 모던 블루–그린 계열 팔레트 (가시성 좋은 하이콘트라스트)
const trendSeriesColors = [
  '#4F46E5', // Indigo 600
  '#0EA5E9', // Sky 500
  '#10B981', // Emerald 500
  '#F59E0B', // Amber 500
  '#EF4444', // Red 500
  '#6366F1', // Indigo 500
]

// 🔹 종목별 카드 구분용 팔레트 (뉴스 목록 종목별 보기에서 사용)
const stockSectionColors = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F97316',
  '#EC4899',
  '#6366F1',
  '#22C55E',
]

function formatYmd(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export default function NewsPage() {
  const [stocks, setStocks] = useState<ActiveStock[]>([])
  const [selectedCode, setSelectedCode] = useState<string>('ALL')

  const today = useMemo(() => formatYmd(new Date()), [])

  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')

  const [items, setItems] = useState<NewsItem[]>([])
  const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false)

  // 상단 30일 추이용
  const [trendStocks, setTrendStocks] = useState<TrendStock[]>([])
  const [trendSeries, setTrendSeries] = useState<TrendSeriesRow[]>([])
  const [isLoadingTrend, setIsLoadingTrend] = useState(false)

  // 즉시 수집 버튼 상태
  const [isCollecting, setIsCollecting] = useState(false)

  // 🔹 뉴스 리스트 보기 모드: 기본값 = 종목별
  const [viewMode, setViewMode] = useState<ViewMode>('byStock')

  // 1) 최초 진입 시: 보유 종목 리스트 불러오기 + 기본 날짜 3일 세팅
  useEffect(() => {
    const loadStocks = async () => {
      try {
        const res = await fetch('/api/news/active-stocks')
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
          }
          throw new Error(data.error ?? '보유 종목 조회에 실패했습니다.')
        }
        const data = (await res.json()) as { stocks: ActiveStock[] }
        const list = data.stocks ?? []
        setStocks(list)

        // 🔸 기본: 전체 + 최근 3일 (오늘 포함 3일치)
        setSelectedCode('ALL')

        const now = new Date()
        const threeDaysAgo = new Date()
        threeDaysAgo.setDate(now.getDate() - 2) // today, today-1, today-2 = 3일

        setFrom(formatYmd(threeDaysAgo))
        setTo(formatYmd(now))
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err)
        setErrorMsg(
          err instanceof Error ? err.message : '보유 종목 조회 중 오류가 발생했습니다.'
        )
      }
    }

    void loadStocks()
  }, [])

  // 2) 상단 30일 추이 데이터 로드
  const loadTrend = async () => {
    setIsLoadingTrend(true)
    try {
      const res = await fetch('/api/news/trend')
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(data.error ?? '뉴스 추이 조회에 실패했습니다.')
      }
      const data = (await res.json()) as {
        stocks: TrendStock[]
        series: TrendSeriesRow[]
      }
      setTrendStocks(data.stocks ?? [])
      setTrendSeries(data.series ?? [])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
    } finally {
      setIsLoadingTrend(false)
    }
  }

  useEffect(() => {
    void loadTrend()
  }, [])

  const fetchNews = async (code: string, fromDate: string, toDate: string) => {
    setIsLoading(true)
    setErrorMsg(null)

    try {
      const params = new URLSearchParams()
      if (code !== 'ALL') {
        params.set('code', code)
      }
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)

      const res = await fetch(`/api/news/summary?${params.toString()}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(data.error ?? '뉴스 조회에 실패했습니다.')
      }

      const data = (await res.json()) as {
        items: NewsItem[]
        dailyCounts: DailyCount[]
      }

      setItems(data.items ?? [])
      setDailyCounts(data.dailyCounts ?? [])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      setErrorMsg(
        err instanceof Error ? err.message : '뉴스 조회 중 오류가 발생했습니다.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  // 3) 최초 한 번: 전체 + 최근 3일 자동 조회
  useEffect(() => {
    if (!from || !to || hasLoadedInitial) return

    const autoLoad = async () => {
      await fetchNews('ALL', from, to)
      setHasLoadedInitial(true)
    }

    void autoLoad()
  }, [from, to, hasLoadedInitial])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const effectiveFrom = from || today
    const effectiveTo = to || today
    await fetchNews(selectedCode, effectiveFrom, effectiveTo)
  }

  const selectedStockLabel = useMemo(() => {
    if (selectedCode === 'ALL') return '전체 (보유 종목 모두)'
    const s = stocks.find((st) => st.code === selectedCode)
    return s ? `${s.name} (${s.code})` : ''
  }, [stocks, selectedCode])

  const handleCollectNow = async () => {
    setIsCollecting(true)
    try {
      const res = await fetch('/api/news/collect-my', {
        method: 'POST',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string
        }
        throw new Error(data.error ?? '뉴스 수집에 실패했습니다.')
      }

      // 수집 성공 후: 추이 + 리스트 다시 로드
      const effectiveFrom = from || today
      const effectiveTo = to || today
      await Promise.all([
        fetchNews(selectedCode, effectiveFrom, effectiveTo),
        loadTrend(),
      ])
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err)
      setErrorMsg(
        err instanceof Error ? err.message : '뉴스 수집 중 오류가 발생했습니다.'
      )
    } finally {
      setIsCollecting(false)
    }
  }

  // 🔹 종목 선택 버튼(칩) 렌더링
  const renderStockChips = () => {
    const allButton = (
      <button
        key="ALL"
        type="button"
        onClick={() => setSelectedCode('ALL')}
        className={[
          'inline-flex items-center rounded-full border px-3 py-1 text-xs md:text-sm',
          'transition-colors',
          selectedCode === 'ALL'
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
        ].join(' ')}
      >
        전체
      </button>
    )

    const stockButtons = stocks.map((s) => {
      const active = selectedCode === s.code
      return (
        <button
          key={s.code}
          type="button"
          onClick={() => setSelectedCode(s.code)}
          className={[
            'inline-flex items-center rounded-full border px-3 py-1 text-xs md:text-sm',
            'transition-colors',
            active
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          ].join(' ')}
        >
          <span className="mr-1 text-[10px] font-mono text-slate-400">{s.code}</span>
          <span className="font-medium">{s.name}</span>
        </button>
      )
    })

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {allButton}
        {stockButtons}
      </div>
    )
  }

  // 🔹 뉴스 리스트: 종목별 그룹 / 일자별 그룹
  const groupedByStock = useMemo(() => {
    const map = new Map<string, { stock: string; code: string; items: NewsItem[] }>()
    for (const item of items) {
      const key = item.code
      const existing = map.get(key) ?? {
        stock: item.name,
        code: item.code,
        items: [],
      }
      existing.items.push(item)
      map.set(key, existing)
    }

    const groups = Array.from(map.values())
    // 종목명 오름차순
    groups.sort((a, b) => a.stock.localeCompare(b.stock, 'ko'))
    // 각 그룹 내에서는 최신순
    groups.forEach((g) =>
      g.items.sort((a, b) => {
        const ta = a.published_at ? new Date(a.published_at).getTime() : 0
        const tb = b.published_at ? new Date(b.published_at).getTime() : 0
        return tb - ta
      })
    )
    return groups
  }, [items])

  const groupedByDate = useMemo(() => {
    const map = new Map<string, { date: string; items: NewsItem[] }>()
    for (const item of items) {
      if (!item.published_at) continue
      const d = new Date(item.published_at)
      if (Number.isNaN(d.getTime())) continue

      const key = formatYmd(d)

      const existing = map.get(key) ?? { date: key, items: [] }
      existing.items.push(item)
      map.set(key, existing)
    }

    const groups = Array.from(map.values())
    // 날짜 내림차순(최근일 먼저)
    groups.sort((a, b) => b.date.localeCompare(a.date))
    // 각 날짜 내에서는 시간 내림차순
    groups.forEach((g) =>
      g.items.sort((a, b) => {
        const ta = a.published_at ? new Date(a.published_at).getTime() : 0
        const tb = b.published_at ? new Date(b.published_at).getTime() : 0
        return tb - ta
      })
    )
    return groups
  }, [items])

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* 헤더 + 즉시 수집 버튼 */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">종목 뉴스 모니터링 (네이버 뉴스)</h1>
          <p className="mt-1 text-xs text-slate-500">
            보유 종목 기준으로 네이버 뉴스를 자동 수집하고, 기간·종목별로 추이를 확인할 수
            있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCollectNow}
          disabled={isCollecting}
          className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm disabled:opacity-60"
        >
          {isCollecting ? '수집 중…' : '뉴스 즉시 수집'}
        </button>
      </div>

      {/* 상단: 최근 30일 종목별 뉴스 추이 그래프 */}
      <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">최근 30일 보유 종목별 뉴스 추이</h2>
          {isLoadingTrend && (
            <span className="text-xs text-slate-400">로딩 중…</span>
          )}
        </div>
        {trendSeries.length > 0 && trendStocks.length > 0 ? (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trendSeries}
                margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
                barSize={18}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fontWeight: 500, fill: '#4b5563' }}
                  tickMargin={10}
                  minTickGap={12}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fontWeight: 500, fill: '#4b5563' }}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    borderColor: '#e5e7eb',
                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.08)',
                  }}
                  labelStyle={{ fontWeight: 600, color: '#111827' }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="circle"
                  verticalAlign="top"
                  height={24}
                />
                {trendStocks.slice(0, MAX_TREND_SERIES).map((s, index) => (
                  <Bar
                    key={s.code}
                    dataKey={s.code}
                    name={`${s.name} (${s.code})`}
                    fill={trendSeriesColors[index % trendSeriesColors.length]}
                    radius={[6, 6, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            최근 30일 내에 집계된 뉴스가 없거나, 보유 중인 종목이 없습니다.
          </p>
        )}
      </div>

      {/* 🔹 필터 영역: 1) 보유 종목 선택 섹션 / 2) 날짜 조회 조건 섹션 분리 */}
      <div className="mb-4 space-y-4">
        {/* 1) 보유 종목 선택 섹션 */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">보유 종목 선택</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                전체 또는 특정 종목을 선택하면, 아래 조회 결과 및 뉴스 목록에 반영됩니다.
              </p>
            </div>
            {selectedStockLabel && (
              <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500">
                선택됨: {selectedStockLabel}
              </span>
            )}
          </div>
          {renderStockChips()}
        </section>

        {/* 2) 날짜 조회 조건 섹션 (폼) */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border bg-white p-4 shadow-sm"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">날짜 조회 조건</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                기준 일자를 지정해서 선택된 종목(또는 전체)의 뉴스/감성 추이를 조회합니다.
              </p>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  시작일
                </label>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  종료일
                </label>
                <input
                  type="date"
                  className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs md:text-sm font-medium text-white shadow-sm disabled:opacity-50"
              >
                {isLoading ? '조회 중…' : '조건으로 조회'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* 기간 내 뉴스 건수 + 감성 그래프 (선택된 대상 기준) */}
      {dailyCounts.length > 0 && (
        <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">
            기간별 뉴스 건수 (선택된 대상)
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    borderColor: '#e5e7eb',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="positive"
                  stackId="a"
                  name="긍정"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="neutral"
                  stackId="a"
                  name="중립"
                  fill="#cbd5f5"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="negative"
                  stackId="a"
                  name="부정"
                  fill="#fb7185"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 뉴스 리스트: 종목별 / 일자별 토글 */}
      {items.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">뉴스 목록</h2>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('byDate')}
                className={[
                  'px-3 py-1 rounded-full transition-colors',
                  viewMode === 'byDate'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500',
                ].join(' ')}
              >
                일자별
              </button>
              <button
                type="button"
                onClick={() => setViewMode('byStock')}
                className={[
                  'px-3 py-1 rounded-full transition-colors',
                  viewMode === 'byStock'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500',
                ].join(' ')}
              >
                종목별
              </button>
            </div>
          </div>

          {viewMode === 'byDate' ? (
            // 🔹 일자별 보기
            <div className="space-y-4">
              {groupedByDate.map((group) => (
                <section key={group.date}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">
                    {group.date}
                  </h3>
                  <ul className="space-y-2">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:border-slate-300 hover:bg-slate-50"
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-mono text-white">
                              {item.code}
                            </span>
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium hover:underline"
                            >
                              {item.title}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            {item.published_at && (
                              <span>
                                {new Date(item.published_at).toLocaleTimeString()}
                              </span>
                            )}
                            {item.sentiment && (
                              <span className={sentimentClassName(item.sentiment)}>
                                {sentimentLabel(item.sentiment)}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.description && (
                          <p className="text-xs text-slate-700">{item.description}</p>
                        )}
                        <div className="mt-1 text-[11px] text-slate-400">
                          {item.provider && <span>{item.provider}</span>}
                          <span className="ml-2 text-slate-300">|</span>
                          <span className="ml-2">
                            {item.name} ({item.code})
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            // 🔹 종목별 보기 — 종목 카드마다 색으로 구분
            <div className="space-y-4">
              {groupedByStock.map((group, index) => {
                const color = stockSectionColors[index % stockSectionColors.length]
                return (
                  <section
                    key={group.code}
                    className="rounded-2xl border bg-white p-3 md:p-4 shadow-sm"
                    style={{
                      borderLeftWidth: 4,
                      borderLeftColor: color,
                      borderColor: '#e5e7eb',
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-800">
                        {group.stock}{' '}
                        <span className="text-[11px] text-slate-500">({group.code})</span>
                      </h3>
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          backgroundColor: `${color}1a`, // 약간 투명
                          color: '#111827',
                        }}
                      >
                        {group.items.length}건
                      </span>
                    </div>
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <li
                          key={item.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm hover:border-slate-300 hover:bg-slate-50"
                          style={{
                            borderLeftWidth: 3,
                            borderLeftColor: color,
                          }}
                        >
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <a
                                href={item.link}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium hover:underline"
                              >
                                {item.title}
                              </a>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              {item.published_at && (
                                <span>
                                  {new Date(item.published_at).toLocaleString()}
                                </span>
                              )}
                              {item.sentiment && (
                                <span className={sentimentClassName(item.sentiment)}>
                                  {sentimentLabel(item.sentiment)}
                                </span>
                              )}
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-xs text-slate-700">{item.description}</p>
                          )}
                          <div className="mt-1 text-[11px] text-slate-400">
                            {item.provider && <span>{item.provider}</span>}
                            <span className="ml-2 text-slate-300">|</span>
                            <span className="ml-2">
                              {item.name} ({item.code})
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!isLoading && !errorMsg && items.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          보유 종목 기준으로 최근 3일 뉴스가 자동 조회됩니다. 보유 종목이 없거나, 해당 기간에
          기사가 없다면 위 필터를 조정해서 다시 조회해보세요.
        </p>
      )}
    </div>
  )
}

function sentimentLabel(s: Sentiment): string {
  if (s === 'positive') return '긍정'
  if (s === 'negative') return '부정'
  return '중립'
}

function sentimentClassName(s: Sentiment): string {
  if (s === 'positive') {
    return 'rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 border border-blue-100'
  }
  if (s === 'negative') {
    return 'rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 border border-rose-100'
  }
  return 'rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 border border-slate-200'
}

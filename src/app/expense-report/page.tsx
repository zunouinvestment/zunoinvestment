// src/app/expense-report/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, Legend 
} from 'recharts'
import { TrendingUp, PieChart, Calendar, AlertCircle, Filter } from 'lucide-react'
import { ExpenseRecord } from '@/lib/expense/types'

// --- UI 컴포넌트 ---
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 md:p-6 ${className}`}>{children}</div>
}

export default function ExpenseReportPage() {
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)
  
  // 필터 상태
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL') // 'ALL' | '01' ... '12'
  const [reportMode, setReportMode] = useState<'transaction' | 'payment'>('transaction')

  // 데이터 로드
  useEffect(() => {
    const fetchExpenses = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/expenses?card=ALL') 
        const data = await res.json()
        if (Array.isArray(data)) {
          setExpenses(data)
        }
      } catch (e) {
        console.error('Failed to load expenses', e)
      } finally {
        setLoading(false)
      }
    }
    fetchExpenses()
  }, [])

  // --- 데이터 가공 ---
  const stats = useMemo(() => {
    if (!expenses.length) return null

    const targetDateKey = reportMode === 'transaction' ? 'transaction_date' : 'payment_date'
    
    // 1. 연도 & 월 필터링
    const filtered = expenses.filter(item => {
      const dateStr = item[targetDateKey]
      if (!dateStr) return false
      
      const [y, m] = dateStr.split('-') 
      
      const yearMatch = y === selectedYear
      const monthMatch = selectedMonth === 'ALL' || m === selectedMonth
      
      return yearMatch && monthMatch
    })

    // 2. 집계 (총액, 카테고리별)
    let totalAmount = 0
    const byCategory: Record<string, { name: string; value: number; color: string }> = {}

    filtered.forEach((item) => {
      totalAmount += item.amount
      
      // 대분류 기준 집계 (UI가 대분류 위주라면 parent_name 사용, 현재는 name(소분류) 사용 중이나 대분류로 변경 가능)
      // 여기서는 기존 로직 유지 (소분류 기준) 하되, 카테고리 색상은 DB에서 가져온 것 사용
      const catName = item.category?.name || '미분류'
      const catColor = item.category?.color || '#cbd5e1'
      
      if (!byCategory[catName]) {
        byCategory[catName] = { name: catName, value: 0, color: catColor }
      }
      byCategory[catName].value += item.amount
    })

    const categoryData = Object.values(byCategory).sort((a, b) => b.value - a.value)

    // 3. 차트용 데이터 (Bar Chart)
    let chartData: { name: string; value: number; fullDate?: string }[] = []

    if (selectedMonth === 'ALL') {
        // [월별 집계]
        const monthly: Record<string, number> = {}
        for (let i = 1; i <= 12; i++) {
            const mKey = i.toString().padStart(2, '0')
            monthly[mKey] = 0
        }
        
        filtered.forEach(item => {
            const dateStr = item[targetDateKey] as string
            const m = dateStr.split('-')[1]
            if (monthly[m] !== undefined) monthly[m] += item.amount
        })

        chartData = Object.entries(monthly).map(([m, val]) => ({
            name: `${Number(m)}월`,
            value: val
        }))

    } else {
        // [일별 집계]
        const daily: Record<string, number> = {}
        const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
        
        for (let i = 1; i <= lastDay; i++) {
            const dKey = i.toString().padStart(2, '0')
            daily[dKey] = 0
        }

        filtered.forEach(item => {
            const dateStr = item[targetDateKey] as string
            const d = dateStr.split('-')[2]
            if (daily[d] !== undefined) daily[d] += item.amount
        })

        chartData = Object.entries(daily).map(([d, val]) => ({
            name: `${Number(d)}일`,
            value: val
        }))
    }

    return { totalAmount, chartData, categoryData, count: filtered.length }
  }, [expenses, selectedYear, selectedMonth, reportMode])

  // 사용 가능한 연도 목록
  const availableYears = useMemo(() => {
    const years = new Set<string>()
    expenses.forEach(e => {
        if(e.transaction_date) years.add(e.transaction_date.substring(0, 4))
        if(e.payment_date) years.add(e.payment_date.substring(0, 4))
    })
    return Array.from(years).sort().reverse()
  }, [expenses])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500 text-sm">
        <div className="animate-pulse">데이터를 불러오는 중입니다...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">Consumption Report</h1>
            <p className="text-xs md:text-sm text-gray-500">나의 소비 패턴과 흐름을 한눈에 파악하세요.</p>
          </div>

          {/* 컨트롤 바 (모바일 최적화) */}
          <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-lg border shadow-sm text-xs md:text-sm">
            
            {/* 연도 선택 */}
            <div className="flex items-center gap-1 px-2 border-r">
                <span className="font-bold text-gray-500 uppercase hidden md:inline">Year</span>
                <select 
                    value={selectedYear}
                    onChange={(e) => {
                        setSelectedYear(e.target.value)
                        setSelectedMonth('ALL') 
                    }}
                    className="font-semibold bg-transparent outline-none cursor-pointer hover:text-blue-600 py-1"
                >
                    {availableYears.length > 0 ? (
                        availableYears.map(y => <option key={y} value={y}>{y}년</option>)
                    ) : (
                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}년</option>
                    )}
                </select>
            </div>

            {/* 월 선택 */}
            <div className="flex items-center gap-1 px-2 border-r">
                <span className="font-bold text-gray-500 uppercase hidden md:inline">Month</span>
                <select 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="font-semibold bg-transparent outline-none cursor-pointer hover:text-blue-600 py-1"
                >
                    <option value="ALL">전체 (1~12월)</option>
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString().padStart(2, '0')}>{m}월</option>
                    ))}
                </select>
            </div>

            {/* 기준 모드 (토글 버튼 스타일) */}
            <div className="flex bg-gray-100 p-0.5 rounded ml-auto md:ml-0">
                <button
                    onClick={() => setReportMode('transaction')}
                    className={`px-2 py-1 text-[10px] md:text-xs font-medium rounded transition-all ${reportMode === 'transaction' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                >
                    소비일
                </button>
                <button
                    onClick={() => setReportMode('payment')}
                    className={`px-2 py-1 text-[10px] md:text-xs font-medium rounded transition-all ${reportMode === 'payment' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                >
                    결제일
                </button>
            </div>
          </div>
        </div>

        {!stats || stats.count === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 md:py-20 text-gray-400">
            <AlertCircle className="w-8 h-8 md:w-10 md:h-10 mb-3 opacity-50" />
            <p className="text-sm">해당 기간에 데이터가 없습니다.</p>
            <p className="text-xs mt-1">Expense Tracker 메뉴에서 내역을 추가해주세요.</p>
          </Card>
        ) : (
          <div className="space-y-4 md:space-y-6">
            
            {/* 1. 핵심 지표 (Bento Grid: 모바일 2열, 데스크탑 4열) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <Card>
                    <div className="text-[10px] md:text-xs text-gray-500 mb-1 font-semibold uppercase">Total Expense</div>
                    <div className="text-lg md:text-2xl font-bold tracking-tight">{stats.totalAmount.toLocaleString()}원</div>
                    <div className="text-[10px] md:text-xs text-gray-400 mt-1">
                        {selectedMonth === 'ALL' ? `${selectedYear}년 누적` : `${selectedMonth}월 총 지출`}
                    </div>
                </Card>
                <Card>
                    <div className="text-[10px] md:text-xs text-gray-500 mb-1 font-semibold uppercase">
                        {selectedMonth === 'ALL' ? 'Monthly Avg' : 'Daily Avg'}
                    </div>
                    <div className="text-lg md:text-2xl font-bold tracking-tight">
                        {Math.round(stats.totalAmount / (selectedMonth === 'ALL' ? 12 : 30)).toLocaleString()}원
                    </div>
                    <div className="text-[10px] md:text-xs text-gray-400 mt-1">
                        {selectedMonth === 'ALL' ? '월 평균' : '일 평균 (단순)'}
                    </div>
                </Card>
                <Card>
                    <div className="text-[10px] md:text-xs text-gray-500 mb-1 font-semibold uppercase">Top Category</div>
                    <div className="text-lg md:text-2xl font-bold tracking-tight truncate">
                        {stats.categoryData[0]?.name || '-'}
                    </div>
                    <div className="text-[10px] md:text-xs text-gray-400 mt-1">
                        {stats.categoryData[0] 
                            ? `${Math.round((stats.categoryData[0].value / stats.totalAmount) * 100)}% 차지` 
                            : '-'}
                    </div>
                </Card>
                <Card>
                    <div className="text-[10px] md:text-xs text-gray-500 mb-1 font-semibold uppercase">Tx Count</div>
                    <div className="text-lg md:text-2xl font-bold tracking-tight">{stats.count.toLocaleString()}건</div>
                    <div className="text-[10px] md:text-xs text-gray-400 mt-1">결제 내역 수</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* 2. 지출 추이 차트 */}
                <Card className="min-h-[300px] md:min-h-[400px] flex flex-col">
                    <h3 className="font-bold text-base md:text-lg mb-4 md:mb-6 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-blue-500"/> 
                        {selectedMonth === 'ALL' ? '월별 지출 추이' : `${selectedMonth}월 일별 지출 추이`}
                    </h3>
                    <div className="flex-1 w-full text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                    dataKey="name" 
                                    tick={{fontSize: 11, fill: '#64748b'}} 
                                    axisLine={false} 
                                    tickLine={false}
                                    interval={selectedMonth === 'ALL' ? 0 : 'preserveStartEnd'} // 모바일에서 일별 축 겹침 방지
                                />
                                <YAxis 
                                    tick={{fontSize: 11, fill: '#64748b'}} 
                                    axisLine={false} 
                                    tickLine={false}
                                    tickFormatter={(val) => `${val/10000}만`} 
                                />
                                <RechartsTooltip 
                                    cursor={{fill: '#f1f5f9'}}
                                    formatter={(val: number) => [val.toLocaleString() + '원', '지출액']}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                />
                                <Bar dataKey="value" fill="#0f172a" radius={[4, 4, 0, 0]} maxBarSize={50} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 3. 카테고리별 비중 */}
                <Card className="min-h-[300px] md:min-h-[400px] flex flex-col">
                    <h3 className="font-bold text-base md:text-lg mb-4 md:mb-6 flex items-center gap-2">
                        <PieChart className="w-4 h-4 md:w-5 md:h-5 text-orange-500"/> 
                        {selectedMonth === 'ALL' ? '연간 카테고리 비중' : `${selectedMonth}월 카테고리 비중`}
                    </h3>
                    <div className="flex-1 w-full flex items-center justify-center text-xs">
                        <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                                <Pie
                                    data={stats.categoryData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                >
                                    {stats.categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <RechartsTooltip 
                                    formatter={(val: number) => val.toLocaleString() + '원'} 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: '12px' }}
                                />
                                <Legend 
                                    layout="vertical" 
                                    verticalAlign="middle" 
                                    align="right"
                                    wrapperStyle={{ fontSize: '11px', color: '#64748b' }}
                                />
                            </RePieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

             {/* 4. 카테고리 상세 테이블 */}
             <Card className="overflow-hidden p-0">
                <div className="p-4 md:p-6 border-b flex items-center gap-2">
                    <Calendar className="w-4 h-4 md:w-5 md:h-5 text-green-600"/> 
                    <h3 className="font-bold text-base md:text-lg">
                        {selectedMonth === 'ALL' ? `${selectedYear}년 카테고리 상세` : `${selectedMonth}월 카테고리 상세`}
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs md:text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 border-b">
                            <tr>
                                <th className="px-4 py-3 font-medium w-12">순위</th>
                                <th className="px-4 py-3 font-medium">카테고리</th>
                                <th className="px-4 py-3 font-medium text-right">금액</th>
                                <th className="px-4 py-3 font-medium text-right">비중</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {stats.categoryData.map((cat, idx) => (
                                <tr key={cat.name} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-500 text-center">{idx + 1}</td>
                                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                                        <span className="w-2 h-2 md:w-3 md:h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                                        {cat.name}
                                    </td>
                                    <td className="px-4 py-3 text-right">{cat.value.toLocaleString()}원</td>
                                    <td className="px-4 py-3 text-right text-gray-500">
                                        {((cat.value / stats.totalAmount) * 100).toFixed(1)}%
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

          </div>
        )}
      </motion.div>
    </div>
  )
}
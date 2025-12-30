// src/app/expense-report/page.tsx
'use client'

import { useEffect, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, 
  PieChart as RePieChart, Pie, Cell, Legend 
} from 'recharts'
import { TrendingUp, PieChart, Calendar, AlertCircle } from 'lucide-react'
import { ExpenseRecord } from '@/lib/expense/types'

// --- UI 컴포넌트 ---
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>{children}</div>
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
      
      const [y, m] = dateStr.split('-') // ["2024", "05", "15"]
      
      const yearMatch = y === selectedYear
      const monthMatch = selectedMonth === 'ALL' || m === selectedMonth
      
      return yearMatch && monthMatch
    })

    // 2. 집계 (총액, 카테고리별)
    let totalAmount = 0
    const byCategory: Record<string, { name: string; value: number; color: string }> = {}

    filtered.forEach((item) => {
      totalAmount += item.amount
      
      const catName = item.category?.name || '미분류'
      const catColor = item.category?.color || '#cbd5e1'
      
      if (!byCategory[catName]) {
        byCategory[catName] = { name: catName, value: 0, color: catColor }
      }
      byCategory[catName].value += item.amount
    })

    const categoryData = Object.values(byCategory).sort((a, b) => b.value - a.value)

    // 3. 차트용 데이터 (Bar Chart)
    // - 월 선택 안함('ALL'): "월별" 집계 (1월~12월)
    // - 월 선택 함('05'): "일별" 집계 (1일~31일)
    let chartData: { name: string; value: number; fullDate?: string }[] = []

    if (selectedMonth === 'ALL') {
        // [월별 집계]
        const monthly: Record<string, number> = {}
        // 1~12월 초기화
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
        // 해당 월의 마지막 날 계산
        const lastDay = new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
        
        // 1~말일 초기화
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
      <div className="flex h-64 items-center justify-center text-gray-500">
        <div className="animate-pulse">데이터를 불러오는 중입니다...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Consumption Report</h1>
            <p className="text-sm text-gray-500">나의 소비 패턴과 흐름을 한눈에 파악하세요.</p>
          </div>

          {/* 컨트롤 바 */}
          <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-lg border shadow-sm">
            
            {/* 연도 선택 */}
            <div className="flex items-center gap-2 px-2 border-r pr-4">
                <span className="text-xs font-bold text-gray-500 uppercase">Year</span>
                <select 
                    value={selectedYear}
                    onChange={(e) => {
                        setSelectedYear(e.target.value)
                        setSelectedMonth('ALL') // 연도 변경 시 월 초기화
                    }}
                    className="text-sm font-semibold bg-transparent outline-none cursor-pointer hover:text-blue-600"
                >
                    {availableYears.length > 0 ? (
                        availableYears.map(y => <option key={y} value={y}>{y}년</option>)
                    ) : (
                        <option value={new Date().getFullYear()}>{new Date().getFullYear()}년</option>
                    )}
                </select>
            </div>

            {/* 월 선택 */}
            <div className="flex items-center gap-2 px-2 border-r pr-4">
                <span className="text-xs font-bold text-gray-500 uppercase">Month</span>
                <select 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-sm font-semibold bg-transparent outline-none cursor-pointer hover:text-blue-600"
                >
                    <option value="ALL">전체 (1~12월)</option>
                    {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                        <option key={m} value={m.toString().padStart(2, '0')}>{m}월</option>
                    ))}
                </select>
            </div>

            {/* 기준 모드 */}
            <div className="flex bg-gray-100 p-1 rounded">
                <button
                    onClick={() => setReportMode('transaction')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all ${reportMode === 'transaction' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                >
                    소비일
                </button>
                <button
                    onClick={() => setReportMode('payment')}
                    className={`px-3 py-1 text-xs font-medium rounded transition-all ${reportMode === 'payment' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                >
                    결제일
                </button>
            </div>
          </div>
        </div>

        {!stats || stats.count === 0 ? (
          <Card className="flex flex-col items-center justify-center py-20 text-gray-400">
            <AlertCircle className="w-10 h-10 mb-4 opacity-50" />
            <p>해당 기간에 데이터가 없습니다.</p>
            <p className="text-sm mt-1">Expense Tracker 메뉴에서 내역을 업로드해주세요.</p>
          </Card>
        ) : (
          <div className="space-y-6">
            
            {/* 1. 핵심 지표 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card>
                    <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Total Expense</div>
                    <div className="text-2xl font-bold tracking-tight">{stats.totalAmount.toLocaleString()}원</div>
                    <div className="text-xs text-gray-400 mt-2">
                        {selectedMonth === 'ALL' ? `${selectedYear}년 누적` : `${selectedMonth}월 총 지출`}
                    </div>
                </Card>
                <Card>
                    <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">
                        {selectedMonth === 'ALL' ? 'Monthly Avg' : 'Daily Avg'}
                    </div>
                    <div className="text-2xl font-bold tracking-tight">
                        {Math.round(stats.totalAmount / (selectedMonth === 'ALL' ? 12 : 30)).toLocaleString()}원
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                        {selectedMonth === 'ALL' ? '월 평균' : '일 평균 (단순)'}
                    </div>
                </Card>
                <Card>
                    <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Top Category</div>
                    <div className="text-2xl font-bold tracking-tight truncate">
                        {stats.categoryData[0]?.name || '-'}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">
                        {stats.categoryData[0] 
                            ? `${Math.round((stats.categoryData[0].value / stats.totalAmount) * 100)}% 차지` 
                            : '데이터 없음'}
                    </div>
                </Card>
                <Card>
                    <div className="text-xs text-gray-500 mb-1 font-semibold uppercase">Tx Count</div>
                    <div className="text-2xl font-bold tracking-tight">{stats.count.toLocaleString()}건</div>
                    <div className="text-xs text-gray-400 mt-2">결제 내역 수</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 2. 지출 추이 차트 (월별/일별 동적) */}
                <Card className="min-h-[400px] flex flex-col">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500"/> 
                        {selectedMonth === 'ALL' ? '월별 지출 추이' : `${selectedMonth}월 일별 지출 추이`}
                    </h3>
                    <div className="flex-1 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis 
                                    dataKey="name" 
                                    tick={{fontSize: 12, fill: '#64748b'}} 
                                    axisLine={false} 
                                    tickLine={false}
                                    interval={selectedMonth === 'ALL' ? 0 : 4} // 일별일 땐 간격 조정
                                />
                                <YAxis 
                                    tick={{fontSize: 12, fill: '#64748b'}} 
                                    axisLine={false} 
                                    tickLine={false}
                                    tickFormatter={(val) => `${val/10000}만`} 
                                />
                                <RechartsTooltip 
                                    cursor={{fill: '#f1f5f9'}}
                                    formatter={(val: number) => [val.toLocaleString() + '원', '지출액']}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="value" fill="#0f172a" radius={[4, 4, 0, 0]} barSize={selectedMonth === 'ALL' ? 40 : 10} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>

                {/* 3. 카테고리별 비중 */}
                <Card className="min-h-[400px] flex flex-col">
                    <h3 className="font-bold text-lg mb-6 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-orange-500"/> 
                        {selectedMonth === 'ALL' ? '연간 카테고리 비중' : `${selectedMonth}월 카테고리 비중`}
                    </h3>
                    <div className="flex-1 w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <RePieChart>
                                <Pie
                                    data={stats.categoryData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={80}
                                    outerRadius={120}
                                    paddingAngle={2}
                                >
                                    {stats.categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                                    ))}
                                </Pie>
                                <RechartsTooltip formatter={(val: number) => val.toLocaleString() + '원'} />
                                <Legend 
                                    layout="vertical" 
                                    verticalAlign="middle" 
                                    align="right"
                                    wrapperStyle={{ fontSize: '12px', color: '#64748b' }}
                                />
                            </RePieChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

             {/* 4. 카테고리 상세 테이블 */}
             <Card>
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-green-600"/> 
                    {selectedMonth === 'ALL' ? `${selectedYear}년 카테고리 상세` : `${selectedMonth}월 카테고리 상세`}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 border-b">
                            <tr>
                                <th className="px-4 py-3 font-medium">순위</th>
                                <th className="px-4 py-3 font-medium">카테고리</th>
                                <th className="px-4 py-3 font-medium text-right">금액</th>
                                <th className="px-4 py-3 font-medium text-right">비중</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {stats.categoryData.map((cat, idx) => (
                                <tr key={cat.name} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 text-gray-500">{idx + 1}</td>
                                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
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
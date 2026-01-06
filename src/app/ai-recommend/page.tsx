// src/app/ai-recommend/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation' 
import { supabase } from '@/lib/supabaseClient'
import { Bot, TrendingUp, Target, FileText, Info, ChevronDown, ChevronUp, Play, Loader2, RefreshCw, Calendar, Flame, Eye } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// --- 타입 정의 ---
type Recommendation = {
  id: number;
  recommend_date: string;
  code: string;
  name: string;
  close_price: number;
  target_price: number;
  reason_summary: string;
  ai_analysis_detail: string;
};

type HotStock = {
  name: string;
  count: number;
};

// --- 컴포넌트: 카드 ---
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>{children}</div>
}

// --- 컴포넌트: 로직 가이드 ---
function LogicGuide() {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mb-6">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-4 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors">
                <div className="flex items-center gap-2"><Info className="w-4 h-4 text-blue-500" />AI 종목 선정 기준 및 알고리즘 설명</div>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="p-4 pt-0 text-sm text-slate-600 border-t border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                <div>
                                    <h4 className="font-bold text-black mb-2 flex items-center gap-1">📊 1차 필터링 (기술적 지표)</h4>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><span className="font-semibold text-blue-600">RSI ≤ 35</span>: 과매도 구간 진입 종목</li>
                                        <li><span className="font-semibold text-blue-600">이격도 &lt; 99%</span>: 단기 낙폭 과대 종목</li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-bold text-black mb-2 flex items-center gap-1">🤖 2차 필터링 (AI 심층 분석)</h4>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li><span className="font-semibold text-indigo-600">옥석 가리기</span>: 재무 건전성 및 뉴스 트렌드 분석</li>
                                        <li><span className="font-semibold text-indigo-600">목표가 산정</span>: 단기 스윙(1주일) 기준 목표 수익률 계산</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

// === 메인 페이지 ===
export default function AIRecommendPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [list, setList] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const [dates, setDates] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [hotStocks, setHotStocks] = useState<HotStock[]>([])

  // 1. 사용자 ID 가져오기 (트래킹 등록용)
  useEffect(() => {
    const getUser = async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) setUserId(data.user.id);
    };
    getUser();
  }, []);

  // 2. 트래킹(관심종목) 등록 함수 -> stock_items 테이블에 저장
  const handleAddToTrack = async (item: Recommendation) => {
    if (!userId) {
        alert("로그인이 필요한 기능입니다.");
        return;
    }

    if (!confirm(`'${item.name}' 종목을 관심 목록(Now)에 추가하시겠습니까?\n(자동으로 Now 페이지로 이동합니다.)`)) return;

    try {
        // 이미 등록된 종목인지 확인 (중복 방지)
        const { data: existing } = await supabase
            .from('stock_items')
            .select('id')
            .eq('user_id', userId)
            .eq('code', item.code)
            .eq('is_sold', false) // 팔리지 않은(보유/관심) 상태인 것만 체크
            .maybeSingle();

        if (existing) {
            alert("이미 Now(관심/보유) 목록에 있는 종목입니다.");
            return;
        }

        // stock_items 테이블에 insert
        const { error } = await supabase.from('stock_items').insert({
            user_id: userId,
            code: item.code,
            name: item.name,
            is_real_buy: false, // 관심 종목이므로 false
            target_price: item.target_price, // AI 목표가 저장
            created_at: new Date().toISOString()
        });

        if (error) throw error;

        // 성공 시 Now 페이지로 이동
        router.push('/now'); 

    } catch (e: any) {
        console.error(e);
        alert(`등록 실패: ${e.message}`);
    }
  }

  // 데이터 로드 로직
  const loadInitialData = async () => {
    // 날짜 목록
    const { data: dateData } = await supabase.from('stock_ai_recommendations').select('recommend_date').order('recommend_date', { ascending: false })
    if (dateData) {
        const uniqueDates = Array.from(new Set(dateData.map(d => d.recommend_date)))
        setDates(uniqueDates)
        if (uniqueDates.length > 0) setSelectedDate(uniqueDates[0])
    }
    // Hot Stocks
    const oneWeekAgo = new Date(); oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const dateStr = oneWeekAgo.toISOString().split('T')[0];
    const { data: historyData } = await supabase.from('stock_ai_recommendations').select('name, code').gte('recommend_date', dateStr)
    if (historyData) {
        const countMap: Record<string, number> = {};
        historyData.forEach(item => { countMap[item.name] = (countMap[item.name] || 0) + 1; });
        const hotList = Object.entries(countMap).filter(([_, count]) => count >= 2).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
        setHotStocks(hotList);
    }
  }

  const loadListByDate = async (date: string) => {
    if (!date) return;
    setLoading(true)
    const { data } = await supabase.from('stock_ai_recommendations').select('*').eq('recommend_date', date).order('target_price', { ascending: false })
    if (data) setList(data)
    setLoading(false)
  }

  useEffect(() => { loadInitialData() }, [])
  useEffect(() => { loadListByDate(selectedDate) }, [selectedDate])

  const handleManualAnalysis = async () => {
    const key = window.prompt("CRON_SECRET 키를 입력해주세요.")
    if (!key) return
    setIsAnalyzing(true)
    try {
        const res = await fetch(`/api/cron/daily-recommend?key=${key}`)
        const result = await res.json()
        if (!res.ok) throw new Error(result.error)
        alert(`✅ 분석 완료!`)
        await loadInitialData()
    } catch (e: any) { alert(`❌ 오류: ${e.message}`) } finally { setIsAnalyzing(false) }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* 헤더 섹션 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl shadow-lg">
                <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">AI 주식 심층 분석</h1>
                <p className="text-sm text-gray-500">매일 오후 5시, 퀀트 알고리즘과 AI가 낙폭과대 종목을 선정합니다.</p>
            </div>
        </div>
        <button onClick={handleManualAnalysis} disabled={isAnalyzing} className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm shadow-md transition-all ${isAnalyzing ? 'bg-gray-100 text-gray-400' : 'bg-white border text-indigo-600 hover:bg-indigo-50'}`}>
            {isAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> 분석 중...</> : <><Play className="w-4 h-4 fill-indigo-600" /> 지금 즉시 분석하기</>}
        </button>
      </div>

      {/* Hot Stocks */}
      <AnimatePresence>
      {hotStocks.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-orange-50 border border-orange-200 rounded-xl p-5 mb-6">
             <h2 className="text-sm font-bold text-orange-800 mb-3 flex items-center gap-2"><Flame className="w-4 h-4 text-orange-600 fill-orange-600" /> 최근 7일간 반복 추천 종목 (Hot!)</h2>
            <div className="flex flex-wrap gap-2">
                {hotStocks.map((stock) => (
                    <div key={stock.name} className="bg-white px-3 py-1.5 rounded-lg border border-orange-100 shadow-sm flex items-center gap-2 text-sm font-medium text-gray-700">
                        {stock.name} <span className="bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded-full font-bold">{stock.count}회</span>
                    </div>
                ))}
            </div>
        </motion.div>
      )}
      </AnimatePresence>

      <LogicGuide />

      {/* 날짜 필터 */}
      <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-gray-200 shadow-sm sticky top-2 z-10">
        <div className="flex items-center gap-2 text-gray-700 font-bold"><Calendar className="w-5 h-5 text-indigo-500" /><span>{selectedDate} 리포트</span></div>
        <div className="relative">
            <select value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="appearance-none bg-gray-50 border border-gray-300 text-gray-700 py-2 pl-4 pr-10 rounded-lg leading-tight focus:outline-none focus:bg-white text-sm font-medium cursor-pointer">
                {dates.map((date, idx) => (<option key={date} value={date}>{date} {idx === 0 ? '(최신)' : ''}</option>))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700"><ChevronDown className="w-4 h-4" /></div>
        </div>
      </div>

      {loading && !isAnalyzing && (
        <div className="flex h-64 items-center justify-center text-gray-500 flex-col gap-2"><RefreshCw className="w-8 h-8 animate-spin text-indigo-400" /><p className="text-sm">데이터를 불러오는 중입니다...</p></div>
      )}

      {!loading && (
          <div className="grid grid-cols-1 gap-6">
            {list.map((item, idx) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}>
                <Card className="border-l-4 border-l-indigo-500 hover:shadow-lg transition-shadow bg-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-20 bg-gradient-to-bl from-indigo-50 to-transparent rounded-bl-full opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    
                    {/* 상단 정보 및 트래킹 버튼 */}
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-5 pb-5 border-b border-dashed border-gray-200 relative z-10">
                        <div>
                            <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded mb-2 border border-indigo-100">{item.recommend_date} 추천</span>
                            <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800">{item.name} <span className="text-base font-medium text-gray-400">({item.code})</span></h2>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex gap-6 text-sm bg-gray-50 p-3 rounded-lg border border-gray-100">
                                <div className="text-right"><div className="text-gray-400 text-xs mb-1">현재가</div><div className="font-bold text-lg text-gray-700">{Number(item.close_price).toLocaleString()}원</div></div>
                                <div className="w-px h-10 bg-gray-200"></div>
                                <div className="text-right"><div className="text-red-500 text-xs mb-1 flex items-center justify-end gap-1"><Target className="w-3 h-3"/> 목표가</div><div className="font-bold text-lg text-red-600">{Number(item.target_price).toLocaleString()}원</div></div>
                            </div>
                            
                            {/* ✅ 트래킹(관심등록) 버튼 */}
                            <button 
                                onClick={() => handleAddToTrack(item)}
                                className="flex flex-col items-center justify-center px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all min-w-[70px]"
                                title="Now(관심종목)에 추가하고 이동"
                            >
                                <Eye className="w-5 h-5 mb-1" />
                                <span className="text-[11px] font-bold">트래킹</span>
                            </button>
                        </div>
                    </div>

                    <div className="mb-4 relative z-10">
                        <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-red-500"/> 핵심 추천 사유</h3>
                        <p className="text-gray-800 text-sm font-medium bg-red-50 p-3 rounded-lg leading-relaxed border border-red-100">{item.reason_summary}</p>
                    </div>

                    <div className="relative z-10">
                        <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-blue-500"/> AI 심층 분석</h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 relative">
                            <Bot className="w-12 h-12 text-slate-200 absolute top-2 right-2 -z-0" />
                            <p className="text-slate-700 text-sm leading-7 whitespace-pre-line relative z-10">{item.ai_analysis_detail}</p>
                        </div>
                    </div>
                </Card>
            </motion.div>
            ))}
            {list.length === 0 && <div className="text-center py-24 bg-white rounded-xl border border-dashed"><Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-500 font-medium">데이터가 없습니다.</p></div>}
        </div>
      )}
    </div>
  )
}
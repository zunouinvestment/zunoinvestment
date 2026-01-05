// src/app/ai-recommend/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Bot, TrendingUp, Target, FileText, Info, ChevronDown, ChevronUp, Play, Loader2, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// --- 컴포넌트: 카드 ---
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-6 ${className}`}>{children}</div>
}

// --- 컴포넌트: 로직 설명 가이드 (토글) ---
function LogicGuide() {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mb-6">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
                <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" />
                    AI 종목 선정 기준 및 알고리즘 설명
                </div>
                {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 pt-0 text-sm text-slate-600 border-t border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                <div>
                                    <h4 className="font-bold text-black mb-2 flex items-center gap-1">📊 1차 필터링 (기술적 지표)</h4>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>
                                            <span className="font-semibold text-blue-600">RSI (상대강도지수) ≤ 35</span>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                * 30 이하는 과매도(Oversold) 구간으로, 주가가 지나치게 하락했음을 의미합니다. 기술적 반등 확률이 높은 구간입니다.
                                            </p>
                                        </li>
                                        <li className="mt-2">
                                            <span className="font-semibold text-blue-600">이격도 (20일선) &lt; 99%</span>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                * 현재 주가가 20일 이동평균선보다 낮게 형성되어 있어 단기 낙폭이 큼을 의미합니다.
                                            </p>
                                        </li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="font-bold text-black mb-2 flex items-center gap-1">🤖 2차 필터링 (Gemini AI)</h4>
                                    <ul className="list-disc pl-4 space-y-1">
                                        <li>
                                            <span className="font-semibold text-indigo-600">옥석 가리기</span>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                1차 필터링된 종목 중, 30년 경력 퀀트 투자자 페르소나를 가진 Gemini가 재무 건전성과 최근 뉴스 트렌드를 고려해 <b>Top 5</b>를 선정합니다.
                                            </p>
                                        </li>
                                        <li className="mt-2">
                                            <span className="font-semibold text-indigo-600">목표가 산정</span>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                단기 스윙(1주일) 기준으로 <b>3% 및 5% 수익 구간</b>을 AI가 직접 계산하여 제안합니다.
                                            </p>
                                        </li>
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
  const [list, setList] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false) // 분석 실행 상태

  // 데이터 로드 함수
  const loadData = async () => {
    setLoading(true)
    const { data } = await supabase
        .from('stock_ai_recommendations')
        .select('*')
        .order('recommend_date', { ascending: false })
        .limit(20)
    
    if (data) setList(data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // 수동 분석 실행 핸들러
  const handleManualAnalysis = async () => {
    const key = window.prompt("관리자 권한 확인: CRON_SECRET 키를 입력해주세요.")
    if (!key) return

    if (!confirm("KOSPI 200 데이터를 수집하고 AI 분석을 시작합니다.\n약 30~60초 정도 소요됩니다. 진행하시겠습니까?")) return

    setIsAnalyzing(true)
    try {
        // API 호출 (타임아웃 방지를 위해 긴 시간 대기 필요할 수 있음)
        const res = await fetch(`/api/cron/daily-recommend?key=${key}`)
        const result = await res.json()

        if (!res.ok) throw new Error(result.error || '분석 실패')

        alert(`✅ 분석 완료! ${result.count || 5}개 종목이 추천되었습니다.`)
        loadData() // 목록 새로고침
    } catch (e: any) {
        alert(`❌ 오류 발생: ${e.message}`)
    } finally {
        setIsAnalyzing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* 헤더 섹션 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg">
                <Bot className="w-8 h-8 text-white" />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">Gemini's Pick</h1>
                <p className="text-sm text-gray-500">AI가 매일 오후 5시, 과대낙폭 유망 종목을 분석합니다.</p>
            </div>
        </div>

        {/* 테스트 버튼 */}
        <button 
            onClick={handleManualAnalysis}
            disabled={isAnalyzing}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm shadow-md transition-all
                ${isAnalyzing 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-white border border-gray-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200'
                }`}
        >
            {isAnalyzing ? (
                <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    AI 분석 중... (약 1분)
                </>
            ) : (
                <>
                    <Play className="w-4 h-4 fill-indigo-600" />
                    지금 즉시 분석하기
                </>
            )}
        </button>
      </div>

      {/* 로직 가이드 (토글) */}
      <LogicGuide />

      {/* 로딩 상태 표시 */}
      {loading && !isAnalyzing && (
        <div className="flex h-64 items-center justify-center text-gray-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            데이터를 불러오는 중...
        </div>
      )}

      {/* 리스트 */}
      {!loading && (
          <div className="grid grid-cols-1 gap-6">
            {list.map((item, idx) => (
            <motion.div 
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
            >
                <Card className="border-l-4 border-l-indigo-500 hover:shadow-lg transition-shadow bg-white">
                    {/* 상단 정보 */}
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-5 pb-5 border-b border-dashed border-gray-200">
                        <div>
                            <span className="inline-block px-2 py-1 bg-indigo-50 text-indigo-600 text-xs font-bold rounded mb-2 border border-indigo-100">
                                {item.recommend_date} 추천
                            </span>
                            <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
                                {item.name}
                                <span className="text-base font-medium text-gray-400">({item.code})</span>
                            </h2>
                        </div>
                        <div className="flex gap-6 text-sm bg-gray-50 p-3 rounded-lg">
                            <div className="text-right">
                                <div className="text-gray-400 text-xs mb-1">현재가</div>
                                <div className="font-bold text-lg text-gray-700">{Number(item.close_price).toLocaleString()}원</div>
                            </div>
                            <div className="w-px h-10 bg-gray-200"></div>
                            <div className="text-right">
                                <div className="text-indigo-500 text-xs mb-1 flex items-center justify-end gap-1"><Target className="w-3 h-3"/> 목표가</div>
                                <div className="font-bold text-lg text-indigo-600">{Number(item.target_price).toLocaleString()}원</div>
                            </div>
                        </div>
                    </div>

                    {/* 요약 */}
                    <div className="mb-4">
                        <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-red-500"/> 핵심 추천 사유
                        </h3>
                        <p className="text-gray-800 text-sm font-medium bg-red-50 p-3 rounded-lg leading-relaxed border border-red-100">
                            {item.reason_summary}
                        </p>
                    </div>

                    {/* 상세 분석 */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-500"/> Gemini 심층 분석
                        </h3>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 relative">
                            <Bot className="w-12 h-12 text-slate-200 absolute top-2 right-2 -z-0" /> {/* 배경 아이콘 효과 */}
                            <p className="text-slate-700 text-sm leading-7 whitespace-pre-line relative z-10">
                                {item.ai_analysis_detail}
                            </p>
                        </div>
                    </div>
                </Card>
            </motion.div>
            ))}

            {list.length === 0 && (
                <div className="text-center py-24 bg-white rounded-xl border border-dashed">
                    <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400 font-medium">등록된 추천 내역이 없습니다.<br/>[지금 즉시 분석하기] 버튼을 눌러보세요!</p>
                </div>
            )}
        </div>
      )}
    </div>
  )
}
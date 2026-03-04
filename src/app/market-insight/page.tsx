// src/app/market-insight/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Activity, Globe, Bot, DownloadCloud } from 'lucide-react';

interface MarketData {
  target_date: string;
  usd_krw: number;
  dxy: number;
  nasdaq: number;
  sp500: number;
  sox: number;
  us10y: number;
  vix: number;
  ai_weather: 'SUNNY' | 'CLOUDY' | 'RAINY';
  ai_summary: string;
  ai_report: string;
}

export default function MarketInsightPage() {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false); // 수동 업데이트 로딩 상태

  const fetchData = async () => {
    setLoading(true);
    const { data: latestData, error } = await supabase
      .from('market_insights')
      .select('*')
      .order('target_date', { ascending: false })
      .limit(1)
      .single();

    if (!error && latestData) {
      setData(latestData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ✅ 수동 업데이트 실행 함수
  const handleManualUpdate = async () => {
    // 보안을 위해 관리자용 암호(CRON_SECRET)를 입력받음
    const secretKey = prompt("수동 업데이트를 실행하려면 관리자 키(CRON_SECRET)를 입력하세요.\n(AI 분석에 약 10~20초 소요됩니다.)");
    if (!secretKey) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/cron/market-insight?key=${secretKey}`);
      const result = await res.json();

      if (res.ok && result.success) {
        alert("✅ 시장 데이터 수집 및 AI 분석이 완료되었습니다!");
        fetchData(); // 성공 시 화면 데이터 다시 불러오기
      } else {
        alert(`❌ 업데이트 실패: ${result.error || result.message}`);
      }
    } catch (error) {
      console.error(error);
      alert("❌ 통신 오류가 발생했습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  const getWeatherIcon = (weather: string) => {
    switch (weather) {
      case 'SUNNY': return <span className="text-4xl">☀️</span>;
      case 'CLOUDY': return <span className="text-4xl">☁️</span>;
      case 'RAINY': return <span className="text-4xl">⛈️</span>;
      default: return <span className="text-4xl">🌤️</span>;
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Market Insight</h1>
          <p className="text-sm text-gray-500">
            {data ? `기준일: ${new Date(data.target_date).toLocaleDateString('ko-KR')}` : '수집된 데이터가 없습니다.'}
          </p>
        </div>
        
        {/* ✅ 버튼 그룹 (수동 업데이트 & 새로고침) */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleManualUpdate}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
            {isUpdating ? 'AI 분석 중...' : '수동 업데이트'}
          </button>

          <button 
            onClick={fetchData}
            disabled={loading}
            className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            title="화면 새로고침"
          >
            <RefreshCw className={`w-5 h-5 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!data ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700">아직 수집된 시장 데이터가 없습니다.</h2>
          <p className="text-gray-500 mt-2">상단의 '수동 업데이트' 버튼을 눌러 데이터를 수집해보세요.</p>
        </div>
      ) : (
        <>
          {/* 1. AI 시황 요약 (날씨) */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl shadow-sm border border-blue-100 flex flex-col md:flex-row items-center gap-6">
            <div className="flex-shrink-0 bg-white p-4 rounded-full shadow-sm">
              {getWeatherIcon(data.ai_weather)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-800 mb-2">오늘의 AI 시장 요약</h2>
              <p className="text-gray-700 text-lg leading-relaxed font-medium">
                "{data.ai_summary}"
              </p>
            </div>
          </div>

          {/* 2. 매크로 지표 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard title="원/달러 환율" value={`${data.usd_krw.toLocaleString()}원`} icon={<DollarSign className="w-5 h-5 text-green-500" />} />
            <MetricCard title="달러 인덱스" value={data.dxy.toFixed(2)} icon={<Globe className="w-5 h-5 text-blue-500" />} />
            <MetricCard title="나스닥" value={data.nasdaq.toLocaleString()} icon={<TrendingUp className="w-5 h-5 text-red-500" />} />
            <MetricCard title="S&P 500" value={data.sp500.toLocaleString()} icon={<Activity className="w-5 h-5 text-purple-500" />} />
            <MetricCard title="필라델피아 반도체" value={data.sox.toLocaleString()} icon={<TrendingUp className="w-5 h-5 text-orange-500" />} />
            <MetricCard title="미 국채 10년물" value={`${data.us10y.toFixed(3)}%`} icon={<Activity className="w-5 h-5 text-gray-500" />} />
            <MetricCard title="VIX (공포지수)" value={data.vix.toFixed(2)} icon={<TrendingDown className="w-5 h-5 text-red-600" />} />
          </div>

          {/* 3. AI 상세 리포트 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-600" />
              AI 매크로 심층 분석
            </h2>
            <div className="prose text-gray-700 leading-loose">
              {data.ai_report.split('\n').map((line, i) => (
                <p key={i} className="mb-2">{line}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 지표 카드 컴포넌트
function MetricCard({ title, value, icon }: { title: string, value: string | number, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
        {icon}
        {title}
      </div>
      <div className="text-xl font-bold text-gray-900">
        {value}
      </div>
    </div>
  );
}
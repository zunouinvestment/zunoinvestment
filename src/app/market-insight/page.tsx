// src/app/market-insight/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RefreshCw, TrendingUp, TrendingDown, DollarSign, Activity, Globe, Bot, DownloadCloud, Info, Calendar, Flame, Coins, Bitcoin } from 'lucide-react';

interface MarketData {
  target_date: string;
  usd_krw: number;
  dxy: number;
  nasdaq: number;
  sp500: number;
  sox: number;
  us10y: number;
  vix: number;
  wti?: number;
  gold?: number;
  bitcoin?: number;
  ai_weather: 'SUNNY' | 'CLOUDY' | 'RAINY';
  ai_summary: string;
  ai_report: string;
}

export default function MarketInsightPage() {
  const [allHistory, setAllHistory] = useState<MarketData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    const { data: historyData, error } = await supabase
      .from('market_insights')
      .select('*')
      .order('target_date', { ascending: false });

    if (!error && historyData && historyData.length > 0) {
      setAllHistory(historyData);
      if (!selectedDate) {
        setSelectedDate(historyData[0].target_date);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualUpdate = async () => {
    const secretKey = prompt("수동 업데이트를 실행하려면 관리자 키(CRON_SECRET)를 입력하세요.");
    if (!secretKey) return;

    setIsUpdating(true);
    try {
      const res = await fetch('/api/cron/market-insight', {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      });
      const result = await res.json();

      if (res.ok && result.success) {
        alert("✅ 새로운 시장 데이터 수집 및 분석이 완료되었습니다!");
        setSelectedDate(''); 
        await fetchAllData();
      } else {
        alert(`❌ 업데이트 실패: ${result.error || result.message}`);
      }
    } catch (error) {
      alert("❌ 통신 오류가 발생했습니다.");
    } finally {
      setIsUpdating(false);
    }
  };

  const currentIndex = allHistory.findIndex(d => d.target_date === selectedDate);
  const currentData = allHistory[currentIndex] || null;
  const prevData = allHistory[currentIndex + 1] || null; 

  const getWeatherIcon = (weather: string) => {
    switch (weather) {
      case 'SUNNY': return <span className="text-4xl">☀️</span>;
      case 'CLOUDY': return <span className="text-4xl">☁️</span>;
      case 'RAINY': return <span className="text-4xl">⛈️</span>;
      default: return <span className="text-4xl">🌤️</span>;
    }
  };

  if (loading && allHistory.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Market Insight
          </h1>
          <p className="text-sm text-gray-500 mt-1">월스트리트 AI의 매크로 심층 분석 리포트</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 flex-1 md:flex-none">
            <Calendar className="w-4 h-4 text-gray-500" />
            <select
              className="bg-transparent text-sm font-medium text-gray-700 outline-none w-full md:w-auto cursor-pointer"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            >
              {allHistory.map((h, idx) => (
                <option key={h.target_date} value={h.target_date}>
                  {new Date(h.target_date).toLocaleDateString('ko-KR')} 
                  {idx === 0 ? ' (최신)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleManualUpdate}
            disabled={isUpdating}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
          >
            {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <DownloadCloud className="w-4 h-4" />}
            <span className="hidden sm:inline">{isUpdating ? '분석 중...' : '새로 수집'}</span>
          </button>
        </div>
      </div>

      {!currentData ? (
        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-700">아직 수집된 시장 데이터가 없습니다.</h2>
          <p className="text-gray-500 mt-2">상단의 '새로 수집' 버튼을 눌러보세요.</p>
        </div>
      ) : (
        <>
          {/* 1. AI 시황 요약 */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl shadow-sm border border-blue-100 flex flex-col md:flex-row items-center gap-6">
            <div className="flex-shrink-0 bg-white p-4 rounded-full shadow-sm">
              {getWeatherIcon(currentData.ai_weather)}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-md">
                  {new Date(currentData.target_date).toLocaleDateString('ko-KR')} 요약
                </span>
              </div>
              <p className="text-gray-800 text-lg md:text-xl leading-relaxed font-bold break-keep">
                "{currentData.ai_summary}"
              </p>
            </div>
          </div>

          {/* 2. 매크로 지표 그리드 (총 10개 지표 + 툴팁 + 전일비) */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
            <MetricCard 
              title="원/달러 환율" value={`${currentData.usd_krw.toLocaleString(undefined, { maximumFractionDigits: 1 })}원`} 
              icon={<DollarSign className="w-4 h-4 text-green-500" />} currentNum={currentData.usd_krw} prevNum={prevData?.usd_krw}
              description="원화 대비 달러의 가치입니다. 환율이 급등하면 외국인 투자자들이 환차손을 피하기 위해 한국 주식을 팔고 나갈 확률이 높아져 증시에 악재로 작용합니다."
            />
            <MetricCard 
              title="달러 인덱스" value={currentData.dxy.toFixed(2)} 
              icon={<Globe className="w-4 h-4 text-blue-500" />} currentNum={currentData.dxy} prevNum={prevData?.dxy}
              description="세계 주요 6개국 통화 대비 달러화의 평균적인 가치를 보여줍니다. 달러가 강세(상승)일수록 신흥국(한국 등) 증시의 자본 이탈 우려가 커집니다."
            />
            <MetricCard 
              title="미 국채 10년물" value={`${currentData.us10y.toFixed(3)}%`} 
              icon={<Activity className="w-4 h-4 text-gray-500" />} currentNum={currentData.us10y} prevNum={prevData?.us10y} isPoint={true}
              description="글로벌 장기 금리의 벤치마크입니다. 금리가 오르면 주식 대신 안전한 국채에 투자하려는 심리가 커져 주식 시장, 특히 기술주에 악재로 작용합니다."
            />
            <MetricCard 
              title="VIX (공포지수)" value={currentData.vix.toFixed(2)} 
              icon={<TrendingDown className="w-4 h-4 text-red-600" />} currentNum={currentData.vix} prevNum={prevData?.vix} isPoint={true}
              description="S&P 500 지수의 향후 30일간 변동성에 대한 시장의 기대치입니다. 보통 20을 넘으면 시장 불안정을 뜻하며, 30을 넘으면 극심한 공포 상태를 의미합니다."
            />
            <MetricCard 
              title="WTI 원유" value={`$${currentData.wti?.toFixed(2) || '0.00'}`} 
              icon={<Flame className="w-4 h-4 text-orange-600" />} currentNum={currentData.wti} prevNum={prevData?.wti}
              description="서부 텍사스산 원유 가격입니다. 유가 상승은 인플레이션 압력을 높여 금리 인하를 지연시키고, 기업의 생산 비용을 증가시킵니다."
            />
            <MetricCard 
              title="국제 금(Gold)" value={`$${currentData.gold?.toFixed(1) || '0.0'}`} 
              icon={<Coins className="w-4 h-4 text-yellow-500" />} currentNum={currentData.gold} prevNum={prevData?.gold}
              description="대표적인 안전자산입니다. 경제 위기, 인플레이션 우려, 또는 지정학적 리스크가 커질 때 자금이 몰리며 가격이 상승하는 경향이 있습니다."
            />
            <MetricCard 
              title="비트코인" value={`$${currentData.bitcoin?.toLocaleString(undefined, { maximumFractionDigits: 0 }) || '0'}`} 
              icon={<Bitcoin className="w-4 h-4 text-yellow-600" />} currentNum={currentData.bitcoin} prevNum={prevData?.bitcoin}
              description="대표적인 위험 자산이자 대체 투자처입니다. 글로벌 유동성이 풍부해지거나 리스크 온(위험 선호) 심리가 강할 때 상승하는 경향이 있습니다."
            />
            <MetricCard 
              title="나스닥" value={currentData.nasdaq.toLocaleString(undefined, { maximumFractionDigits: 2 })} 
              icon={<TrendingUp className="w-4 h-4 text-red-500" />} currentNum={currentData.nasdaq} prevNum={prevData?.nasdaq}
              description="미국의 벤처기업과 기술주(빅테크) 중심의 주가지수입니다. 한국 증시에는 IT, 배터리, 바이오 등 성장주 섹터에 직접적인 방향성을 제시합니다."
            />
            <MetricCard 
              title="S&P 500" value={currentData.sp500.toLocaleString(undefined, { maximumFractionDigits: 2 })} 
              icon={<Activity className="w-4 h-4 text-purple-500" />} currentNum={currentData.sp500} prevNum={prevData?.sp500}
              description="미국을 대표하는 500개 대형 기업의 주가지수입니다. 글로벌 증시와 경제의 전반적인 건강 상태를 보여주는 가장 중요한 나침반입니다."
            />
            <MetricCard 
              title="필라델피아 반도체" value={currentData.sox.toLocaleString(undefined, { maximumFractionDigits: 2 })} 
              icon={<TrendingUp className="w-4 h-4 text-orange-500" />} currentNum={currentData.sox} prevNum={prevData?.sox}
              description="미국 주요 반도체 기업 30개의 주가를 지수화한 것입니다. 코스피 시가총액 비중이 압도적인 삼성전자와 SK하이닉스의 강력한 선행지표입니다."
            />
          </div>

          {/* 3. AI 상세 리포트 */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
            <h2 className="text-lg font-bold text-gray-800 mb-5 flex items-center gap-2">
              <Bot className="w-5 h-5 text-blue-600" />
              딥 다이브 (Deep Dive) 분석 리포트
            </h2>
            <div className="text-gray-700 leading-relaxed space-y-4 font-medium text-[15px] md:text-base break-keep">
              {currentData.ai_report.split('\n').map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// 지표 카드 컴포넌트
function MetricCard({ 
  title, value, icon, currentNum, prevNum, isPoint = false, description
}: { 
  title: string; value: string | number; icon: React.ReactNode; 
  currentNum?: number; prevNum?: number; isPoint?: boolean; description?: string;
}) {
  const renderDifference = () => {
    // 값이 없거나 NaN일 경우 예외 처리
    if (currentNum === undefined || prevNum === undefined || prevNum === 0 || isNaN(currentNum) || isNaN(prevNum)) {
      return <div className="text-xs text-gray-400 mt-1 invisible">비교불가</div>;
    }

    const diff = currentNum - prevNum;
    const diffRate = (diff / prevNum) * 100;
    
    if (diff === 0) return <div className="text-xs font-medium text-gray-400 mt-1">- (0.00%)</div>;

    const isUp = diff > 0;
    const colorClass = isUp ? 'text-red-500' : 'text-blue-500';
    const sign = isUp ? '▲' : '▼';
    const diffStr = Math.abs(diff).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const rateStr = isPoint ? `${Math.abs(diff).toFixed(2)}p` : `${Math.abs(diffRate).toFixed(2)}%`;

    return (
      <div className={`text-xs sm:text-[13px] font-bold mt-1.5 ${colorClass}`}>
        {sign} {diffStr} <span className="font-medium opacity-80">({isUp ? '+' : '-'}{rateStr})</span>
      </div>
    );
  };

  return (
    <div className="bg-white p-3.5 md:p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between relative group">
      <div className="flex items-center gap-1.5 text-xs md:text-sm text-gray-500 font-semibold mb-1">
        {icon}
        <span className="truncate">{title}</span>
        {description && (
          <div className="relative flex items-center">
            <Info className="w-3.5 h-3.5 text-gray-400 cursor-help hover:text-blue-500 transition-colors" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-56 sm:w-64 p-3 bg-gray-800 text-white text-[13px] leading-relaxed rounded-lg shadow-xl z-10 font-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <div className="mb-1 font-semibold text-blue-300">{title}란?</div>
              {description}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800"></div>
            </div>
          </div>
        )}
      </div>
      <div className="text-lg md:text-xl font-bold text-gray-900 truncate">
        {value}
      </div>
      {renderDifference()}
    </div>
  );
}
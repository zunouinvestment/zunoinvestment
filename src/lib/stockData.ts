// src/lib/stockData.ts
import yahooFinance from 'yahoo-finance2';
import { KOSPI_200 } from './kospiCodes';

// RSI 계산 함수
function calculateRSI(closes: number[], period: number = 14) {
  if (closes.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1) + 0) / period;
    } else {
      avgGain = (avgGain * (period - 1) + 0) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// 딜레이 함수
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchOversoldStocks() {
  const candidates = [];
  
  // Vercel 타임아웃 방지를 위해 일단 30개만 스캔 (안정화되면 늘리세요)
  const targetList = KOSPI_200.slice(0, 30); 

  console.log(`🚀 [System] 총 ${targetList.length}개 종목 데이터 수집 시작...`);

  for (const stock of targetList) {
    try {
      // ✅ [수정됨] TypeScript 오류 해결을 위해 'as any[]' 추가
      const quote = await yahooFinance.historical(stock.code, { period1: '2mo', interval: '1d' }) as any[];
      
      // 배열인지 확인하고 길이가 충분한지 체크
      if (!Array.isArray(quote) || quote.length < 20) {
        console.warn(`⚠️ 데이터 부족 또는 형식 오류: ${stock.name}`);
        continue;
      }

      const closes = quote.map((q: any) => q.close);
      const currentPrice = closes[closes.length - 1];
      
      // RSI 계산
      const rsi = calculateRSI(closes);

      // 필터 없이 모든 종목 수집 (상대평가용)
      const prevPrice = closes[closes.length - 2];
      const changeRate = ((currentPrice - prevPrice) / prevPrice) * 100;

      candidates.push({
        code: stock.code.replace('.KS', ''),
        name: stock.name,
        price: currentPrice,
        changeRate: changeRate.toFixed(2),
        rsi: rsi.toFixed(2),
        history: closes.slice(-5).join(' -> ') // 최근 5일 흐름
      });

    } catch (e) {
      console.error(`❌ 수집 실패 (${stock.name}):`, e);
      continue;
    }
    
    // 딜레이
    await delay(10);
  }

  console.log(`📊 [System] 최종 수집된 종목 수: ${candidates.length}개`);

  if (candidates.length === 0) {
    console.error("🚨 [System] 수집된 데이터가 0개입니다.");
    return [];
  }

  // RSI 낮은 순(과매도 심한 순) 정렬
  candidates.sort((a, b) => Number(a.rsi) - Number(b.rsi));

  // 상위 10개 리턴
  return candidates.slice(0, 10);
}
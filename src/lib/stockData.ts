// src/lib/stockData.ts
import { KOSPI_200 } from './kospiCodes';
import yahooFinance from 'yahoo-finance2'; // 최신 버전 표준 import

function calculateRSI(closes: number[], period: number = 14) {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchOversoldStocks() {
  const candidates = [];
  // Vercel 무료 타임아웃 고려: 30개만 우선 스캔
  const targetList = KOSPI_200.slice(0, 30); 

  console.log(`🚀 [System] 총 ${targetList.length}개 종목 데이터 수집 시작...`);

  // (옵션) 불필요한 경고 끄기
  yahooFinance.suppressNotices(['yahooSurvey']);

  for (const stock of targetList) {
    try {
      const quote = await yahooFinance.historical(stock.code, { 
        period1: '2mo', 
        interval: '1d' 
      });
      
      if (!quote || quote.length < 20) continue;

      const closes = quote.map((q: any) => q.close);
      const currentPrice = closes[closes.length - 1];
      const rsi = calculateRSI(closes);
      
      const prevPrice = closes[closes.length - 2];
      const changeRate = ((currentPrice - prevPrice) / prevPrice) * 100;

      candidates.push({
        code: stock.code.replace('.KS', ''),
        name: stock.name,
        price: currentPrice,
        changeRate: changeRate.toFixed(2),
        rsi: rsi.toFixed(2),
        history: closes.slice(-5).join(' -> ') 
      });

    } catch (e: any) {
      // 실패 로그 간소화
      // console.error(`❌ 수집 실패 (${stock.name})`);
      continue;
    }
    await delay(20);
  }

  console.log(`📊 [System] 최종 수집된 종목 수: ${candidates.length}개`);

  if (candidates.length === 0) {
    console.error("🚨 [System] 수집된 데이터가 0개입니다.");
    return [];
  }

  candidates.sort((a, b) => Number(a.rsi) - Number(b.rsi));
  return candidates.slice(0, 10);
}
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

// 딜레이 함수 (너무 길면 타임아웃 나므로 짧게 조정)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchOversoldStocks() {
  const candidates = [];
  
  // 🚨 중요: Vercel 무료 플랜 타임아웃 방지를 위해 일단 30개만 스캔합니다.
  // 작동 확인되면 50, 100으로 조금씩 늘려보세요.
  const targetList = KOSPI_200.slice(0, 30); 

  console.log(`🚀 [System] 총 ${targetList.length}개 종목 데이터 수집 시작...`);

  for (const stock of targetList) {
    try {
      // 최근 2달 데이터 요청
      const quote = await yahooFinance.historical(stock.code, { period1: '2mo', interval: '1d' });
      
      if (!quote || quote.length < 20) {
        console.warn(`⚠️ 데이터 부족: ${stock.name}`);
        continue;
      }

      const closes = quote.map(q => q.close);
      const currentPrice = closes[closes.length - 1];
      
      // RSI 계산
      const rsi = calculateRSI(closes);

      // ✅ [필터 완전 제거] 
      // RSI 수치 상관없이 일단 모든 정상 데이터를 후보군에 넣습니다.
      // 나중에 정렬해서 하위 5개를 뽑으면 그게 현재 시장에서 상대적으로 가장 많이 떨어진 종목입니다.
      
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

      // 진행 상황 로그 (Vercel 로그에서 확인용)
      // console.log(`✅ 수집 성공: ${stock.name} (RSI: ${rsi.toFixed(1)})`);

    } catch (e) {
      console.error(`❌ 수집 실패 (${stock.name}):`, e);
      continue;
    }
    
    // 딜레이 10ms로 단축 (타임아웃 방지)
    await delay(10);
  }

  console.log(`📊 [System] 최종 수집된 종목 수: ${candidates.length}개`);

  if (candidates.length === 0) {
    console.error("🚨 [System] 수집된 데이터가 0개입니다. Yahoo Finance API가 차단되었거나 타임아웃일 수 있습니다.");
    return [];
  }

  // RSI 낮은 순(과매도 심한 순)으로 오름차순 정렬
  candidates.sort((a, b) => Number(a.rsi) - Number(b.rsi));

  // 상위 10개만 리턴 (Gemini에게 보낼 최종 후보)
  // RSI가 70이어도, 다른게 80이면 70인 종목이 선택됩니다.
  return candidates.slice(0, 10);
}
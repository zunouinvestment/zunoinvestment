// src/lib/stockData.ts
import { KOSPI_200 } from './kospiCodes';
// ✅ 방금 만든 KIS 클라이언트 함수 import
import { getDailyStockHistory } from './kisClient';

// RSI 계산 함수 (그대로 사용)
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

// 딜레이 함수 (KIS API 초당 제한 고려)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchOversoldStocks() {
  const candidates = [];

  // KIS API 호출 제한(초당 20건)과 Vercel 타임아웃을 고려하여
  // 상위 30개만 우선 분석합니다.
  const targetList = KOSPI_200.slice(0, 30);

  console.log(`🚀 [KIS] 총 ${targetList.length}개 종목 데이터 수집 시작...`);

  for (const stock of targetList) {
    try {
      // ✅ KIS API로 일봉 데이터 가져오기 (이미 인증된 함수 사용)
      const closes = await getDailyStockHistory(stock.code);

      // 데이터가 충분하지 않으면 패스
      if (!closes || closes.length < 20) {
        continue;
      }

      const currentPrice = closes[closes.length - 1];

      // RSI 계산
      const rsi = calculateRSI(closes);

      // 등락률 계산
      const prevPrice = closes[closes.length - 2];
      const changeRate = ((currentPrice - prevPrice) / prevPrice) * 100;

      candidates.push({
        code: stock.code, // 표기용 코드 정리
        name: stock.name,
        price: currentPrice,
        changeRate: changeRate.toFixed(2),
        rsi: rsi.toFixed(2),
        history: closes.slice(-5).join(' -> ') // 최근 5일 흐름
      });

    } catch (e: any) {
      console.error(`❌ 수집 실패 (${stock.name}):`, e.message);
      // 실패해도 다음 종목 계속 진행
      continue;
    }

    // KIS API 과부하 방지를 위해 0.1초 대기
    await delay(100);
  }

  console.log(`📊 [KIS] 최종 수집된 종목 수: ${candidates.length}개`);

  if (candidates.length === 0) {
    console.error("🚨 [KIS] 수집된 데이터가 0개입니다.");
    return [];
  }

  // RSI 낮은 순(과매도)으로 정렬
  candidates.sort((a, b) => Number(a.rsi) - Number(b.rsi));

  // 상위 10개 반환
  return candidates.slice(0, 10);
}

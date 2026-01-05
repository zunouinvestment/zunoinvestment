// src/lib/stockData.ts
import { KOSPI_200 } from './kospiCodes';

// 🚨 중요: yahoo-finance2 로딩 방식 변경 (Next.js 서버 환경 호환성)
// 최신 버전에서는 default export를 명시적으로 가져와야 할 수 있습니다.
import yahooFinance from 'yahoo-finance2';

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
  
  // Vercel 타임아웃 방지: 일단 30개만 스캔
  const targetList = KOSPI_200.slice(0, 30); 

  console.log(`🚀 [System] 총 ${targetList.length}개 종목 데이터 수집 시작...`);

  // 🚨 중요: Yahoo Finance 라이브러리 초기화 문제 해결 시도
  // 일부 환경에서 전역 인스턴스가 아닌 정적 메서드처럼 동작할 수 있음
  // 아래 코드는 그대로 둡니다.

  for (const stock of targetList) {
    try {
      // ✅ historical 메서드 호출 시 옵션 타입 명시
      const quote = await yahooFinance.historical(stock.code, { 
        period1: '2mo', // 최근 2달
        interval: '1d'  // 일봉
      }) as any[]; // TypeScript 오류 방지용 강제 캐스팅
      
      // 데이터 유효성 검사
      if (!Array.isArray(quote) || quote.length < 20) {
        console.warn(`⚠️ 데이터 부족: ${stock.name}`);
        continue;
      }

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
      // 에러 메시지 상세 출력
      console.error(`❌ 수집 실패 (${stock.name}):`, e.message || e);
      continue;
    }
    
    // 딜레이 (너무 짧으면 차단될 수 있으니 50ms 권장)
    await delay(50);
  }

  console.log(`📊 [System] 최종 수집된 종목 수: ${candidates.length}개`);

  if (candidates.length === 0) {
    console.error("🚨 [System] 수집된 데이터가 0개입니다.");
    return [];
  }

  // RSI 낮은 순 정렬
  candidates.sort((a, b) => Number(a.rsi) - Number(b.rsi));

  // 상위 10개 리턴
  return candidates.slice(0, 10);
}
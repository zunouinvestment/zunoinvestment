// src/app/api/cron/market-insight/route.ts
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2'; // ❌ 괄호가 있음
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessage } from '@/lib/telegram';
import { GoogleGenerativeAI } from "@google/generative-ai";

const yahooFinance = new YahooFinance(); // ✅ 2. 이 줄을 추가하여 실행 준비를 시킴
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  if (searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log("🚀 [Market Insight] 데이터 수집 시작...");

// 1. 야후 파이낸스에서 핵심 지표 수집
    const tickers = ['KRW=X', 'DX-Y.NYB', '^IXIC', '^GSPC', '^SOX', '^TNX', '^VIX'];
    const quotes = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tickers.map(async (ticker): Promise<any> => {
            try {
                return await yahooFinance.quote(ticker);
            } catch (e) {
                console.warn(`Failed to fetch ${ticker}:`, e);
                return null;
            }
        })
    );

    // 데이터 정리 (수집 실패 시 0으로 처리)
    const data = {
        usd_krw: quotes[0]?.regularMarketPrice || 0,
        dxy: quotes[1]?.regularMarketPrice || 0,
        nasdaq: quotes[2]?.regularMarketPrice || 0,
        sp500: quotes[3]?.regularMarketPrice || 0,
        sox: quotes[4]?.regularMarketPrice || 0,
        us10y: quotes[5]?.regularMarketPrice || 0,
        vix: quotes[6]?.regularMarketPrice || 0,
    };

    if (data.usd_krw === 0 && data.nasdaq === 0) {
        throw new Error("주요 데이터를 가져오지 못했습니다.");
    }

    // 2. Gemini AI에게 시황 분석 요청
    const prompt = `
      당신은 한국 주식 시장(KOSPI/KOSDAQ)을 분석하는 수석 매크로 경제 애널리스트입니다.
      아래는 방금 마감된 글로벌 금융 시장의 핵심 지표입니다.

      [오늘의 매크로 지표]
      - 원/달러 환율: ${data.usd_krw}원
      - 달러 인덱스: ${data.dxy}
      - 나스닥 지수: ${data.nasdaq}
      - S&P 500 지수: ${data.sp500}
      - 필라델피아 반도체 지수: ${data.sox}
      - 미국 국채 10년물 금리: ${data.us10y}%
      - VIX (공포지수): ${data.vix}

      [지시사항]
      위 데이터를 바탕으로 '오늘 한국 주식 시장에 미칠 영향'을 심층 분석하십시오.
      결과는 반드시 아래 JSON 형식으로만 출력하십시오. 절대 마크다운(\`\`\`)이나 다른 텍스트를 포함하지 마세요.

      {
        "ai_weather": "SUNNY", // 시장 전망. 아주 좋음=SUNNY, 보통/혼조세=CLOUDY, 나쁨/위험=RAINY 중 택 1
        "ai_summary": "환율 안정과 반도체 지수 상승으로 외국인 자금 유입이 기대되는 긍정적인 장세입니다.", // 1줄 요약
        "ai_report": "미국 나스닥과 필라델피아 반도체 지수가 강세를 보임에 따라 국내 IT 및 반도체 섹터의 상승이 예상됩니다. 국채 금리와 VIX 지수도 안정권에 머물고 있어 전반적인 투자 심리가 우호적입니다. 다만 환율 변동성에 주의하며 우량주 중심의 접근이 유효합니다." // 3~4문장의 상세 분석
      }
    `;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite", // 빠르고 안정적인 모델
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3,
        }
    });

    const generated = await model.generateContent(prompt);
    let cleanText = generated.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // JSON 추출 안전장치
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    const aiResult = JSON.parse(cleanText);

    // 3. DB 저장 (UPSERT 방식으로 당일 데이터 덮어쓰기)
    // 오늘 날짜 구하기 (KST 기준)
    const now = new Date();
    const kstTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const today = kstTime.toISOString().split('T')[0];

    // 기존 데이터가 있다면 삭제 (중복 방지)
    await supabaseAdmin.from('market_insights').delete().eq('target_date', today);

    // 새 데이터 삽입
    const { error: insertError } = await supabaseAdmin.from('market_insights').insert({
        target_date: today,
        usd_krw: data.usd_krw,
        dxy: data.dxy,
        nasdaq: data.nasdaq,
        sp500: data.sp500,
        sox: data.sox,
        us10y: data.us10y,
        vix: data.vix,
        ai_weather: aiResult.ai_weather,
        ai_summary: aiResult.ai_summary,
        ai_report: aiResult.ai_report
    });

    if (insertError) throw insertError;

    // 4. 텔레그램 알림 전송
    const weatherIcon = aiResult.ai_weather === 'SUNNY' ? '☀️' : aiResult.ai_weather === 'RAINY' ? '⛈️' : '☁️';
    const msg = `🌐 *[오늘의 마켓 인사이트]*\n\n` +
                `📊 *시장 날씨*: ${weatherIcon}\n` +
                `💡 *한줄평*: ${aiResult.ai_summary}\n\n` +
                `💵 환율: ${data.usd_krw.toFixed(1)}원\n` +
                `📉 나스닥: ${data.nasdaq.toFixed(2)}\n` +
                `🔌 SOX: ${data.sox.toFixed(2)}\n` +
                `🇺🇸 미 국채 10년: ${data.us10y.toFixed(3)}%\n\n` +
                `👉 [웹사이트에서 자세히 보기](https://zunoinvestment.vercel.app/market-insight)`;
    
    await sendTelegramMessage(msg);

    return NextResponse.json({ success: true, date: today, data, aiResult });

  } catch (error: any) {
    console.error("Market Insight Error:", error);
    await sendTelegramMessage(`⚠️ [Market Insight 실패]: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
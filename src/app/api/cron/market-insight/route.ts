// src/app/api/cron/market-insight/route.ts
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessage } from '@/lib/telegram';
import { GoogleGenerativeAI } from "@google/generative-ai";
// ✅ 네이버 뉴스 클라이언트 가져오기
import { fetchNaverNewsByKeyword } from '@/lib/naverNewsClient';

const yahooFinance = new YahooFinance();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  if (searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log("🚀 [Market Insight] 데이터 및 뉴스 수집 시작...");

    // 1. 야후 파이낸스에서 핵심 매크로 지표 수집 (정량적 데이터)
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
        throw new Error("주요 지표 데이터를 가져오지 못했습니다.");
    }

    // 2. 네이버 뉴스 API로 최신 주요 헤드라인 수집 (정성적 데이터)
    let newsHeadlines = "";
    try {
        // 코스피, 미국 증시, 경제 위기, 지정학적 이슈 등을 포괄하는 키워드로 최신 5개 검색
        const newsItems = await fetchNaverNewsByKeyword("글로벌 증시 OR 코스피 OR 지정학적", { 
            display: 7, 
            sort: 'sim' // 정확도 순(중요도 반영)
        });
        
        // HTML 태그(<b> 등) 제거하고 헤드라인만 텍스트로 결합
        newsHeadlines = newsItems.map(item => {
            const cleanTitle = item.title.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"');
            return `- ${cleanTitle}`;
        }).join('\n');
    } catch (newsError) {
        console.warn("뉴스 수집 실패:", newsError);
        newsHeadlines = "현재 최신 뉴스 헤드라인을 불러오지 못했습니다.";
    }

    // 3. Gemini AI에게 시황 분석 요청 (프롬프트 대폭 강화)
    const prompt = `
      당신은 한국 주식 시장(KOSPI/KOSDAQ)을 분석하는 수석 매크로 경제 애널리스트이자 전략가입니다.
      아래는 방금 마감된 글로벌 금융 시장의 '정량적 수치'와 현재 시장을 지배하는 '정성적 뉴스 헤드라인'입니다.

      [오늘의 매크로 지표 (정량적)]
      - 원/달러 환율: ${data.usd_krw}원
      - 달러 인덱스: ${data.dxy}
      - 나스닥 지수: ${data.nasdaq}
      - S&P 500 지수: ${data.sp500}
      - 필라델피아 반도체 지수: ${data.sox}
      - 미국 국채 10년물 금리: ${data.us10y}%
      - VIX (공포지수): ${data.vix}

      [오늘의 주요 경제/증시 뉴스 (정성적 이슈)]
      ${newsHeadlines}

      [지시사항]
      단순히 숫자를 읽어주는 수준을 넘어, 제시된 수치와 뉴스의 맥락을 융합하여 '오늘 한국 주식 시장에 미칠 실제적인 영향'을 통찰력 있게 분석하십시오.
      - 특히 뉴스에 등장하는 지정학적 리스크(전쟁, 제재 등), 금리 이벤트, 대형 악재/호재가 매크로 수치(예: 환율, VIX)와 어떻게 연결되는지 설명하세요.
      - 뻔한 소리보다는 실질적으로 투자자가 오늘 시장을 어떻게 대해야 하는지(방어적 태세, 저점 매수 기회 등)에 대한 스탠스를 명확히 해주세요.
      - 결과는 반드시 아래 JSON 형식으로만 출력하십시오. 절대 마크다운(\`\`\`)이나 다른 텍스트를 포함하지 마세요.

      {
        "ai_weather": "SUNNY", // 시장 전망. 아주 좋음/안도 랠리=SUNNY, 보통/관망세=CLOUDY, 나쁨/패닉/위험=RAINY 중 택 1
        "ai_summary": "중동 발 지정학적 리스크로 인한 VIX 급등과 환율 상승으로 외국인 수급 이탈이 우려되는 위험 장세입니다.", // 1줄 핵심 요약
        "ai_report": "밤사이 발생한 미국과 이란의 충돌 우려(뉴스 반영)로 인해 글로벌 위험 회피 심리가 극대화되었습니다. 이는 달러 인덱스 강세와 원/달러 환율 급등으로 이어져 오늘 국내 증시, 특히 코스피 대형주를 중심으로 외국인 매물 폭탄이 쏟아질 가능성이 높습니다. VIX 지수 또한 이를 반영하고 있으므로 섣부른 저점 매수보다는 현금 비중을 확대하며 사태의 추이를 관망하는 방어적 스탠스가 필요합니다." // 뉴스 배경과 수치를 융합한 심층 분석 (3~5문장)
      }
    `;

    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash", // 복잡한 맥락 추론을 위해 2.5-flash 표준 모델 사용 (할당량 부족 시 lite로 변경 가능)
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4, // 창의성과 분석력을 약간 더 허용하기 위해 0.4로 상향
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

    // 4. DB 저장
    const now = new Date();
    const kstTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Seoul"}));
    const today = kstTime.toISOString().split('T')[0];

    await supabaseAdmin.from('market_insights').delete().eq('target_date', today);

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

    // 5. 텔레그램 알림 전송
    const weatherIcon = aiResult.ai_weather === 'SUNNY' ? '☀️' : aiResult.ai_weather === 'RAINY' ? '⛈️' : '☁️';
    const msg = `🌐 *[오늘의 마켓 인사이트]*\n\n` +
                `📊 *시장 날씨*: ${weatherIcon}\n` +
                `💡 *핵심요약*: ${aiResult.ai_summary}\n\n` +
                `💵 환율: ${data.usd_krw.toFixed(1)}원\n` +
                `📉 나스닥: ${data.nasdaq.toFixed(2)}\n` +
                `⚡ VIX(공포): ${data.vix.toFixed(2)}\n\n` +
                `👉 [웹사이트에서 상세 리포트 보기](https://zunoinvestment.vercel.app/market-insight)`;
    
    await sendTelegramMessage(msg);

    return NextResponse.json({ success: true, date: today, data, aiResult, fetchedNewsCount: newsHeadlines.split('\n').length });

  } catch (error: any) {
    console.error("Market Insight Error:", error);
    await sendTelegramMessage(`⚠️ [Market Insight 실패]: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
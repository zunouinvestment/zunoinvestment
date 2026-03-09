// src/app/api/cron/market-insight/route.ts
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessage } from '@/lib/telegram';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchNaverNewsByKeyword } from '@/lib/naverNewsClient';

const yahooFinance = new YahooFinance();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);

    if (searchParams.get('key') !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log("🚀 [Market Insight] 다채로운 데이터 및 뉴스 수집 시작...");

        // 1. 야후 파이낸스에서 10가지 핵심 지표 수집 (원유, 금, 비트코인 추가)
        const tickers = ['KRW=X', 'DX-Y.NYB', '^IXIC', '^GSPC', '^SOX', '^TNX', '^VIX', 'CL=F', 'GC=F', 'BTC-USD'];
        const quotes = await Promise.all(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tickers.map(async (ticker): Promise<any> => {
                try { return await yahooFinance.quote(ticker); }
                catch (e) { return null; }
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
            wti: quotes[7]?.regularMarketPrice || 0,      // 원유
            gold: quotes[8]?.regularMarketPrice || 0,     // 금
            bitcoin: quotes[9]?.regularMarketPrice || 0,  // 비트코인
        };

        if (data.usd_krw === 0 && data.nasdaq === 0) throw new Error("주요 지표 수집 실패");

        // 2. 네이버 뉴스 API (과거 기사 차단 및 최신 24시간 기사만 필터링)
        let newsHeadlines = "";
        try {
            // 넉넉하게 15개를 '최신순(date)'으로 가져옴
            const newsItems = await fetchNaverNewsByKeyword("글로벌 경제 OR 미국 연준 금리 OR 지정학적 위기 OR 코스피 시황", {
                display: 15,
                sort: 'date' // ✅ 'sim'(정확도순)에서 'date'(최신순)으로 변경
            });

            // ✅ 24시간 이내에 작성된 기사만 걸러내는 로직 (과거 리스크 완벽 차단)
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentNews = newsItems
                .filter(item => new Date(item.pubDate) >= yesterday)
                .slice(0, 10); // 필터링된 것 중 상위 10개만 추출

            if (recentNews.length > 0) {
                newsHeadlines = recentNews.map(item => `- ${item.title.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"')}`).join('\n');
            } else {
                newsHeadlines = "최근 24시간 내 관련 주요 뉴스가 없습니다.";
            }
        } catch (e) {
            console.warn("뉴스 수집 실패:", e);
            newsHeadlines = "최신 뉴스를 불러오지 못했습니다.";
        }

        // 3. AI 프롬프트 극한 고도화 (뻔한 소리 금지, 입체적 분석 강제)
        const prompt = `
      당신은 30년 경력의 월스트리트 수석 매크로 전략가입니다. 매일 똑같은 뻔한 시황을 읽어주는 것을 가장 혐오하며, 군중이 보지 못하는 뉴스 이면의 '진짜 내러티브'와 '자금의 이동(Money Move)'을 포착해내는 능력이 탁월합니다.

      [오늘의 핵심 매크로 지표 (정량적)]
      - 환율: ${data.usd_krw}원 / 달러 인덱스: ${data.dxy}
      - 나스닥: ${data.nasdaq} / S&P500: ${data.sp500} / 반도체(SOX): ${data.sox}
      - 미 10년물 금리: ${data.us10y}% / VIX(공포): ${data.vix}
      - 원유(WTI): $${data.wti} / 금: $${data.gold} / 비트코인: $${data.bitcoin}

      [오늘 시장을 지배하는 주요 뉴스 (정성적)]
      ${newsHeadlines}

      [절대 준수 지시사항]
      1. '외국인 수급 이탈 우려', '관망세가 필요합니다' 같은 진부하고 교과서적인 표현을 절대 쓰지 마세요. 매일 멘트가 달라져야 합니다.
      2. 금, 비트코인, 원유 같은 대체 자산의 움직임이 뉴스의 '어떤 이슈'와 맞물려 움직이고 있는지 해석하세요. (예: 전쟁 공포로 금과 달러 동반 상승 등)
      3. 이런 글로벌 자금 흐름이 오늘 '한국 코스피 시장의 특정 섹터(예: 에너지, 방산, 반도체 등)'에 어떤 기회나 위협이 될지 콕 집어 정성적으로 묘사하세요.
      4. 결과는 무조건 순수 JSON으로만 출력하세요.

      {
        "ai_weather": "SUNNY", // 시장 전망. 안도/리스크온=SUNNY, 혼조세/순환매=CLOUDY, 공포/리스크오프=RAINY 중 택 1
        "ai_summary": "금과 달러로 피신하는 스마트머니. 반도체는 쉬어가고 에너지/방산이 주도하는 철저한 리스크오프 장세.", // 날카롭고 직관적인 1줄 요약 (매일 달라야 함)
        "ai_report": "밤사이 터진 중동 지정학적 마찰 뉴스가 WTI 유가를 끌어올리고 비트코인에서 자금을 빼내 전통적 안전자산인 금으로 이동시키고 있습니다. ... (중략) ... 이는 수출 중심의 한국 증시에 치명적이며, 특히 나스닥과 동조화되는 반도체 섹터의 강한 하방 압력이 예상됩니다. 오늘은 현금을 쥐고 방산이나 해운 등 헷지 테마의 단기 변동성만 노리는 게스트하우스 전략이 유리합니다." // 뉴스 내러티브와 지표를 엮은 날카로운 3~5문장 분석
      }
    `;

        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json", temperature: 0.7 } // 뻔한 소리를 줄이기 위해 창의성(온도) 대폭 상향
        });

        const generated = await model.generateContent(prompt);
        let cleanText = generated.response.text().replace(/```json/gi, "").replace(/```/g, "").trim();

        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) cleanText = cleanText.substring(firstBrace, lastBrace + 1);

        const aiResult = JSON.parse(cleanText);

        // 4. DB 저장
        const now = new Date();
        const kstTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
        const today = kstTime.toISOString().split('T')[0];

        await supabaseAdmin.from('market_insights').delete().eq('target_date', today);

        const { error: insertError } = await supabaseAdmin.from('market_insights').insert({
            target_date: today,
            ...data,
            ai_weather: aiResult.ai_weather,
            ai_summary: aiResult.ai_summary,
            ai_report: aiResult.ai_report
        });

        if (insertError) throw insertError;

        return NextResponse.json({ success: true, date: today });

    } catch (error: any) {
        console.error("Insight Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
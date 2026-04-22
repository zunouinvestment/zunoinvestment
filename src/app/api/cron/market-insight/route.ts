// src/app/api/cron/market-insight/route.ts
import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { sendTelegramMessage } from '@/lib/telegram';
import { verifyCronRequest } from '@/lib/cronAuth';
import { enforceRateLimit, getClientIp } from '@/lib/rateLimit';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchNaverNewsByKeyword } from '@/lib/naverNewsClient';

const yahooFinance = new YahooFinance();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
    const ip = getClientIp(req)
    const limited = enforceRateLimit(`cron:market-insight:${ip}`, 5, 60_000)
    if (!limited.ok) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
        )
    }

    const auth = verifyCronRequest(req);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
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

        // 2. 네이버 뉴스 API (테마별 다각화 및 기사 본문 요약 포함)
        let newsContext = "";
        try {
            // ✅ 4가지 핵심 테마로 나누어 골고루 검색
            const searchThemes = [
                "미국 연준 OR 인플레이션 OR 금리", // 매크로/정책
                "나스닥 OR 월가 증시 OR 빅테크",    // 글로벌/미국 증시
                "코스피 OR 외국인 수급 OR K배터리",  // 국내 증시/섹터
                "지정학적 위기 OR 원유 폭등 OR 전쟁" // 리스크/원자재
            ];

            let combinedNews: string[] = [];
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // 각 테마별로 최신 기사를 검색하여 상위 3개씩만 추출 (총 12개 뉴스)
            for (const theme of searchThemes) {
                const newsItems = await fetchNaverNewsByKeyword(theme, { display: 10, sort: 'date' });
                const recentNews = newsItems.filter(item => new Date(item.pubDate) >= yesterday).slice(0, 3);

                recentNews.forEach(item => {
                    const cleanTitle = item.title.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"');
                    // ✅ 기사 본문 요약(description) 추가 정제
                    const cleanDesc = item.description.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"');
                    // AI가 테마별로 인식하기 쉽게 포맷팅
                    combinedNews.push(`[${theme.split(' ')[0]} 이슈] ${cleanTitle}\n  └ 요약: ${cleanDesc}`);
                });
            }

            if (combinedNews.length > 0) {
                newsContext = combinedNews.join('\n\n');
            } else {
                newsContext = "최근 24시간 내 관련 주요 뉴스가 없습니다.";
            }
        } catch (e) {
            console.warn("뉴스 수집 실패:", e);
            newsContext = "최신 뉴스를 불러오지 못했습니다.";
        }

        // 3. AI 프롬프트 극한 고도화
        const prompt = `
      당신은 30년 경력의 월스트리트 수석 매크로 전략가입니다. 매일 똑같은 뻔한 시황을 읽어주는 것을 가장 혐오하며, 군중이 보지 못하는 뉴스 이면의 '진짜 내러티브'와 '자금의 이동(Money Move)'을 포착해내는 능력이 탁월합니다.

      [오늘의 핵심 매크로 지표 (정량적)]
      - 환율: ${data.usd_krw}원 / 달러 인덱스: ${data.dxy}
      - 나스닥: ${data.nasdaq} / S&P500: ${data.sp500} / 반도체(SOX): ${data.sox}
      - 미 10년물 금리: ${data.us10y}% / VIX(공포): ${data.vix}
      - 원유(WTI): $${data.wti} / 금: $${data.gold} / 비트코인: $${data.bitcoin}

      [오늘 시장을 지배하는 다각적 뉴스 브리핑 (정성적)]
      ${newsContext}

      [절대 준수 지시사항]
      1. '외국인 수급 이탈 우려', '관망세가 필요합니다' 같은 진부하고 교과서적인 표현을 절대 쓰지 마세요.
      2. 제공된 [다각적 뉴스 브리핑]의 내용을 매크로 수치와 결합하여 인과관계를 설명하세요. (예: 뉴스에 나온 특정 지정학적 사건이 WTI 유가를 어떻게 자극했고, 이것이 나스닥의 특정 섹터에 어떤 영향을 미쳤는지)
      3. 이런 글로벌 자금 흐름이 오늘 '한국 코스피 시장의 특정 섹터(예: 에너지, 방산, 반도체 등)'에 어떤 기회나 위협이 될지 콕 집어 정성적으로 묘사하세요.
      4. 결과는 무조건 순수 JSON으로만 출력하세요.

      {
        "ai_weather": "SUNNY", // 시장 전망. 안도/리스크온=SUNNY, 혼조세/순환매=CLOUDY, 공포/리스크오프=RAINY 중 택 1
        "ai_summary": "엔비디아 발 훈풍과 연준의 비둘기파적 발언이 맞물려 반도체 주도의 리스크 온 랠리가 전개되는 장세.", // 날카롭고 직관적인 1줄 요약 (매일 달라야 함)
        "ai_report": "밤사이 연준 인사들의 비둘기파적 발언(뉴스 요약 참고)이 국채 금리 하락을 유도하며 글로벌 증시의 숨통을 틔웠습니다. 특히 나스닥의 반등과 맞물려 필라델피아 반도체 지수가 강하게 튀어 올랐으며, 이는 오늘 코스피 시장에서 외국인들의 반도체 및 AI 밸류체인 쇼트 커버링(공매도 상환)을 강하게 유발할 촉매가 됩니다. 지정학적 리스크가 제한적인 가운데, 당분간 대형 기술주 중심의 비중 확대가 유효합니다."
      }
    `;

        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-flash-lite-preview",
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
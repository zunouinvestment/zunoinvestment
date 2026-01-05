// src/app/api/cron/daily-recommend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchOversoldStocks } from '@/lib/stockData';
import { sendTelegramMessage } from '@/lib/telegram';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('key') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 1. 완화된 기준으로 후보군 수집
    const candidates = await fetchOversoldStocks();

    if (candidates.length === 0) {
      await sendTelegramMessage("📉 [AI Recommend] 시장이 강력한 상승장이라 과매도 종목이 전무합니다.");
      return NextResponse.json({ message: 'No candidates found' });
    }

    // 2. Gemini에게 분석 요청
    const model = genAI.getGenerativeModel({ 
        model: "gemini-pro",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      너는 30년 경력의 냉철한 퀀트 투자자야.
      아래 데이터는 현재 KOSPI 종목 중 **RSI 지표가 상대적으로 낮은(과매도 구간에 근접한) 상위 15개 종목**이야.
      
      [후보군 데이터]
      ${JSON.stringify(candidates)}

      [지시사항]
      1. 위 후보군 중에서 **단기 반등 가능성이 가장 높아 보이는 5개 종목**을 선정해.
      2. 만약 완벽한 과매도(RSI 30 이하) 종목이 없더라도, **낙폭 과대 관점에서 기술적 반등이 기대되는 종목**을 반드시 5개 골라야 해.
      3. 목표가는 보수적으로(3~5% 수익) 잡아줘.
      4. 결과는 반드시 아래 JSON 형식으로만 출력해.

      [JSON 출력 형식]
      [
        {
          "code": "종목코드",
          "name": "종목명",
          "price": 현재가(숫자),
          "target_price": 5% 목표가(숫자),
          "reason_summary": "핵심 추천 이유 (한 문장)",
          "ai_analysis_detail": "상세 분석 내용. 왜 이 종목을 선정했는지 기술적 관점에서 설명."
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();
    const recommendations = JSON.parse(responseText);

    // 3. DB 저장 및 텔레그램 발송
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    let telegramMsg = `🤖 *[Gemini's 오늘의 낙폭과대 Pick]* (${today})\n\n`;

    for (const item of recommendations) {
        await supabaseAdmin.from('stock_ai_recommendations').insert({
            recommend_date: today,
            code: item.code,
            name: item.name,
            close_price: item.price,
            target_price: item.target_price,
            reason_summary: item.reason_summary,
            ai_analysis_detail: item.ai_analysis_detail
        });

        telegramMsg += `📌 *${item.name}* (${item.price.toLocaleString()}원)\n`;
        telegramMsg += `   🎯 목표: ${item.target_price.toLocaleString()}원\n`;
        telegramMsg += `   💡 ${item.reason_summary}\n\n`;
    }
    
    telegramMsg += `👉 [웹에서 보기](https://당신의도메인/ai-recommend)`;
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
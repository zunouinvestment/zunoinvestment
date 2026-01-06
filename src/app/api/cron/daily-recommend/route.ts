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
    // 1. KIS API 데이터 수집
    const candidates = await fetchOversoldStocks();

    if (candidates.length === 0) {
      await sendTelegramMessage("📉 [AI Recommend] 분석 대상 종목 데이터가 없습니다.");
      return NextResponse.json({ message: 'No candidates found' });
    }

    // 2. Gemini 분석 요청
    // ✅ 모델명: gemini-1.5-flash (라이브러리 업데이트 필수!)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest", 
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      당신은 30년 경력의 퀀트 투자 전문가입니다.
      아래는 현재 KOSPI 과매도(RSI 저평가) 종목들입니다.

      [후보군 데이터]
      ${JSON.stringify(candidates)}

      [지시사항]
      이 중 단기 반등 가능성이 가장 높은 5개 종목을 선정하여 JSON으로 출력하십시오.
      분석 내용은 투자자를 설득할 수 있도록 구체적이고 논리적이어야 합니다.

      [JSON 출력 형식]
      [
        {
          "code": "종목코드",
          "name": "종목명",
          "price": 현재가(숫자),
          "target_price": 5% 목표가(숫자),
          "reason_summary": "핵심 추천 이유 (한 문장)",
          "ai_analysis_detail": "상세 분석 (150자 내외)"
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();
    const recommendations = JSON.parse(responseText);

    // 3. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    let telegramMsg = `🤖 *[Gemini 1.5 Flash 분석]* (${today})\n\n`;

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
    
    // 도메인 주소는 본인의 것으로 수정해주세요
    telegramMsg += `👉 [상세 리포트 보기](https://zunoinvestment.vercel.app/ai-recommend)`;
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length });

  } catch (error: any) {
    console.error("Gemini Error:", error); // 에러 로그 상세 출력
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
// src/app/api/cron/daily-recommend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchOversoldStocks } from '@/lib/stockData';
import { sendTelegramMessage } from '@/lib/telegram';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  
  // 보안 키 확인
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

    // -----------------------------------------------------------
    // 🚨 [긴급 조치] 모델을 'gemini-pro'로 변경 (404 에러 회피)
    // -----------------------------------------------------------
    
    // 1. 모델 인스턴스 생성 (generationConfig 제거)
    // gemini-pro는 application/json 설정을 지원하지 않을 수 있어 제거함.
    const model = genAI.getGenerativeModel({ 
        model: "gemini-pro" 
    });

    // 2. 프롬프트 강화 (JSON만 뱉어내도록 강력하게 지시)
    const prompt = `
      You are a stock market expert.
      Analyze the following KOSPI oversold stocks:
      ${JSON.stringify(candidates)}

      Select top 5 stocks for short-term rebound.
      
      CRITICAL INSTRUCTION:
      Output MUST be a valid JSON array only. 
      Do NOT use Markdown code blocks (like \`\`\`json).
      Do NOT add any explanation before or after the JSON.
      
      Format:
      [
        {
          "code": "StockCode",
          "name": "StockName",
          "price": 0,
          "target_price": 0,
          "reason_summary": "Summary in Korean",
          "ai_analysis_detail": "Detail in Korean (150 chars)"
        }
      ]
    `;

    // 3. 요청 및 응답 처리
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let responseText = response.text();

    // 🚨 안전장치: 마크다운 기호 제거 (gemini-pro가 가끔 붙임)
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    // 4. JSON 파싱 시도
    let recommendations;
    try {
        recommendations = JSON.parse(responseText);
    } catch (e) {
        console.error("JSON Parse Error:", responseText);
        // 파싱 실패 시 원본 텍스트라도 보내서 디버깅
        await sendTelegramMessage(`⚠️ [JSON 파싱 실패] AI 응답이 올바르지 않습니다.\n${responseText.slice(0, 100)}...`);
        return NextResponse.json({ error: "JSON Parse Error" }, { status: 500 });
    }

    // -----------------------------------------------------------

    // 3. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    let telegramMsg = `🤖 *[Gemini Pro 분석]* (${today})\n\n`;

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
    
    telegramMsg += `👉 [상세 리포트 보기](https://zunoinvestment.vercel.app/ai-recommend)`;
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length });

  } catch (error: any) {
    console.error("Gemini Error:", error);
    await sendTelegramMessage(`⚠️ [Gemini 오류] ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
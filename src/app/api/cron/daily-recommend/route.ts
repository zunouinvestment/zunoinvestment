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

    // 2. Gemini 분석 요청 (gemini-2.5-flash 사용)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash" 
    });

    const prompt = `
      당신은 30년 경력의 월가 퀀트 투자 전문가입니다.
      아래는 현재 KOSPI 과매도(RSI 저평가) 종목들입니다.

      [후보군 데이터]
      ${JSON.stringify(candidates)}

      [지시사항]
      이 중 '단기 반등'과 '구조적 저평가' 매력이 가장 높은 5개 종목을 엄선하십시오.
      
      [필수 출력 규칙]
      1. 결과는 오직 **JSON 배열** 형식으로만 출력하세요.
      2. 마크다운 기호(\`\`\`json)나 서론, 결론 같은 사족을 절대 붙이지 마세요.
      3. 분석 내용은 한국어로 작성하며, 투자자를 설득할 수 있는 날카로운 통찰력을 담으세요.

      [JSON 예시]
      [
        {
          "code": "005930",
          "name": "삼성전자",
          "price": 70000,
          "target_price": 73500,
          "reason_summary": "반도체 업황 턴어라운드 기대감",
          "ai_analysis_detail": "RSI 28로 과매도 구간 진입. 최근 외국인 수급이 개선되고 있으며..."
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let responseText = response.text();

    // 마크다운 제거
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    let recommendations;
    try {
        recommendations = JSON.parse(responseText);
    } catch (e) {
        console.error("JSON Parse Error:", responseText);
        await sendTelegramMessage(`⚠️ [시스템] AI 응답 파싱 실패. 원본: ${responseText.slice(0, 50)}...`);
        return NextResponse.json({ error: "JSON Parse Error" }, { status: 500 });
    }

    // 3. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    // 🚨 [수정됨] Gemini 문구 제거 -> 'AI 심층 분석'으로 변경
    let telegramMsg = `📈 *[오늘의 AI 심층 분석]* (${today})\n\n`;

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
        telegramMsg += `   💬 ${item.reason_summary}\n\n`;
    }
    
    // 🚨 [수정됨] 링크 문구 변경
    telegramMsg += `👉 [전체 리포트 & 과거기록 보기](https://zunoinvestment.vercel.app/ai-recommend)`;
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length });

  } catch (error: any) {
    console.error("Gemini Error:", error);
    await sendTelegramMessage(`⚠️ [시스템 오류] ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
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

    // 2. Gemini 분석 요청
    // 🚨 [수정됨] 모델명을 가장 안정적인 'gemini-1.5-flash'로 변경
    // (Pro 모델은 API 키 권한에 따라 404가 뜰 수 있음)
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash", 
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `
      당신은 월가에서 30년 경력을 쌓은 전설적인 퀀트 펀드 매니저입니다.
      아래 데이터는 현재 KOSPI 시장에서 과매도(Oversold) 시그널이 포착된 상위 종목들입니다.
      
      [후보군 데이터]
      ${JSON.stringify(candidates)}

      [지시사항]
      이 종목들 중, 단순한 기술적 반등을 넘어 **'구조적 저평가'** 상태이거나 **'확실한 단기 반등 모멘텀'**이 있는 종목 **Top 5**를 엄선하십시오.
      
      분석 시 다음을 고려하십시오:
      1. RSI가 낮더라도 하락 추세가 너무 강한 종목은 배제할 것.
      2. 3줄 요약이 아닌, 투자자를 설득할 수 있는 날카로운 인사이트를 담을 것.
      
      [JSON 출력 형식]
      [
        {
          "code": "종목코드",
          "name": "종목명",
          "price": 현재가(숫자),
          "target_price": 5% 목표가(숫자),
          "reason_summary": "강력한 추천 헤드라인 (한 문장)",
          "ai_analysis_detail": "투자자가 이 종목을 지금 사야 하는 논리적인 이유. 기술적 지표와 시장 심리를 결합하여 200자 내외로 서술."
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    const responseText = await result.response.text();
    const recommendations = JSON.parse(responseText);

    // 3. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    let telegramMsg = `🧠 *[Gemini AI 심층 분석]* (${today})\n\n`;

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
    
    // 도메인 주소 수정 필요 (본인의 실제 도메인 입력)
    telegramMsg += `👉 [상세 리포트 보기](https://zunoinvestment.vercel.app/ai-recommend)`; 
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length });

  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
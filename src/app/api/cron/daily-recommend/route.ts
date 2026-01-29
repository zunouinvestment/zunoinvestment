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

    // ✅ [데이터 최적화] AI 토큰 절약을 위해 핵심 데이터만 전송
    const optimizedCandidates = candidates.map(item => ({
        code: item.code,
        name: item.name,
        price: item.price,       
        change: item.changeRate, 
        rsi: item.rsi,           
    })).slice(0, 30); // 상위 30개로 제한

    // 2. Gemini 분석 요청 (모델 우회 전략)
    const modelsToTry = [
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite", 
        "gemini-2.0-flash-lite-001"
    ];
    
    let result = null;
    let usedModelName = "";
    let lastError = null;

    const prompt = `
      당신은 30년 경력의 월가 퀀트 투자 전문가입니다.
      아래는 현재 KOSPI 과매도(RSI 저평가) 종목들의 핵심 지표입니다.

      [후보군 데이터]
      ${JSON.stringify(optimizedCandidates)}

      [지시사항]
      이 중 '단기 반등' 매력이 가장 높은 5개 종목을 엄선하십시오.
      
      [필수 출력 규칙]
      1. 결과는 오직 **JSON 배열** 형식으로만 출력하세요.
      2. 마크다운 기호(\`\`\`json)나 설명, 서론, 결론을 절대 포함하지 마세요.
      3. 분석 내용은 한국어로 작성하며, 투자자를 설득할 수 있는 날카로운 통찰력을 담으세요.

      [JSON 예시]
      [
        {
          "code": "005930",
          "name": "삼성전자",
          "price": 70000,
          "target_price": 73500,
          "reason_summary": "RSI 28 진입 및 반도체 업황 턴어라운드 기대",
          "ai_analysis_detail": "현재 RSI 28로 과매도 구간에 진입했습니다. 최근 등락률을 고려할 때 기술적 반등이 유력해 보입니다..."
        }
      ]
    `;

    // 모델 순차 시도
    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 시도 중인 모델: ${modelName}`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: {
                    responseMimeType: "application/json", // JSON 모드 강제 (지원하는 모델의 경우)
                    maxOutputTokens: 2000, 
                    temperature: 0.5, // 창의성 낮춤 -> 포맷 준수율 높임
                }
            });
            
            const generated = await model.generateContent(prompt);
            result = generated;
            usedModelName = modelName;
            console.log(`✅ 성공: ${modelName}`);
            break; 
        } catch (e: any) {
            console.warn(`⚠️ ${modelName} 실패: ${e.message}`);
            lastError = e;
        }
    }

    if (!result) {
        await sendTelegramMessage(`⚠️ [AI 실패] 모든 모델 할당량/오류. (${lastError?.message?.slice(0, 50)}...)`);
        throw new Error(`모든 AI 모델 응답 불가. 마지막 에러: ${lastError?.message}`);
    }

    const response = await result.response;
    let responseText = response.text();

    // ✅ [강력한 파싱 로직 적용]
    // 1. 마크다운 기호 제거
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // 2. JSON 배열 부분만 정확히 추출 (앞뒤 사족 제거)
    const firstBracket = responseText.indexOf('[');
    const lastBracket = responseText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1) {
        responseText = responseText.substring(firstBracket, lastBracket + 1);
    } else {
        // 배열을 못 찾았으면 에러 처리
        throw new Error("Invalid JSON structure: No array found");
    }

    let recommendations;
    try {
        recommendations = JSON.parse(responseText);
    } catch (e) {
        console.error("JSON Parse Error:", responseText);
        await sendTelegramMessage(`⚠️ [시스템] AI 응답 파싱 실패. 원본: ${responseText.slice(0, 50)}...`);
        return NextResponse.json({ error: "JSON Parse Error", raw: responseText }, { status: 500 });
    }

    // 3. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    const cleanModelName = usedModelName.replace('models/', '').replace('gemini-', '');
    let telegramMsg = `📈 *[오늘의 AI 심층 분석]*\n🤖 Model: ${cleanModelName}\n📅 ${today}\n\n`;

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
    
    telegramMsg += `👉 [전체 리포트 & 과거기록 보기](https://zunoinvestment.vercel.app/ai-recommend)`;
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length, model: usedModelName });

  } catch (error: any) {
    console.error("Gemini Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
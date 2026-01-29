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

    // 데이터 최적화
    const optimizedCandidates = candidates.map(item => ({
        code: item.code,
        name: item.name,
        price: item.price,       
        change: item.changeRate, 
        rsi: item.rsi,           
    })).slice(0, 30); 

    // 2. Gemini 분석 요청
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
      3. **객체로 감싸지 말고, 순수한 배열([ ... ])로만 출력하세요.**

      [JSON 예시]
      [
        {
          "code": "005930",
          "name": "삼성전자",
          "price": 70000,
          "target_price": 73500,
          "reason_summary": "RSI 28 진입 및 반도체 업황 턴어라운드 기대",
          "ai_analysis_detail": "현재 RSI 28로 과매도 구간에 진입했습니다..."
        }
      ]
    `;

    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 시도 중인 모델: ${modelName}`);
            const model = genAI.getGenerativeModel({ 
                model: modelName,
                generationConfig: {
                    // JSON 모드 제거 (텍스트로 받아서 직접 파싱이 더 유연함)
                    maxOutputTokens: 3000, 
                    temperature: 0.4, 
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
        await sendTelegramMessage(`⚠️ [AI 실패] 모델 응답 불가. (${lastError?.message?.slice(0, 50)}...)`);
        throw new Error(`모든 AI 모델 응답 불가.`);
    }

    const response = await result.response;
    let responseText = response.text();

    console.log("🔍 AI Raw Response:", responseText.slice(0, 100) + "..."); // 디버깅용 로그

    // ✅ [강력한 파싱 로직]
    // 1. 마크다운 제거
    responseText = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    let recommendations;
    
    try {
        // 2. 1차 시도: 그냥 파싱
        recommendations = JSON.parse(responseText);
    } catch (e) {
        // 3. 2차 시도: 배열 부분만 추출해서 파싱
        const firstBracket = responseText.indexOf('[');
        const lastBracket = responseText.lastIndexOf(']');
        
        if (firstBracket !== -1 && lastBracket !== -1) {
            try {
                const jsonStr = responseText.substring(firstBracket, lastBracket + 1);
                recommendations = JSON.parse(jsonStr);
            } catch (innerE) {
                console.error("Extraction Parse Error:", innerE);
            }
        }
    }

    // 4. 3차 시도: 그래도 실패했거나, 파싱은 됐는데 배열이 아니라 객체인 경우 ({ "data": [...] })
    if (!Array.isArray(recommendations)) {
        if (typeof recommendations === 'object' && recommendations !== null) {
            // 객체 안에서 배열인 값을 찾음
            const arrayVal = Object.values(recommendations).find(val => Array.isArray(val));
            if (arrayVal) {
                recommendations = arrayVal;
            } else {
                // 단일 객체라면 배열로 감쌈
                recommendations = [recommendations];
            }
        } else {
            // 진짜 실패
            console.error("❌ Final JSON Parsing Failed. Raw Text:", responseText);
            await sendTelegramMessage(`⚠️ [파싱 실패] AI가 올바르지 않은 JSON을 반환했습니다.\nRaw: ${responseText.slice(0, 50)}...`);
            return NextResponse.json({ error: "Invalid JSON structure", raw: responseText }, { status: 500 });
        }
    }

    // 5. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    const cleanModelName = usedModelName.replace('models/', '').replace('gemini-', '');
    let telegramMsg = `📈 *[오늘의 AI 심층 분석]*\n🤖 Model: ${cleanModelName}\n📅 ${today}\n\n`;

    for (const item of recommendations) {
        // 필수 필드 체크
        if (!item.code || !item.name) continue;

        await supabaseAdmin.from('stock_ai_recommendations').insert({
            recommend_date: today,
            code: item.code,
            name: item.name,
            close_price: item.price || 0,
            target_price: item.target_price || 0,
            reason_summary: item.reason_summary || "분석 내용 없음",
            ai_analysis_detail: item.ai_analysis_detail || "상세 분석 없음"
        });

        telegramMsg += `📌 *${item.name}* (${(item.price || 0).toLocaleString()}원)\n`;
        telegramMsg += `   🎯 목표: ${(item.target_price || 0).toLocaleString()}원\n`;
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
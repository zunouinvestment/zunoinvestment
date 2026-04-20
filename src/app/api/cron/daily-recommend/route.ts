// src/app/api/cron/daily-recommend/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { fetchOversoldStocks } from '@/lib/stockData';
import { sendTelegramMessage } from '@/lib/telegram';
import { verifyCronRequest } from '@/lib/cronAuth';
import { enforceRateLimit, getClientIp } from '@/lib/rateLimit';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const limited = enforceRateLimit(`cron:daily-recommend:${ip}`, 5, 60_000)
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
    // 1. KIS API 데이터 수집
    const candidates = await fetchOversoldStocks();

    if (candidates.length === 0) {
      await sendTelegramMessage("📉 [AI Recommend] 분석 대상 종목 데이터가 없습니다.");
      return NextResponse.json({ message: 'No candidates found' });
    }

    // ✅ [데이터 최적화] AI 토큰 낭비 방지 (필수 지표만 전송)
    const optimizedCandidates = candidates.map(item => ({
        code: item.code,
        name: item.name,
        price: item.price,       
        change: item.changeRate, 
        rsi: item.rsi,           
    })).slice(0, 30); // 상위 30개 종목으로 제한

    // 2. Gemini 분석 요청 (지원 중단된 모델 제외, 최신 생존 모델만 배치)
    const modelsToTry = [
        "gemini-2.5-flash-lite",     // 1순위: 최신 경량 (무료 할당량 가장 많음, 에러 확률 최소)
        "gemini-2.5-flash",          // 2순위: 최신 표준 (성능 우수)
        "gemini-2.0-flash-lite-001"  // 3순위: 구버전 경량 (최후의 보루)
    ];
    
    let result = null;
    let usedModelName = "";
    let lastError = null;

    // ✅ 프롬프트 강화: 딴소리 원천 차단
    const prompt = `
      당신은 30년 경력의 월가 퀀트 투자 전문가입니다.
      아래는 현재 KOSPI 과매도(RSI 저평가) 종목들의 핵심 지표입니다.

      [후보군 데이터]
      ${JSON.stringify(optimizedCandidates)}

      [지시사항]
      이 중 '단기 반등' 매력이 가장 높은 5개 종목을 엄선하십시오.
      
      [필수 출력 규칙 - 반드시 지키세요]
      1. 결과는 무조건 **배열([ ... ])** 형태의 순수 JSON으로만 출력하세요.
      2. 인사말, 서론, 결론, 요약 등 어떤 설명도 추가하지 마세요.
      3. 마크다운 기호(\`\`\`json 등)를 사용하지 마세요.
      4. 반환하는 데이터의 최상위 타입은 무조건 배열(Array)이어야 합니다.

      [출력 템플릿 - 이 형태를 정확히 유지하세요]
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
                    // JSON 형식 강제
                    responseMimeType: "application/json",
                    maxOutputTokens: 3000, 
                    temperature: 0.2, // 온도를 낮춰서 정해진 형식만 출력하도록 통제
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
        await sendTelegramMessage(`⚠️ [AI 실패] API 할당량 초과 또는 응답 불가. 새로운 키를 발급받거나 내일 다시 시도하세요.`);
        throw new Error(`모든 AI 모델 응답 불가. (Quota Exceeded)`);
    }

    const response = await result.response;
    let responseText = response.text();

    console.log("🔍 AI Raw Response Preview:", responseText.slice(0, 150)); 

    // ✅ [강력한 데이터 도려내기 로직]
    let recommendations;
    
    // 1. 마크다운 찌꺼기 완벽 제거
    let cleanText = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    // 2. 텍스트 중에서 가장 먼저 나오는 '[' 와 가장 마지막에 나오는 ']' 사이만 완벽하게 추출
    const firstBracket = cleanText.indexOf('[');
    const lastBracket = cleanText.lastIndexOf(']');
    
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        cleanText = cleanText.substring(firstBracket, lastBracket + 1);
    } else {
        // 배열 기호 [] 가 아예 없다면 객체 {} 형태인지 확인
        const objStart = cleanText.indexOf('{');
        const objEnd = cleanText.lastIndexOf('}');
        if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
            cleanText = cleanText.substring(objStart, objEnd + 1);
        }
    }

    // 3. 파싱 시도
    try {
        recommendations = JSON.parse(cleanText);
    } catch (e) {
        console.error("❌ JSON Parse Error. Cleaned Text:", cleanText);
        await sendTelegramMessage(`⚠️ [시스템] AI 응답 파싱 실패.\nRaw: ${cleanText.slice(0, 50)}...`);
        return NextResponse.json({ error: "Invalid JSON structure", raw: cleanText }, { status: 500 });
    }

    // 4. 데이터 정규화 (무조건 배열 형태로 만들기)
    if (!Array.isArray(recommendations)) {
        if (typeof recommendations === 'object' && recommendations !== null) {
            // AI가 { "recommendations": [...] } 형식으로 감싸서 줬을 때 알맹이만 빼기
            const arrayVal = Object.values(recommendations).find(val => Array.isArray(val));
            if (arrayVal) {
                recommendations = arrayVal;
            } else {
                // 단일 객체라면 강제로 배열로 변환
                recommendations = [recommendations];
            }
        } else {
            console.error("❌ Parsed data is neither Array nor Object:", recommendations);
            return NextResponse.json({ error: "Parsed data is not valid", raw: cleanText }, { status: 500 });
        }
    }

    // 5. DB 저장 및 알림
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin.from('stock_ai_recommendations').delete().eq('recommend_date', today);

    const cleanModelName = usedModelName.replace('models/', '').replace('gemini-', '');
    let telegramMsg = `📈 *[오늘의 AI 심층 분석]*\n🤖 Model: ${cleanModelName}\n📅 ${today}\n\n`;

    for (const item of recommendations) {
        // 깡통 데이터 방어
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
    
    telegramMsg += `👉 [전체 리포트 보기](https://zunoinvestment.vercel.app/ai-recommend)`;
    await sendTelegramMessage(telegramMsg);

    return NextResponse.json({ success: true, count: recommendations.length, model: usedModelName });

  } catch (error: any) {
    console.error("Gemini Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
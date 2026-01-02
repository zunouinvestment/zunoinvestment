// src/app/api/expenses/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase as supabaseClient } from '@/lib/supabaseClient'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// DB 작업용 클라이언트 (Admin 권한 우선 사용)
const supabase = supabaseAdmin || supabaseClient

// 날짜 포맷터 (YYYY-MM-DD)
function formatYMD(year: number, month: number, day: number): string {
  const date = new Date(year, month, day)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// GET: 목록 조회
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('mode') || 'transaction'
  
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const month = searchParams.get('month') 
  const card = searchParams.get('card')
  const categoryId = searchParams.get('categoryId')

  let query = supabase
    .from('expenses')
    .select('*, category:expense_categories(*)')
    .order(mode === 'payment' ? 'payment_date' : 'transaction_date', { ascending: false })
    .order('id', { ascending: false })

  const targetCol = mode === 'payment' ? 'payment_date' : 'transaction_date'

  if (startDate && endDate) {
    query = query.gte(targetCol, startDate).lte(targetCol, endDate)
  } else if (month) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const nextDate = new Date(y, m, 1)
    const end = nextDate.toISOString().split('T')[0]
    query = query.gte(targetCol, start).lt(targetCol, end)
  }

  if (card && card !== 'ALL') {
    query = query.eq('card_company', card)
  }

  if (categoryId && categoryId !== 'ALL' && !isNaN(Number(categoryId))) {
    query = query.eq('category_id', categoryId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: 지출 항목 추가 (✅ 에러 수정됨)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    // 🚨 중요: DB에 없는 필드(category 객체, id 등)를 확실히 제거
    const { id, category, created_at, ...inputData } = body

    // 필수 값 체크 (amount가 0일 수도 있으므로 undefined 체크)
    if (!inputData.transaction_date || inputData.amount === undefined || !inputData.description) {
        return NextResponse.json({ error: '필수 항목(날짜, 금액, 내역)이 누락되었습니다.' }, { status: 400 })
    }

    // 결제예정일 처리
    let finalPaymentDate = inputData.payment_date === '' ? null : inputData.payment_date;

    // 결제일 자동 계산 로직
    if (!finalPaymentDate) {
        const { data: settings } = await supabase.from('card_settings').select('*')
        
        if (settings) {
            const companyName = String(inputData.card_company).trim();
            const setting = settings.find((s: any) => 
                companyName.includes(s.card_company) || s.card_company.includes(companyName)
            );
            
            if (setting) {
                if (setting.calc_type === 'immediate') {
                    finalPaymentDate = inputData.transaction_date;
                } else {
                    const txDate = new Date(inputData.transaction_date); 
                    const day = txDate.getDate();
                    let targetMonth = txDate.getMonth();
                    let targetYear = txDate.getFullYear();
                    
                    if (day >= setting.usage_start_day) {
                        targetMonth += 1;
                    }
                    finalPaymentDate = formatYMD(targetYear, targetMonth, setting.payment_day);
                }
            }
        }
    }

    // 최종 저장 데이터 구성
    const insertData = {
        ...inputData, // category 등의 필드가 제거된 상태
        payment_date: finalPaymentDate,
    }

    const { error } = await supabase
      .from('expenses')
      .insert([insertData])

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('POST Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PATCH: 내역 수정 (✅ 에러 수정됨)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    
    // 🚨 중요: DB에 없는 필드를 확실히 제거
    const { id, category, created_at, ...updates } = body
    
    // 빈 날짜 처리
    if (updates.payment_date === '') updates.payment_date = null;

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { error } = await supabase
      .from('expenses')
      .update(updates) // 정제된 데이터만 업데이트
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE: 내역 삭제
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
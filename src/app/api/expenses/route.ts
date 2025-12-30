// src/app/api/expenses/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// 날짜 포맷터 헬퍼 (YYYY-MM-DD)
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
  const categoryId = searchParams.get('categoryId') // ✅ 카테고리 필터 추가

  let query = supabase
    .from('expenses')
    .select('*, category:expense_categories(*)')
    .order(mode === 'payment' ? 'payment_date' : 'transaction_date', { ascending: false })
    .order('id', { ascending: false })

  const targetCol = mode === 'payment' ? 'payment_date' : 'transaction_date'

  // 기간 조회
  if (startDate && endDate) {
    query = query.gte(targetCol, startDate).lte(targetCol, endDate)
  } else if (month) {
    const start = `${month}-01`
    const [y, m] = month.split('-').map(Number)
    const nextDate = new Date(y, m, 1)
    const end = nextDate.toISOString().split('T')[0]
    query = query.gte(targetCol, start).lt(targetCol, end)
  }

  // 카드사 필터
  if (card && card !== 'ALL') {
    query = query.eq('card_company', card)
  }

  // ✅ 카테고리 필터 로직
  if (categoryId && categoryId !== 'ALL') {
    // "1" 처럼 ID가 오면 특정 소분류, "P_식비" 처럼 오면 대분류로 처리하는 방식 등 고려 가능하나
    // 여기서는 UI에서 소분류 ID를 넘겨준다고 가정 (또는 대분류 필터링을 원하면 아래 로직 수정 필요)
    // 현재는 'parent_name' 필터링을 위해 category 테이블 join 조건을 걸어야 하는데 
    // supabase join 필터는 복잡하므로, 일단은 간단하게 category_id 필터만 지원하거나
    // 프론트에서 filtering 하는 게 더 빠를 수 있음.
    // 하지만 여기선 category_id (소분류) 필터 지원
    query = query.eq('category_id', categoryId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: 지출 항목 추가
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    
    if (!body.transaction_date || !body.amount || !body.description) {
        return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    let finalPaymentDate = body.payment_date === '' ? null : body.payment_date;

    if (!finalPaymentDate) {
        const { data: settings } = await supabase.from('card_settings').select('*')
        
        if (settings) {
            const companyName = body.card_company.trim();
            const setting = settings.find((s: any) => 
                companyName.includes(s.card_company) || s.card_company.includes(companyName)
            );
            
            if (setting) {
                if (setting.calc_type === 'immediate') {
                    finalPaymentDate = body.transaction_date;
                } else {
                    // ✅ 날짜 밀림 방지 로직 적용
                    const txDate = new Date(body.transaction_date); 
                    const day = txDate.getDate();
                    let targetMonth = txDate.getMonth();
                    let targetYear = txDate.getFullYear();
                    
                    if (day >= setting.usage_start_day) {
                        targetMonth += 1;
                    }
                    
                    // toISOString 사용 금지 -> formatYMD 사용
                    finalPaymentDate = formatYMD(targetYear, targetMonth, setting.payment_day);
                }
            }
        }
    }

    const insertData = {
        ...body,
        payment_date: finalPaymentDate,
        category: undefined
    }

    const { error } = await supabase.from('expenses').insert([insertData])
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, category, created_at, ...updates } = body
    if (updates.payment_date === '') updates.payment_date = null;

    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { error } = await supabase.from('expenses').update(updates).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

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
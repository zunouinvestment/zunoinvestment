// src/app/api/expenses/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'
import { parseExpenseExcel } from '@/lib/expense/parser'
import { ExpenseCategory, CardSetting } from '@/lib/expense/types'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })

    // 1. 카테고리 & 카드설정 로드
    const { data: categories } = await supabase.from('expense_categories').select('*')
    const { data: settings } = await supabase.from('card_settings').select('*')
    
    // 2. 파싱 (설정 정보 전달)
    const arrayBuffer = await file.arrayBuffer()
    const insertData = await parseExpenseExcel(
      arrayBuffer,
      (categories as ExpenseCategory[]) || [],
      (settings as CardSetting[]) || []
    )

    if (insertData.length === 0) {
      return NextResponse.json({ error: '유효한 데이터가 없습니다.' }, { status: 400 })
    }

    // 3. 저장
    const { error: insertError } = await supabase
      .from('expenses')
      .insert(insertData)

    if (insertError) throw new Error(insertError.message)

    return NextResponse.json({ count: insertData.length, success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
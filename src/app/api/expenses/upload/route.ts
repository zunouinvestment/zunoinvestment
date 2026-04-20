// src/app/api/expenses/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseExpenseExcel } from '@/lib/expense/parser'
import { ExpenseCategory, CardSetting } from '@/lib/expense/types'
import { enforceRateLimit, getClientIp } from '@/lib/rateLimit'
import { getServerSupabaseClient, requireUserId } from '@/lib/serverAuth'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024
const ALLOWED_UPLOAD_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream',
])

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = await getServerSupabaseClient()

    const ip = getClientIp(req)
    const limited = enforceRateLimit(`expenses:upload:${ip}`, 15, 60_000)
    if (!limited.ok) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } }
      )
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: '파일이 없습니다.' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
      return NextResponse.json({ error: '엑셀 파일만 업로드할 수 있습니다.' }, { status: 400 })
    }
    if (!ALLOWED_UPLOAD_TYPES.has(file.type)) {
      return NextResponse.json({ error: '허용되지 않은 파일 형식입니다.' }, { status: 400 })
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: '파일 크기는 5MB 이하여야 합니다.' }, { status: 400 })
    }

    // 1. 카테고리 & 카드설정 로드
    const { data: categories } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('user_id', auth.userId)
    const { data: settings } = await supabase
      .from('card_settings')
      .select('*')
      .eq('user_id', auth.userId)
    
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
      .insert(insertData.map((row) => ({ ...row, user_id: auth.userId })))

    if (insertError) throw new Error(insertError.message)

    return NextResponse.json({ count: insertData.length, success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
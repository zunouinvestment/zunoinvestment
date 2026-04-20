// src/app/api/expenses/categories/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabaseClient, requireUserId } from '@/lib/serverAuth'
import { ensureExpenseLegacyOwnership } from '@/lib/expenseLegacyBackfill'

export async function GET() {
  const auth = await requireUserId()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  await ensureExpenseLegacyOwnership(auth.userId)
  const supabase = await getServerSupabaseClient()

  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('user_id', auth.userId)
    .order('id')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

// 카테고리 추가
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = await getServerSupabaseClient()

    const body = await req.json()
    // keywords가 문자열로 들어올 경우 배열로 변환 처리 (콤마 구분)
    if (typeof body.keywords === 'string') {
        body.keywords = body.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
    }
    
    const { data, error } = await supabase
      .from('expense_categories')
      .insert([{ ...body, user_id: auth.userId }])
      .select()

    if (error) throw error
    return NextResponse.json({ success: true, data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// 카테고리 수정
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireUserId()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = await getServerSupabaseClient()

    const body = await req.json()
    const { id, ...updates } = body

    if (typeof updates.keywords === 'string') {
        updates.keywords = updates.keywords.split(',').map((k: string) => k.trim()).filter(Boolean)
    }

    const { error } = await supabase
      .from('expense_categories')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// 카테고리 삭제
export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireUserId()
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const supabase = await getServerSupabaseClient()

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    
    if (!id) return NextResponse.json({ error: 'ID is required' }, { status: 400 })

    const { error } = await supabase
      .from('expense_categories')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err: any) {
    // 외래키 제약조건(이미 사용중인 카테고리) 에러 처리
    if (err.code === '23503') {
        return NextResponse.json({ error: '이미 사용 중인 카테고리는 삭제할 수 없습니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
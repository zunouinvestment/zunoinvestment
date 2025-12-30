// src/app/api/expenses/settings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET() {
  const { data, error } = await supabase.from('card_settings').select('*').order('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { card_company, payment_day, usage_start_day, calc_type } = body
  
  const { error } = await supabase
    .from('card_settings')
    .upsert({ 
      card_company, 
      payment_day, 
      usage_start_day, 
      calc_type: calc_type || 'sliding' 
    }, { onConflict: 'card_company' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// ✅ 삭제 기능 추가
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const company = searchParams.get('company')
  
  if (!company) return NextResponse.json({ error: 'Company name is required' }, { status: 400 })

  const { error } = await supabase
    .from('card_settings')
    .delete()
    .eq('card_company', company)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
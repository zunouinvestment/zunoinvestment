// src/app/api/stocks/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 서버 전용이니까 service role key를 써도 됨 (클라이언트에 노출 X)
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Supabase URL 또는 SERVICE ROLE KEY가 설정되어 있지 않습니다.',
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ items: [] });
  }

  // 한 글자 검색은 너무 노이즈가 많으니 2글자 이상부터 검색
  if (q.length < 2) {
    return NextResponse.json(
      { error: '2글자 이상 입력해 주세요.' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from('stock_master')
    .select('code, name, market')
    .ilike('name', `%${q}%`)
    .order('name', { ascending: true })
    .limit(30);

  if (error) {
    console.error('[api/stocks/search] error', error);
    return NextResponse.json(
      { error: '종목명 검색 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    items: data ?? [],
  });
}

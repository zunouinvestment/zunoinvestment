// src/app/api/stocks/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 서버 시작 시 한 번만 체크
if (!supabaseUrl || !supabaseAnonKey) {
  // 여기서 throw 해도 되고, console.error만 찍어도 됨
  // 에러 나면 API 라우트 호출 시 HTML 에러 페이지가 내려오니 꼭 설정 필요
  console.error(
    '[api/stocks/search] Supabase URL 또는 ANON KEY가 설정되어 있지 않습니다.',
  );
}

const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

type StockSearchItem = {
  code: string;
  name: string;
  market: string | null;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase 클라이언트가 초기화되지 않았습니다.' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();

  if (!q) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  if (q.length < 2) {
    return NextResponse.json(
      { error: '종목명은 2글자 이상 입력해 주세요.' },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await supabase
      .from('stock_master')
      .select('code, name, market')
      .ilike('name', `%${q}%`)
      .order('name', { ascending: true })
      .limit(30);

    if (error) {
      // eslint-disable-next-line no-console
      console.error('[api/stocks/search] Supabase error:', error);
      return NextResponse.json(
        { error: '종목명 검색 중 오류가 발생했습니다.' },
        { status: 500 },
      );
    }

    const items: StockSearchItem[] = (data ?? []).map((row) => ({
      code: row.code,
      name: row.name,
      market: row.market ?? null,
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[api/stocks/search] unexpected error:', err);
    return NextResponse.json(
      { error: '종목명 검색 중 알 수 없는 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}

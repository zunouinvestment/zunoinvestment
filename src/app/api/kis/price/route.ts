// src/app/api/kis/price/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDomesticStockPrice } from '@/lib/kisClient';

export const runtime = 'nodejs'; // 서버 전용 런타임 (Edge 아님)

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.json(
      { error: 'code 쿼리 파라미터가 필요합니다.' },
      { status: 400 },
    );
  }

  try {
    const price = await getDomesticStockPrice(code);
    return NextResponse.json(price, { status: 200 });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('GET /api/kis/price error', error);
    const message =
      error instanceof Error
        ? error.message
        : 'KIS 가격 조회 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

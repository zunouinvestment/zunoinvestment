import { NextRequest, NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cronAuth';
import { getTelegramSubscribers, listTelegramSubscribers } from '@/lib/telegram';

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const subscribers = await getTelegramSubscribers();
  let rows: Awaited<ReturnType<typeof listTelegramSubscribers>> = [];

  try {
    rows = await listTelegramSubscribers();
  } catch {
    rows = [];
  }

  return NextResponse.json({
    count: subscribers.length,
    subscribers,
    records: rows,
  });
}

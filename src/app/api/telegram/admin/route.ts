import { NextRequest, NextResponse } from 'next/server';
import { verifyCronRequest } from '@/lib/cronAuth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getActiveSubscribers,
  getRecentMessageLogs,
  insertTelegramMessageLog,
  sendTelegramMessageToChatId,
} from '@/lib/telegram';

export async function GET(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [subscribers, logs, eventsResult] = await Promise.all([
    getActiveSubscribers(200),
    getRecentMessageLogs(50),
    supabaseAdmin
      .from('telegram_subscription_events')
      .select('chat_id, event_type, note, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  return NextResponse.json({
    subscribers,
    logs,
    events: eventsResult.data || [],
    eventError: eventsResult.error?.message || null,
  });
}

export async function POST(req: NextRequest) {
  const auth = verifyCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const chatId = String(body?.chatId || '').trim();
    const text = String(body?.text || '').trim();

    if (!chatId || !text) {
      return NextResponse.json({ error: 'chatId and text are required' }, { status: 400 });
    }

    const result = await sendTelegramMessageToChatId(chatId, `👤 관리자 답변\n${text}`);

    await insertTelegramMessageLog({
      targetChatId: chatId,
      messageType: 'admin_reply',
      messageText: text,
      status: result.ok ? 'success' : 'failed',
      errorMessage: result.ok ? null : JSON.stringify(result.data),
      payload: result.data,
      source: 'web_admin',
    });

    if (!result.ok) {
      return NextResponse.json({ error: 'Telegram send failed', detail: result.data }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// src/lib/telegram.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin';

type TelegramSubscriberRecord = {
  chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  is_active: boolean;
  subscribed_at: string | null;
  updated_at: string | null;
};

type TelegramSendResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

type TelegramKeyboardButton = { text: string };

type TelegramReplyMarkup = {
  keyboard: TelegramKeyboardButton[][];
  resize_keyboard?: boolean;
};

function normalizeChatIds(raw: string): string[] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function getEnvTelegramSubscribers(): string[] {
  const chatIds = new Set<string>();

  if (process.env.TELEGRAM_CHAT_ID) {
    chatIds.add(process.env.TELEGRAM_CHAT_ID.trim());
  }

  if (process.env.TELEGRAM_CHAT_IDS) {
    for (const chatId of normalizeChatIds(process.env.TELEGRAM_CHAT_IDS)) {
      chatIds.add(chatId);
    }
  }

  return Array.from(chatIds);
}

function getAdminChatIds(): string[] {
  const admins = new Set<string>();
  if (process.env.TELEGRAM_ADMIN_CHAT_ID) {
    admins.add(process.env.TELEGRAM_ADMIN_CHAT_ID.trim());
  }
  if (process.env.TELEGRAM_ADMIN_CHAT_IDS) {
    for (const chatId of normalizeChatIds(process.env.TELEGRAM_ADMIN_CHAT_IDS)) {
      admins.add(chatId);
    }
  }
  return Array.from(admins);
}

export function isTelegramAdmin(chatId: string): boolean {
  return getAdminChatIds().includes(chatId);
}

export async function getTelegramSubscribers(): Promise<string[]> {
  const chatIds = new Set<string>(getEnvTelegramSubscribers());

  try {
    const { data, error } = await supabaseAdmin
      .from('telegram_subscribers')
      .select('chat_id')
      .eq('is_active', true);

    if (error) {
      console.warn('Telegram subscriber fetch failed:', error.message);
      return Array.from(chatIds);
    }

    for (const row of data || []) {
      if (row.chat_id) chatIds.add(String(row.chat_id).trim());
    }
  } catch (error) {
    console.warn('Telegram subscriber fetch exception:', error);
  }

  return Array.from(chatIds);
}

export async function listTelegramSubscribers(): Promise<TelegramSubscriberRecord[]> {
  const { data, error } = await supabaseAdmin
    .from('telegram_subscribers')
    .select('chat_id, username, first_name, last_name, is_active, subscribed_at, updated_at')
    .order('subscribed_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []) as TelegramSubscriberRecord[];
}

export async function upsertTelegramSubscriber(input: {
  chatId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin.from('telegram_subscribers').upsert(
    {
      chat_id: input.chatId,
      username: input.username ?? null,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      is_active: true,
      subscribed_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'chat_id' }
  );

  if (error) {
    throw new Error(error.message);
  }

  await logSubscriptionEvent({
    chatId: input.chatId,
    eventType: 'subscribe',
    note: 'User subscribed via bot command',
  });
}

export async function unsubscribeTelegramSubscriber(chatId: string) {
  const { error } = await supabaseAdmin
    .from('telegram_subscribers')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('chat_id', chatId);

  if (error) {
    throw new Error(error.message);
  }

  await logSubscriptionEvent({
    chatId,
    eventType: 'unsubscribe',
    note: 'User unsubscribed via bot command',
  });
}

export async function sendTelegramMessageToChatId(
  chatId: string,
  text: string,
  options?: {
    replyMarkup?: TelegramReplyMarkup;
    parseMode?: 'Markdown' | 'HTML';
  }
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, status: 0, data: { error: 'Missing TELEGRAM_BOT_TOKEN' } };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: options?.parseMode ?? 'Markdown',
      reply_markup: options?.replyMarkup,
    }),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data };
}

async function insertMessageLog(row: {
  targetChatId: string;
  messageType: string;
  messageText: string;
  status: 'success' | 'failed';
  errorMessage?: string | null;
  payload?: unknown;
  source?: string;
}) {
  try {
    await supabaseAdmin.from('telegram_message_logs').insert({
      target_chat_id: row.targetChatId,
      message_type: row.messageType,
      message_text: row.messageText,
      status: row.status,
      error_message: row.errorMessage ?? null,
      payload: row.payload ?? null,
      source: row.source ?? null,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('telegram_message_logs insert failed:', error);
  }
}

export async function logSubscriptionEvent(input: {
  chatId: string;
  eventType: 'subscribe' | 'unsubscribe';
  note?: string | null;
}) {
  try {
    await supabaseAdmin.from('telegram_subscription_events').insert({
      chat_id: input.chatId,
      event_type: input.eventType,
      note: input.note ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('telegram_subscription_events insert failed:', error);
  }
}

export async function getRecentMessageLogs(limit = 20) {
  const { data, error } = await supabaseAdmin
    .from('telegram_message_logs')
    .select('target_chat_id, message_type, status, error_message, source, sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) {
    // Table may not exist yet in early rollout.
    console.warn('telegram_message_logs read failed:', error.message);
    return [];
  }
  return data || [];
}

export async function getActiveSubscribers(limit = 50) {
  const { data, error } = await supabaseAdmin
    .from('telegram_subscribers')
    .select('chat_id, username, first_name, last_name, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('telegram_subscribers read failed:', error.message);
    return [];
  }
  return data || [];
}

export async function notifyAdminsUserMessage(input: {
  fromChatId: string;
  username?: string | null;
  firstName?: string | null;
  text: string;
}) {
  const admins = getAdminChatIds();
  if (admins.length === 0) return;

  const sender = input.username ? `@${input.username}` : input.firstName || 'Unknown';
  const payload = `📨 사용자 문의\n- chat_id: \`${input.fromChatId}\`\n- user: ${sender}\n- 내용: ${input.text}\n\n답장: \`/reply ${input.fromChatId} 메시지\``;

  for (const adminId of admins) {
    await sendTelegramMessageToChatId(adminId, payload);
  }
}

export async function sendAdminMenu(chatId: string) {
  const menu: TelegramReplyMarkup = {
    keyboard: [
      [{ text: '📋 구독자 목록' }, { text: '🧾 최근 발송로그' }],
      [{ text: '💬 답장 방법' }, { text: '❓ 도움말' }],
    ],
    resize_keyboard: true,
  };

  await sendTelegramMessageToChatId(chatId, '관리자 메뉴입니다.', {
    replyMarkup: menu,
    parseMode: 'Markdown',
  });
}

export async function sendTelegramMessage(text: string) {
  const subscribers = await getTelegramSubscribers();

  if (subscribers.length === 0) return;

  for (const chatId of subscribers) {
    try {
      const result = await sendTelegramMessageToChatId(chatId, text);
      await insertMessageLog({
        targetChatId: chatId,
        messageType: 'broadcast',
        messageText: text,
        status: result.ok ? 'success' : 'failed',
        errorMessage: result.ok ? null : JSON.stringify(result.data),
        payload: result.data,
        source: 'sendTelegramMessage',
      });
    } catch (error) {
      console.error(`Telegram Error [${chatId}]:`, error);
      await insertMessageLog({
        targetChatId: chatId,
        messageType: 'broadcast',
        messageText: text,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : String(error),
        source: 'sendTelegramMessage',
      });
    }
  }
}
import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveSubscribers,
  getRecentMessageLogs,
  isTelegramAdmin,
  notifyAdminsUserMessage,
  sendAdminMenu,
  sendTelegramMessageToChatId,
  unsubscribeTelegramSubscriber,
  upsertTelegramSubscriber,
} from '@/lib/telegram';

function verifyTelegramWebhookSecret(req: NextRequest): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const provided = req.headers.get('x-telegram-bot-api-secret-token');
  return provided === expected;
}

export async function POST(req: NextRequest) {
  if (!verifyTelegramWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const update = await req.json();
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = String(message?.text || '').trim().toLowerCase();

    if (!chatId) {
      return NextResponse.json({ ok: true, ignored: 'No chat id' });
    }

    const chatIdStr = String(chatId);
    const username = message?.from?.username ?? null;
    const firstName = message?.from?.first_name ?? null;
    const lastName = message?.from?.last_name ?? null;
    const isAdmin = isTelegramAdmin(chatIdStr);

    if (text.startsWith('/reply ') && isAdmin) {
      const match = text.match(/^\/reply\s+(-?\d+)\s+([\s\S]+)$/i);
      if (!match) {
        await sendTelegramMessageToChatId(
          chatIdStr,
          '형식 오류입니다. 예: /reply 123456789 안녕하세요'
        );
        return NextResponse.json({ ok: true });
      }

      const targetChatId = match[1];
      const replyText = match[2];
      const result = await sendTelegramMessageToChatId(targetChatId, `👤 관리자 답변\n${replyText}`);

      if (result.ok) {
        await sendTelegramMessageToChatId(chatIdStr, `전송 완료: ${targetChatId}`);
      } else {
        await sendTelegramMessageToChatId(
          chatIdStr,
          `전송 실패: ${targetChatId}\n사유: ${JSON.stringify(result.data)}`
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (text === '/start' || text === '/subscribe') {
      await upsertTelegramSubscriber({ chatId: chatIdStr, username, firstName, lastName });
      await sendTelegramMessageToChatId(
        chatIdStr,
        '구독이 완료되었습니다. 이제 AI 심층 분석 알림을 받아보실 수 있어요.\n문의는 자유롭게 메시지 남겨주세요.'
      );
      if (isAdmin) {
        await sendAdminMenu(chatIdStr);
      }
    } else if (text === '/stop' || text === '/unsubscribe') {
      await unsubscribeTelegramSubscriber(chatIdStr);
      await sendTelegramMessageToChatId(chatIdStr, '구독이 해지되었습니다.');
    } else if ((text === '/menu' || text === '📋 구독자 목록' || text === '🧾 최근 발송로그' || text === '💬 답장 방법' || text === '❓ 도움말') && isAdmin) {
      if (text === '/menu') {
        await sendAdminMenu(chatIdStr);
      } else if (text === '📋 구독자 목록') {
        const subscribers = await getActiveSubscribers(30);
        if (subscribers.length === 0) {
          await sendTelegramMessageToChatId(chatIdStr, '활성 구독자가 없습니다.');
        } else {
          const lines = subscribers.map((s, i) => {
            const name = s.username ? `@${s.username}` : `${s.first_name || ''} ${s.last_name || ''}`.trim();
            return `${i + 1}. \`${s.chat_id}\` ${name ? `(${name})` : ''}`;
          });
          await sendTelegramMessageToChatId(
            chatIdStr,
            `현재 활성 구독자 ${subscribers.length}명\n\n${lines.join('\n')}`
          );
        }
      } else if (text === '🧾 최근 발송로그') {
        const logs = await getRecentMessageLogs(15);
        if (logs.length === 0) {
          await sendTelegramMessageToChatId(chatIdStr, '최근 발송 로그가 없습니다.');
        } else {
          const lines = logs.map((l) => {
            const statusIcon = l.status === 'success' ? '✅' : '❌';
            return `${statusIcon} \`${l.target_chat_id}\` ${l.message_type} (${l.sent_at})`;
          });
          await sendTelegramMessageToChatId(chatIdStr, `최근 발송 로그\n\n${lines.join('\n')}`);
        }
      } else if (text === '💬 답장 방법') {
        await sendTelegramMessageToChatId(
          chatIdStr,
          '사용자에게 답장하려면 아래 형식을 사용하세요.\n`/reply <chat_id> <메시지>`\n예: `/reply 123456789 안녕하세요. 문의 주신 내용 답변드립니다.`'
        );
      } else {
        await sendTelegramMessageToChatId(
          chatIdStr,
          '관리자 명령어\n/menu : 메뉴 표시\n/reply <chat_id> <메시지> : 특정 사용자에게 답장'
        );
      }
    } else if (text === '/help') {
      await sendTelegramMessageToChatId(
        chatIdStr,
        '사용 가능한 명령어\n/start 또는 /subscribe: 구독 시작\n/stop 또는 /unsubscribe: 구독 해지'
      );
    } else {
      // 일반 사용자의 자유 텍스트는 관리자에게 전달
      if (!isAdmin && text) {
        await notifyAdminsUserMessage({
          fromChatId: chatIdStr,
          username,
          firstName,
          text: String(message?.text || ''),
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Telegram webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}

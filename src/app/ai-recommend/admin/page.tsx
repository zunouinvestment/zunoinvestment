'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, MessageCircle, RefreshCw, Send, Users } from 'lucide-react';

type Subscriber = {
  chat_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  updated_at: string;
};

type LogItem = {
  target_chat_id: string;
  message_type: string;
  message_text?: string;
  status: 'success' | 'failed';
  error_message: string | null;
  source: string | null;
  sent_at: string;
};

type EventItem = {
  chat_id: string;
  event_type: 'subscribe' | 'unsubscribe';
  note: string | null;
  created_at: string;
};

export default function AIRecommendAdminPage() {
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [messageText, setMessageText] = useState('');

  const activeCount = subscribers.length;

  const recentFailures = useMemo(
    () => logs.filter((item) => item.status === 'failed').length,
    [logs]
  );

  const conversationUsers = useMemo(() => {
    const nameMap = new Map<string, string>();
    for (const s of subscribers) {
      const label = s.username
        ? `@${s.username}`
        : `${s.first_name || ''} ${s.last_name || ''}`.trim() || '이름 없음';
      nameMap.set(s.chat_id, label);
    }

    const chatSet = new Set<string>();
    subscribers.forEach((s) => chatSet.add(s.chat_id));
    logs.forEach((l) => chatSet.add(l.target_chat_id));

    return Array.from(chatSet).map((chatId) => {
      const latestLog = logs.find((l) => l.target_chat_id === chatId);
      return {
        chatId,
        name: nameMap.get(chatId) || '미등록 사용자',
        latestAt: latestLog?.sent_at || '',
        latestType: latestLog?.message_type || '',
      };
    }).sort((a, b) => (a.latestAt < b.latestAt ? 1 : -1));
  }, [logs, subscribers]);

  const selectedConversation = useMemo(() => {
    if (!selectedChatId) return [];
    return logs
      .filter((l) => l.target_chat_id === selectedChatId)
      .slice()
      .sort((a, b) => (a.sent_at > b.sent_at ? 1 : -1));
  }, [logs, selectedChatId]);

  const fetchDashboard = async () => {
    if (!secret) {
      alert('CRON_SECRET를 입력하세요.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/telegram/admin', {
        headers: { Authorization: `Bearer ${secret}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');

      setSubscribers(data.subscribers || []);
      setLogs(data.logs || []);
      setEvents(data.events || []);
      if (!selectedChatId && data.subscribers?.[0]?.chat_id) {
        setSelectedChatId(data.subscribers[0].chat_id);
      }
    } catch (error: unknown) {
      alert(`조회 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  const sendReply = async () => {
    if (!secret) {
      alert('CRON_SECRET를 입력하세요.');
      return;
    }
    if (!selectedChatId || !messageText) {
      alert('대화할 사용자를 선택하고 메시지를 입력하세요.');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/telegram/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ chatId: selectedChatId, text: messageText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '전송 실패');

      alert('메시지 전송 완료');
      setMessageText('');
      await fetchDashboard();
    } catch (error: unknown) {
      alert(`전송 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Recommend 관리자 메뉴</h1>
          <p className="text-sm text-gray-500">구독자/로그 조회 및 사용자 답장 관리</p>
        </div>
        <Link
          href="/ai-recommend"
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          AI Recommend로 돌아가기
        </Link>
      </div>

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <label className="text-sm font-semibold text-gray-700">관리자 키 (CRON_SECRET)</label>
        <div className="flex gap-2">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="CRON_SECRET 입력"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={fetchDashboard}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            새로고침
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500">활성 구독자</div>
          <div className="text-2xl font-bold mt-1">{activeCount}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500">최근 로그 건수</div>
          <div className="text-2xl font-bold mt-1">{logs.length}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500">최근 실패 건수</div>
          <div className="text-2xl font-bold mt-1 text-red-600">{recentFailures}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-3">
          <MessageCircle className="w-4 h-4 text-indigo-600" />
          사용자 대화
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="border rounded-lg p-2 max-h-[420px] overflow-auto space-y-2">
            {conversationUsers.map((u) => (
              <button
                key={u.chatId}
                onClick={() => setSelectedChatId(u.chatId)}
                className={`w-full text-left rounded-lg p-2 border transition ${
                  selectedChatId === u.chatId
                    ? 'bg-indigo-50 border-indigo-300'
                    : 'bg-white hover:bg-gray-50 border-gray-200'
                }`}
              >
                <div className="text-xs font-mono text-gray-600">{u.chatId}</div>
                <div className="text-sm font-semibold text-gray-900">{u.name}</div>
                <div className="text-[11px] text-gray-500">
                  {u.latestType || '대화 없음'}
                </div>
              </button>
            ))}
            {conversationUsers.length === 0 && (
              <p className="text-sm text-gray-500 p-2">표시할 대화 사용자가 없습니다.</p>
            )}
          </div>

          <div className="lg:col-span-2 border rounded-lg p-3 flex flex-col gap-3">
            <div className="text-xs text-gray-500">
              선택된 사용자: <span className="font-mono">{selectedChatId || '-'}</span>
            </div>

            <div className="flex-1 max-h-[300px] overflow-auto space-y-2 bg-gray-50 rounded-lg p-2 border">
              {selectedConversation.map((msg, idx) => {
                const isAdminReply = msg.message_type === 'admin_reply';
                return (
                  <div
                    key={`${msg.target_chat_id}-${msg.sent_at}-${idx}`}
                    className={`text-sm rounded-lg p-2 border ${
                      isAdminReply ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="text-[11px] text-gray-500 mb-1">
                      {msg.message_type} · {new Date(msg.sent_at).toLocaleString('ko-KR')}
                    </div>
                    <div className="text-gray-800 whitespace-pre-wrap">
                      {msg.error_message ? `(실패) ${msg.error_message}` : msg.message_text || '메시지 기록됨'}
                    </div>
                  </div>
                );
              })}
              {selectedChatId && selectedConversation.length === 0 && (
                <p className="text-sm text-gray-500">해당 사용자의 로그가 없습니다.</p>
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="메시지를 입력하세요"
                className="flex-1 border rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={sendReply}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                보내기
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-blue-600" />
            활성 구독자 목록
          </h2>
          <div className="max-h-80 overflow-auto space-y-2">
            {subscribers.map((s) => (
              <div key={s.chat_id} className="text-sm border rounded-lg p-2">
                <div className="font-mono text-xs text-gray-700">{s.chat_id}</div>
                <div className="text-gray-600">
                  {s.username ? `@${s.username}` : `${s.first_name || ''} ${s.last_name || ''}`.trim() || '-'}
                </div>
              </div>
            ))}
            {subscribers.length === 0 && <p className="text-sm text-gray-500">조회된 구독자가 없습니다.</p>}
          </div>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h2 className="text-base font-bold text-gray-900 mb-3">최근 발송 로그</h2>
          <div className="max-h-80 overflow-auto space-y-2">
            {logs.map((l, idx) => (
              <div key={`${l.target_chat_id}-${idx}`} className="text-sm border rounded-lg p-2">
                <div className="font-mono text-xs text-gray-700">{l.target_chat_id}</div>
                <div className={l.status === 'success' ? 'text-emerald-600' : 'text-red-600'}>
                  {l.status.toUpperCase()} · {l.message_type}
                </div>
                <div className="text-xs text-gray-500">{new Date(l.sent_at).toLocaleString('ko-KR')}</div>
              </div>
            ))}
            {logs.length === 0 && <p className="text-sm text-gray-500">조회된 로그가 없습니다.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4">
        <h2 className="text-base font-bold text-gray-900 mb-3">최근 구독 이벤트</h2>
        <div className="max-h-72 overflow-auto space-y-2">
          {events.map((e, idx) => (
            <div key={`${e.chat_id}-${idx}`} className="text-sm border rounded-lg p-2 flex justify-between gap-2">
              <div>
                <div className="font-mono text-xs text-gray-700">{e.chat_id}</div>
                <div className="text-gray-700">{e.event_type}</div>
              </div>
              <div className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString('ko-KR')}</div>
            </div>
          ))}
          {events.length === 0 && <p className="text-sm text-gray-500">조회된 이벤트가 없습니다.</p>}
        </div>
      </div>
    </div>
  );
}

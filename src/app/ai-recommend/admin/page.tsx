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
  const [targetChatId, setTargetChatId] = useState('');
  const [messageText, setMessageText] = useState('');

  const activeCount = subscribers.length;

  const recentFailures = useMemo(
    () => logs.filter((item) => item.status === 'failed').length,
    [logs]
  );

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
    if (!targetChatId || !messageText) {
      alert('chat_id와 메시지를 입력하세요.');
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
        body: JSON.stringify({ chatId: targetChatId, text: messageText }),
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

      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-indigo-600" />
          사용자에게 답장 보내기
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            value={targetChatId}
            onChange={(e) => setTargetChatId(e.target.value)}
            placeholder="대상 chat_id"
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <input
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="전송 메시지"
            className="md:col-span-2 border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={sendReply}
          disabled={sending}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          답장 전송
        </button>
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

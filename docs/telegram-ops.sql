create table if not exists public.telegram_subscription_events (
  id bigint generated always as identity primary key,
  chat_id text not null,
  event_type text not null check (event_type in ('subscribe', 'unsubscribe')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_subscription_events_chat_id_idx
  on public.telegram_subscription_events (chat_id, created_at desc);

create table if not exists public.telegram_message_logs (
  id bigint generated always as identity primary key,
  target_chat_id text not null,
  message_type text not null default 'broadcast',
  message_text text not null,
  status text not null check (status in ('success', 'failed')),
  error_message text,
  payload jsonb,
  source text,
  sent_at timestamptz not null default now()
);

create index if not exists telegram_message_logs_sent_at_idx
  on public.telegram_message_logs (sent_at desc);

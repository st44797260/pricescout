-- ============================================================
-- 报告中心 + AI 助手对话记录
-- ============================================================

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  -- 结构化报告内容：{ config, competitors, top_products, pricing, trends, model }
  content jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_created_at
  on public.reports (created_at desc);

create table if not exists public.chat_logs (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_logs_session
  on public.chat_logs (session_id, created_at);

-- RLS：与既有表一致的演示期策略，接入认证后收紧
alter table public.reports enable row level security;
alter table public.chat_logs enable row level security;

drop policy if exists "demo_allow_all_reports" on public.reports;
create policy "demo_allow_all_reports" on public.reports
  for all using (true) with check (true);

drop policy if exists "demo_allow_all_chat_logs" on public.chat_logs;
create policy "demo_allow_all_chat_logs" on public.chat_logs
  for all using (true) with check (true);

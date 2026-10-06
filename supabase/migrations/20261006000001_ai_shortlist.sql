-- ============================================================
-- AI 选品分析：评分结果与选品清单
-- ============================================================

-- AI 分析结果（每次分析替换同产品的旧记录，仅保留最新）
create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products (id) on delete cascade,
  scores jsonb not null default '{}',
  total_score numeric(5, 2) not null default 0,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_analyses_product
  on public.analyses (product_id);
create index if not exists idx_analyses_created_at
  on public.analyses (created_at desc);

-- 选品清单（同一产品只允许加入一次）
create table if not exists public.shortlist (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products (id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  unique (product_id)
);

create index if not exists idx_shortlist_created_at
  on public.shortlist (created_at desc);

-- RLS：与既有表保持一致的演示期策略，接入认证后收紧
alter table public.analyses enable row level security;
alter table public.shortlist enable row level security;

drop policy if exists "demo_allow_all_analyses" on public.analyses;
create policy "demo_allow_all_analyses" on public.analyses
  for all using (true) with check (true);

drop policy if exists "demo_allow_all_shortlist" on public.shortlist;
create policy "demo_allow_all_shortlist" on public.shortlist
  for all using (true) with check (true);

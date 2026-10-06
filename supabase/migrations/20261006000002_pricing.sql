-- ============================================================
-- 智能定价：保存的定价方案
-- ============================================================

create table if not exists public.pricing_suggestions (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  cost numeric(12, 2) not null,
  target_margin numeric(5, 2) not null,
  shipping_cost numeric(12, 2) not null default 0,
  platform_fee numeric(5, 2) not null default 0,
  suggested_price_low numeric(12, 2),
  suggested_price_recommended numeric(12, 2),
  suggested_price_high numeric(12, 2),
  strategy_text text,
  -- 竞品分布 { count, min, max, median, avg, buckets, matched, percentile, risks, market }
  competitor_distribution jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_pricing_created_at
  on public.pricing_suggestions (created_at desc);

-- RLS：与既有表一致的演示期策略，接入认证后收紧
alter table public.pricing_suggestions enable row level security;

drop policy if exists "demo_allow_all_pricing" on public.pricing_suggestions;
create policy "demo_allow_all_pricing" on public.pricing_suggestions
  for all using (true) with check (true);

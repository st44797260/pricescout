-- ============================================================
-- 异常事件（价格波动 / 新品 / 口碑变化）
-- ============================================================

create table if not exists public.anomalies (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid references public.competitors (id) on delete cascade,
  product_id uuid references public.products (id) on delete cascade,
  type text not null
    check (type in ('price_drop', 'price_rise', 'new_product', 'rating_drop')),
  description text not null,
  change_value numeric(12, 2),
  detected_at timestamptz not null default now(),
  is_read boolean not null default false
);

create index if not exists idx_anomalies_detected_at
  on public.anomalies (detected_at desc);
create index if not exists idx_anomalies_product
  on public.anomalies (product_id);
create index if not exists idx_anomalies_competitor
  on public.anomalies (competitor_id);

-- RLS：与既有表一致的演示期策略，接入认证后收紧
alter table public.anomalies enable row level security;

drop policy if exists "demo_allow_all_anomalies" on public.anomalies;
create policy "demo_allow_all_anomalies" on public.anomalies
  for all using (true) with check (true);

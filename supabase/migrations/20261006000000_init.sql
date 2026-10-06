-- ============================================================
-- PriceScout 初始表结构：competitors / products / snapshots
-- ============================================================

-- 竞品店铺
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  platform text not null default 'custom'
    check (platform in ('shopify', 'woocommerce', 'custom')),
  product_count int not null default 0,
  last_scraped_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'scraping', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

-- 竞品产品（每次采集全量替换）
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null
    references public.competitors (id) on delete cascade,
  title text not null,
  price numeric(12, 2),
  rating numeric(3, 2),
  review_count int not null default 0,
  image_url text,
  product_url text,
  scraped_at timestamptz not null default now()
);

-- 产品价格/评分快照（用于趋势分析）
create table if not exists public.snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null
    references public.products (id) on delete cascade,
  price numeric(12, 2),
  rating numeric(3, 2),
  review_count int,
  snapshot_date date not null default current_date
);

create index if not exists idx_products_competitor
  on public.products (competitor_id);
create index if not exists idx_products_scraped_at
  on public.products (scraped_at desc);
create index if not exists idx_snapshots_product
  on public.snapshots (product_id);
create index if not exists idx_snapshots_date
  on public.snapshots (snapshot_date);

-- ------------------------------------------------------------
-- RLS：当前为单机演示阶段，先放开匿名访问，接入用户认证后
-- 需要收紧为基于 auth.uid() 的私有策略。
-- ------------------------------------------------------------
alter table public.competitors enable row level security;
alter table public.products enable row level security;
alter table public.snapshots enable row level security;

drop policy if exists "demo_allow_all_competitors" on public.competitors;
create policy "demo_allow_all_competitors" on public.competitors
  for all using (true) with check (true);

drop policy if exists "demo_allow_all_products" on public.products;
create policy "demo_allow_all_products" on public.products
  for all using (true) with check (true);

drop policy if exists "demo_allow_all_snapshots" on public.snapshots;
create policy "demo_allow_all_snapshots" on public.snapshots
  for all using (true) with check (true);

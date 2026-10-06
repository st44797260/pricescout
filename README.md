# PriceScout

面向跨境电商卖家的 AI 选品与定价助手。技术栈：React 19 + Vite + Tailwind CSS v4 + React Router + Supabase（数据库 + Edge Function）+ Recharts + Framer Motion + lucide-react。

## 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # 生产构建
pnpm lint       # oxlint
```

## 双模式运行

应用支持两种运行模式，代码路径完全一致：

| 模式 | 触发条件 | 行为 |
| --- | --- | --- |
| **本地模拟** | 未配置 `VITE_SUPABASE_*` 环境变量 | 前端使用 localStorage 模拟后端，采集由前端模拟（约 2.5s 后生成 20 条产品），预置 3 条示例竞品，可离线演示完整流程 |
| **Supabase** | 配置了环境变量并完成下方部署 | 数据读写与采集全部走 Supabase；未配置 `FIRECRAWL_API_KEY` 时 Edge Function 返回 mock 产品数据（结构与真实抓取一致） |

## Supabase 配置

```bash
# 1. 在 https://supabase.com 创建项目，填入连接信息
cp .env.example .env   # 填写 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY

# 2. 关联项目并推送数据库迁移（competitors / products / snapshots 三张表）
supabase link --project-ref <your-project-ref>
supabase db push

# 3. 部署采集 Edge Function
supabase functions deploy scrape-competitor

# 4.（可选）配置真实抓取 API Key；缺省时函数自动进入 mock 模式
supabase secrets set FIRECRAWL_API_KEY=fc-xxxx
```

### 数据采集流程

`scrape-competitor` Edge Function 按平台选择抓取策略：

- **Shopify** → 公开的 `/products.json` 接口
- **WooCommerce** → 公开的 `/wp-json/wc/store/v1/products` 接口
- **自定义站点** → Firecrawl 抓取首页与常见产品列表页，解析 JSON-LD 结构化数据
- **mock 模式** → 未配置 API Key 时返回 20 条模拟产品（数据结构与真实抓取一致）

每次采集会：替换该竞品的 `products` → 为每个产品写入当日 `snapshots` → 更新竞品的 `product_count` / `last_scraped_at` / `status`（completed 或 failed）。

## 目录结构

```
src/
  layouts/Layout.jsx        # 全局布局（侧边栏 + 顶栏 + 采集状态条）
  pages/                    # 数据看板 / 竞品管理 / 竞品详情 / 选品分析 / 定价助手 / 趋势监控 / 报告中心
  components/               # Modal、StatCard、徽章、采集状态条等通用组件
  lib/
    api.js                  # 统一数据访问层（自动路由 Supabase / 本地模拟）
    supabase.js             # Supabase 客户端
    mockBackend.js          # localStorage 模拟后端
    scrapeEvents.js         # 采集事件总线（驱动状态提示条）
supabase/
  migrations/               # 数据库迁移
  functions/scrape-competitor/  # 采集 Edge Function
```

## 路线图

- [x] 设计系统与全局布局
- [x] 竞品管理 + 数据采集（Supabase + Edge Function）
- [ ] 数据看板（经营指标图表）
- [ ] 选品分析（AI 推荐）
- [ ] 定价助手（定价模型与利润测算）
- [ ] 趋势监控（基于 snapshots 的价格/评分趋势）
- [ ] 报告中心

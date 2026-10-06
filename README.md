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

# 5.（可选）配置 AI 评分接口（OpenAI 兼容）；缺省时 analyze-products 使用内置启发式算法
supabase secrets set AI_API_KEY=sk-xxxx
supabase secrets set AI_BASE_URL=https://api.openai.com/v1   # 可选
supabase secrets set AI_MODEL=gpt-4o-mini                     # 可选
```

### 数据采集流程

`scrape-competitor` Edge Function 按平台选择抓取策略：

- **Shopify** → 公开的 `/products.json` 接口
- **WooCommerce** → 公开的 `/wp-json/wc/store/v1/products` 接口
- **自定义站点** → Firecrawl 抓取首页与常见产品列表页，解析 JSON-LD 结构化数据
- **mock 模式** → 未配置 API Key 时返回 20 条模拟产品（数据结构与真实抓取一致）

每次采集会：替换该竞品的 `products` → 为每个产品写入当日 `snapshots` → 更新竞品的 `product_count` / `last_scraped_at` / `status`（completed 或 failed）。

### AI 选品评分流程

`analyze-products` Edge Function 对产品批量做多维度评分（0-100）：

| 维度 | 权重 | 依据 |
| --- | --- | --- |
| 市场需求热度 | 30% | 评价数（对数刻度）、评分 |
| 竞争激烈程度（分高=竞争小） | 25% | 同批次近似款数量（标题相似度）、价格分布 |
| 利润空间 | 25% | 价格定位（$20-60 为甜点区）、品类特征 |
| 物流友好度 | 20% | 标题关键词推断体积重量 |

综合推荐指数 = 加权平均；每批 8 个产品分片调用，前端实时显示进度。配置 `AI_API_KEY` 后走大模型（OpenAI 兼容接口），未配置时使用与前端一致的启发式算法；结果写入 `analyses` 表（同产品仅保留最新）。

### 智能定价流程

`suggest-pricing` Edge Function：从 `products` 表按标题相似度筛选同类产品的价格分布（不足 3 个时回退全量竞品），结合成本结构（产品成本 / 物流 / 佣金比例）与目标市场调用 AI，返回三档建议价、策略说明、竞品定位百分位与风险提示。保本价 = (成本+物流)/(1-佣金)，达成目标利润率售价 = (成本+物流)/(1-佣金-利润率)。函数只计算不落库，用户点击「保存定价方案」时写入 `pricing_suggestions` 表（扩展数据存于 `competitor_distribution` jsonb），历史页支持勾选 2-3 个方案横向对比。

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
- [x] AI 选品评分（/products + 选品清单 /products/shortlist + analyze-products）
- [x] 智能定价（/pricing + 定价历史 /pricing/history + suggest-pricing）
- [ ] 数据看板（经营指标图表）
- [ ] 趋势监控（基于 snapshots 的价格/评分趋势）
- [ ] 报告中心

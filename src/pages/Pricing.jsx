import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  Sparkles,
  Tag,
} from 'lucide-react'
import PageHeader from '../components/PageHeader.jsx'
import PriceDistributionChart from '../components/PriceDistributionChart.jsx'
import { SingleSlider } from '../components/RangeSlider.jsx'
import PulseNodes from '../components/PulseNodes.jsx'
import AnimatedNumber from '../components/AnimatedNumber.jsx'
import {
  savePricingSuggestion,
  suggestPricing,
  MARKETS,
} from '../lib/api.js'
import {
  marginPct,
  netProfit,
  ZONE_META,
} from '../lib/pricing.js'
import { cn, formatPrice } from '../lib/format.js'

const DEFAULT_FORM = {
  product_name: '',
  cost: '12',
  target_margin: 30,
  shipping_cost: '3.5',
  platform_fee: 15,
  market: 'us',
}

export default function Pricing() {
  const [form, setForm] = useState(DEFAULT_FORM)
  const [generating, setGenerating] = useState(false)
  const [suggestion, setSuggestion] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState(null)

  const setField = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))
  const setNumber = (key) => (v) => setForm((f) => ({ ...f, [key]: v }))

  const parsed = {
    product_name: form.product_name.trim(),
    cost: Number(form.cost),
    target_margin: Number(form.target_margin),
    shipping_cost: Number(form.shipping_cost) || 0,
    platform_fee: Number(form.platform_fee) || 0,
    market: form.market,
  }

  const validate = () => {
    if (!parsed.product_name) return '请填写产品名称'
    if (!Number.isFinite(parsed.cost) || parsed.cost <= 0) return '产品成本必须大于 0'
    if (parsed.shipping_cost < 0) return '物流成本不能为负数'
    if (parsed.target_margin + parsed.platform_fee >= 95) {
      return '目标利润率与佣金之和过高，无法定价'
    }
    return null
  }

  const handleGenerate = async () => {
    const message = validate()
    if (message) {
      setError(message)
      return
    }
    setGenerating(true)
    setError('')
    setSuggestion(null)
    setSavedId(null)
    try {
      const result = await suggestPricing(parsed)
      setSuggestion(result)
    } catch (err) {
      setError(err?.message ?? '生成定价建议失败')
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!suggestion || saving || savedId) return
    setSaving(true)
    setError('')
    try {
      const row = await savePricingSuggestion(suggestion, parsed)
      setSavedId(row.id)
    } catch (err) {
      setError(err?.message ?? '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="定价助手"
        description="输入成本结构与目标利润率，AI 结合竞品价格分布给出三档建议价与定价策略。"
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* ============ 左栏：输入表单 ============ */}
        <form
          className="card space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault()
            handleGenerate()
          }}
        >
          <h2 className="text-base font-semibold text-ink">定价参数</h2>

          <div>
            <label htmlFor="pricing-name" className="label">
              产品名称 <span className="text-red-500">*</span>
            </label>
            <input
              id="pricing-name"
              type="text"
              className="input"
              placeholder="例如：Insulated Water Bottle"
              value={form.product_name}
              onChange={setField('product_name')}
            />
            <p className="mt-1 text-xs text-slate-400">
              名称越接近竞品标题关键词，同类价格分布越精准
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pricing-cost" className="label">
                产品成本 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  id="pricing-cost"
                  type="number"
                  min="0"
                  step="0.5"
                  className="input pl-6"
                  value={form.cost}
                  onChange={setField('cost')}
                />
              </div>
            </div>
            <div>
              <label htmlFor="pricing-shipping" className="label">
                物流成本
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  id="pricing-shipping"
                  type="number"
                  min="0"
                  step="0.5"
                  className="input pl-6"
                  value={form.shipping_cost}
                  onChange={setField('shipping_cost')}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="label">目标利润率</label>
            <SingleSlider
              min={10}
              max={80}
              step={1}
              value={form.target_margin}
              onChange={setNumber('target_margin')}
              formatValue={(v) => `${v}%`}
              hideMax
            />
          </div>

          <div>
            <label htmlFor="pricing-market" className="label">
              目标市场
            </label>
            <select
              id="pricing-market"
              className="input"
              value={form.market}
              onChange={setField('market')}
            >
              {MARKETS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">平台佣金比例</label>
            <SingleSlider
              min={0}
              max={20}
              step={0.5}
              value={form.platform_fee}
              onChange={setNumber('platform_fee')}
              formatValue={(v) => `${v}%`}
              hideMax
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <button type="submit" className="btn btn-primary w-full" disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 分析中…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                生成定价建议
              </>
            )}
          </button>
        </form>

        {/* ============ 右栏：定价建议结果 ============ */}
        <div>
          {!suggestion && !generating && !error && <EmptyResult />}

          {generating && (
            <div className="card flex min-h-[420px] flex-col items-center justify-center gap-5 p-8">
              <PulseNodes className="w-full" />
              <p className="text-sm text-ink-muted">
                AI 正在分析成本结构与竞品价格分布…
              </p>
            </div>
          )}

          {!generating && error && suggestion === null && (
            <div className="card flex min-h-[420px] items-center justify-center p-8 text-center">
              <div>
                <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
                <p className="mt-3 text-sm text-red-600">{error}</p>
              </div>
            </div>
          )}

          {suggestion && (
            <div className="space-y-4">
              {/* 三档建议价（数字滚动动画） */}
              <div className="grid grid-cols-3 gap-3">
                <PriceCard label="最低建议价" value={suggestion.price_low} />
                <div className="card relative border-blue-300 bg-blue-50/70 p-4 text-center shadow-md">
                  <span className="badge absolute -top-2.5 left-1/2 -translate-x-1/2 bg-blue-600 text-white ring-blue-600">
                    <Sparkles className="h-3 w-3" />
                    推荐
                  </span>
                  <p className="text-xs text-blue-700">推荐价</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700">
                    <AnimatedNumber
                      value={Number(suggestion.price_recommended)}
                      decimals={2}
                      format={formatPrice}
                    />
                  </p>
                </div>
                <PriceCard label="最高建议价" value={suggestion.price_high} />
              </div>

              {/* 价格分布图 */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-ink">竞品价格分布</h3>
                <p className="mt-0.5 text-xs text-ink-muted">
                  共 {suggestion.distribution?.count ?? 0} 家竞品
                  {suggestion.distribution?.matched ? '（同类产品）' : '（全量竞品）'}
                  ，中位数 {formatPrice(suggestion.distribution?.median)}
                </p>
                <div className="mt-3">
                  <PriceDistributionChart
                    distribution={suggestion.distribution}
                    low={suggestion.price_low}
                    high={suggestion.price_high}
                    recommended={suggestion.price_recommended}
                  />
                </div>
              </div>

              {/* 策略说明 + 利润测算 */}
              <div className="card p-5">
                <h3 className="text-sm font-semibold text-ink">AI 定价策略说明</h3>
                <p className="mt-2 text-sm leading-6 text-ink-muted">
                  {suggestion.strategy_text}
                </p>

                {/* 竞品价格定位 */}
                {suggestion.percentile != null && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>低于所有竞品</span>
                      <span className="font-medium text-ink">
                        推荐价高于约 {suggestion.percentile}% 的竞品
                      </span>
                      <span>高于所有竞品</span>
                    </div>
                    <div className="relative mt-2 h-2 rounded-full bg-slate-100">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                        style={{ width: `${Math.min(100, suggestion.percentile)}%` }}
                      />
                      <div
                        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600 bg-white shadow"
                        style={{ left: `${Math.min(100, suggestion.percentile)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 风险提示 */}
                <div className="mt-4">
                  {suggestion.risks?.length > 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700">
                        <AlertTriangle className="h-4 w-4" />
                        风险提示
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm leading-5 text-amber-700">
                        {suggestion.risks.map((risk) => (
                          <li key={risk}>{risk}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      未发现明显定价风险
                    </p>
                  )}
                </div>

                {/* 利润测算表 */}
                <div className="mt-4">
                  <h4 className="text-sm font-semibold text-ink">利润测算</h4>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
                          <th className="px-3 py-2">方案</th>
                          <th className="px-3 py-2 text-right">售价</th>
                          <th className="px-3 py-2 text-right">产品成本</th>
                          <th className="px-3 py-2 text-right">物流成本</th>
                          <th className="px-3 py-2 text-right">平台佣金</th>
                          <th className="px-3 py-2 text-right">净利润</th>
                          <th className="px-3 py-2 text-right">利润率</th>
                        </tr>
                      </thead>
                      <tbody>
                        <ProfitRow
                          label="最低价"
                          price={suggestion.price_low}
                          input={parsed}
                          tone={ZONE_META.low.color}
                        />
                        <ProfitRow
                          label="推荐价"
                          price={suggestion.price_recommended}
                          input={parsed}
                          tone={ZONE_META.mid.color}
                          highlight
                        />
                        <ProfitRow
                          label="最高价"
                          price={suggestion.price_high}
                          input={parsed}
                          tone={ZONE_META.high.color}
                        />
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 保存 */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400">
                    {savedId
                      ? '方案已保存，可在定价历史中查看与对比。'
                      : '保存后进入定价历史，支持多方案对比。'}
                  </p>
                  <div className="flex gap-2">
                    <Link to="/pricing/history" className="btn btn-outline">
                      定价历史
                    </Link>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleSave}
                      disabled={saving || Boolean(savedId)}
                    >
                      {savedId ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          已保存
                        </>
                      ) : saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          保存中…
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          保存定价方案
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PriceCard({ label, value }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
        {value == null ? (
          '—'
        ) : (
          <AnimatedNumber value={Number(value)} decimals={2} format={formatPrice} />
        )}
      </p>
    </div>
  )
}

function ProfitRow({ label, price, input, tone, highlight = false }) {
  const fee = price * (input.platform_fee / 100)
  const net = netProfit(price, input.cost, input.shipping_cost, input.platform_fee)
  const margin = marginPct(price, input.cost, input.shipping_cost, input.platform_fee)
  return (
    <tr className={cn('border-b border-slate-100 last:border-0', highlight && 'bg-blue-50/60 font-medium')}>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: tone }} />
          {label}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-ink">{formatPrice(price)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
        {formatPrice(input.cost)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
        {formatPrice(input.shipping_cost)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
        {formatPrice(fee)}
      </td>
      <td
        className={cn(
          'px-3 py-2 text-right tabular-nums',
          net >= 0 ? 'text-emerald-600' : 'text-red-600',
        )}
      >
        {formatPrice(net)}
      </td>
      <td className={cn('px-3 py-2 text-right tabular-nums', highlight ? 'text-blue-700' : 'text-ink')}>
        {margin.toFixed(1)}%
      </td>
    </tr>
  )
}

/** 右栏初始空状态（引导插画） */
function EmptyResult() {
  return (
    <div className="card flex min-h-[460px] flex-col items-center justify-center p-8 text-center">
      <div className="relative h-28 w-28">
        <div className="absolute inset-0 rounded-3xl border border-slate-100 bg-gradient-to-br from-blue-50 via-cyan-50 to-slate-50" />
        <Tag className="absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 text-blue-500" />
        <span className="card absolute -right-3 top-3 rotate-6 px-2 py-0.5 text-[11px] font-medium tabular-nums text-blue-700">
          $ 23.99
        </span>
        <span className="card absolute -left-4 bottom-4 -rotate-6 px-2 py-0.5 text-[11px] font-medium tabular-nums text-emerald-600">
          利润 32%
        </span>
      </div>
      <h3 className="mt-6 text-base font-semibold text-ink">还没有定价建议</h3>
      <p className="mt-1.5 max-w-xs text-sm leading-6 text-ink-muted">
        在左侧填写成本结构与目标利润率，AI 会结合竞品价格分布给出三档建议售价与定价策略。
      </p>
      <ul className="mt-5 space-y-1.5 text-left text-xs text-ink-muted">
        {['三档建议售价（最低 / 推荐 / 最高）', '竞品价格分布与定位百分位', '策略说明、利润测算与风险提示'].map(
          (item) => (
            <li key={item} className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              {item}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

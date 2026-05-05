'use client'

/**
 * TodayDashboard.tsx
 * 今日即時儀表板 — 5 個區塊：
 *   ① KPI 列：今日損益、最大贏家、最大輸家、勝率
 *   ② 盤中淨值走勢（每次 price 刷新記一筆，sessionStorage 持久）
 *   ③ 個股今日損益貢獻（橫向 Bar）
 *   ④ 今日勝負分布（甜甜圈）+ 今日泡泡圖（振幅 vs 漲跌% vs 市值）
 * 資料源：tickerItems（由 PortfolioOverview 傳入）
 */

import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ZAxis,
  CartesianGrid,
} from 'recharts'
import { formatMoney } from '@/lib/calculator'
import type { TickerItem } from './HoldingTickerBoard'
import type { PriceCache } from '@/lib/types'

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

interface NavPoint {
  t: string   // "HH:MM"
  v: number   // 今日 P&L delta（相對昨收）
  s?: Record<string, number>  // code → 個股今日損益（對映 sessionStorage 持久化）
}

interface Props {
  tickerItems: TickerItem[]
  prices: Record<string, PriceCache>
  isMarketHours: boolean
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

function todayKey(): string {
  return `intraday_nav_${new Date().toISOString().split('T')[0]}`
}

function loadNavPoints(): NavPoint[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(sessionStorage.getItem(todayKey()) ?? '[]') as NavPoint[]
  } catch {
    return []
  }
}

function saveNavPoints(pts: NavPoint[]) {
  try {
    sessionStorage.setItem(todayKey(), JSON.stringify(pts))
  } catch { /* ignore quota errors */ }
}

function formatDelta(v: number): string {
  return `${v >= 0 ? '+' : ''}$${formatMoney(Math.abs(v))}`
}

function formatPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}

// ──────────────────────────────────────────────────────────────────
// Tooltip helpers
// ──────────────────────────────────────────────────────────────────

interface NavTooltipProps {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}

function NavTooltip({ active, payload, label }: NavTooltipProps) {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  const isUp = v >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className={`font-mono font-bold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
        {formatDelta(v)}
      </p>
    </div>
  )
}

interface BarTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { code: string; name: string; delta: number; pct: number } }>
}

function ContribTooltip({ active, payload }: BarTooltipProps) {
  if (!active || !payload?.length) return null
  const { code, name, delta, pct } = payload[0].payload
  const isUp = delta >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-mono font-bold text-[#1A1A2E]">{code} <span className="font-normal text-slate-400">{name}</span></p>
      <p className={`font-mono font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
        {formatDelta(delta)}
        <span className="ml-1 opacity-70">({formatPct(pct)})</span>
      </p>
    </div>
  )
}

interface BubbleTooltipProps {
  active?: boolean
  payload?: Array<{ payload: { code: string; name: string; x: number; y: number; z: number } }>
}

function BubbleTooltip({ active, payload }: BubbleTooltipProps) {
  if (!active || !payload?.length) return null
  const { code, name, x, y, z } = payload[0].payload
  const isUp = y >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-mono font-bold text-[#1A1A2E]">{code} <span className="font-normal text-slate-400">{name}</span></p>
      <p className="text-slate-500">振幅：{x.toFixed(1)}%</p>
      <p className={`font-semibold ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>今日：{formatPct(y)}</p>
      <p className="text-slate-500">市值：${formatMoney(z)}</p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────

export default function TodayDashboard({ tickerItems, prices, isMarketHours }: Props) {
  const [navSeries, setNavSeries] = useState<NavPoint[]>([])
  const navRef = useRef<NavPoint[]>([])

  // ── 計算今日核心指標 ────────────────────────────────────────────
  const stats = useMemo(() => {
    const items = tickerItems.filter((i) => i.shares > 0 && i.prevClose > 0)
    if (items.length === 0) return null

    const totalDelta = items.reduce((s, i) => s + i.todayChange, 0)
    const baselineValue = items.reduce((s, i) => s + i.prevClose * i.shares, 0)
    const totalDeltaPct = baselineValue > 0 ? (totalDelta / baselineValue) * 100 : 0

    const sorted = [...items].sort((a, b) => b.todayChange - a.todayChange)
    const winner = sorted[0]
    const loser = sorted[sorted.length - 1]

    const upCount = items.filter((i) => i.todayChange > 0).length
    const downCount = items.filter((i) => i.todayChange < 0).length
    const flatCount = items.length - upCount - downCount
    const winRate = items.length > 0 ? (upCount / items.length) * 100 : 0

    return { totalDelta, totalDeltaPct, winner, loser, upCount, downCount, flatCount, winRate }
  }, [tickerItems])

  // ── 盤中淨值追蹤 ────────────────────────────────────────────────
  const totalDelta = stats?.totalDelta ?? 0

  // prices 中最新的 fetchedAt 時間戳；每次 API 回來此值必改，用作 effect 觸發器
  const latestFetchAt = useMemo(() => {
    const vals = Object.values(prices)
    if (vals.length === 0) return 0
    return Math.max(...vals.map((p) => p.fetchedAt))
  }, [prices])

  // 用 ref 存最新值，避免 effect 中 stale closure
  const totalDeltaRef = useRef(0)
  totalDeltaRef.current = totalDelta
  const tickerItemsRef = useRef(tickerItems)
  tickerItemsRef.current = tickerItems

  useEffect(() => {
    // 初始化：從 sessionStorage 載入今天的紀錄
    const stored = loadNavPoints()
    navRef.current = stored
    setNavSeries([...stored])
  }, [])

  useEffect(() => {
    // 每次 API 回來（latestFetchAt 改變）就記一筆，不依賴數值是否改變
    if (latestFetchAt === 0) return
    const validItems = tickerItemsRef.current.filter((i) => i.shares > 0 && i.prevClose > 0)
    if (validItems.length === 0) return  // prevClose 尚未載入，跳過

    const delta = totalDeltaRef.current
    const now = new Date()
    const t = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    // 同時記錄各股個別損益，供 PnLHistoryChart「今日」tab 使用
    const stocksSnap: Record<string, number> = {}
    validItems.forEach((i) => { stocksSnap[i.code] = i.todayChange })

    const pts = navRef.current
    const last = pts[pts.length - 1]
    if (last?.t === t) {
      pts[pts.length - 1] = { t, v: delta, s: stocksSnap }
    } else {
      pts.push({ t, v: delta, s: stocksSnap })
    }
    saveNavPoints(pts)
    setNavSeries([...pts])
  }, [latestFetchAt])  // ← 依賴 API 刷新時間，每 30s 必跑

  // ── 個股貢獻資料 ────────────────────────────────────────────────
  const contribData = useMemo(() => {
    return tickerItems
      .filter((i) => i.shares > 0 && i.prevClose > 0)
      .map((i) => ({
        code: i.code,
        name: i.name,
        delta: i.todayChange,
        pct: i.todayChangePct,
      }))
      .sort((a, b) => b.delta - a.delta)
  }, [tickerItems])

  // ── 勝負甜甜圈資料 ──────────────────────────────────────────────
  const winLoseData = useMemo(() => {
    if (!stats) return []
    return [
      { name: '上漲', value: stats.upCount, color: '#10b981' },
      { name: '下跌', value: stats.downCount, color: '#ef4444' },
      { name: '持平', value: stats.flatCount, color: '#94a3b8' },
    ].filter((d) => d.value > 0)
  }, [stats])

  // ── 泡泡圖資料（振幅 vs 今日漲跌% vs 市值）──────────────────────
  const bubbleData = useMemo(() => {
    return tickerItems
      .filter((i) => i.shares > 0 && i.prevClose > 0)
      .map((i) => {
        const pc = prices[i.code]
        const high52w = pc?.high52w
        const low52w = pc?.low52w
        const amplitude =
          high52w && low52w && i.price > 0
            ? ((high52w - low52w) / i.price) * 100
            : Math.abs(i.todayChangePct) * 3 // fallback
        return {
          code: i.code,
          name: i.name,
          x: parseFloat(amplitude.toFixed(1)),      // 振幅 %（52w 高低差 / 現價）
          y: parseFloat(i.todayChangePct.toFixed(2)), // 今日漲跌 %
          z: Math.round(i.value),                    // 市值（泡泡大小）
        }
      })
  }, [tickerItems, prices])

  // ── 無資料時不渲染 ──────────────────────────────────────────────
  const hasData = tickerItems.some((i) => i.shares > 0 && i.prevClose > 0)
  if (!hasData) return null

  const isUp = (stats?.totalDelta ?? 0) >= 0
  const RADIAN = Math.PI / 180

  // 甜甜圈 label
  const renderPieLabel = ({
    cx, cy, midAngle, innerRadius, outerRadius, name, value,
  }: {
    cx: number; cy: number; midAngle: number
    innerRadius: number; outerRadius: number; name: string; value: number
  }) => {
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RADIAN)
    const y = cy + r * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize: 11, fontWeight: 700 }}>
        {name} {value}
      </text>
    )
  }

  const contribBarH = Math.max(160, contribData.length * 40)

  return (
    <div className="space-y-3">

      {/* ① KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 今日損益 */}
        <div className="glass-card p-4 animate-fade-up">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">今日損益</p>
          <p className={`text-lg font-mono font-black leading-tight ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
            {formatDelta(stats?.totalDelta ?? 0)}
          </p>
          <p className={`text-xs mt-1 font-semibold ${isUp ? 'text-emerald-500' : 'text-red-400'}`}>
            {formatPct(stats?.totalDeltaPct ?? 0)} 較昨收
          </p>
        </div>

        {/* 最大贏家 */}
        <div className="glass-card p-4 animate-fade-up">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">今日最大贏家</p>
          {stats?.winner && stats.winner.todayChange > 0 ? (
            <>
              <p className="text-sm font-mono font-black text-[#1A1A2E] leading-tight">{stats.winner.code}</p>
              <p className="text-xs mt-1 text-emerald-600 font-semibold">
                +${formatMoney(stats.winner.todayChange)} ({formatPct(stats.winner.todayChangePct)})
              </p>
            </>
          ) : (
            <p className="text-sm font-mono text-slate-300">—</p>
          )}
        </div>

        {/* 最大輸家 */}
        <div className="glass-card p-4 animate-fade-up">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">今日最大輸家</p>
          {stats?.loser && stats.loser.todayChange < 0 ? (
            <>
              <p className="text-sm font-mono font-black text-[#1A1A2E] leading-tight">{stats.loser.code}</p>
              <p className="text-xs mt-1 text-red-500 font-semibold">
                -${formatMoney(Math.abs(stats.loser.todayChange))} ({formatPct(stats.loser.todayChangePct)})
              </p>
            </>
          ) : (
            <p className="text-sm font-mono text-slate-300">—</p>
          )}
        </div>

        {/* 持倉勝率 */}
        <div className="glass-card p-4 animate-fade-up">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">今日持倉勝率</p>
          <p className="text-lg font-mono font-black text-[#1A1A2E] leading-tight">
            {(stats?.winRate ?? 0).toFixed(0)}%
          </p>
          <p className="text-[11px] mt-1 text-slate-400">
            {stats?.upCount ?? 0}漲 {stats?.downCount ?? 0}跌 {stats?.flatCount ?? 0}平
          </p>
        </div>
      </div>

      {/* ② 盤中淨值走勢 */}
      <div className="glass-card p-4 animate-fade-up">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">盤中淨值走勢</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
            每 30 秒刷新 · 今日損益變化（台灣時間）
              {!isMarketHours && <span className="ml-1 text-amber-500">· 非交易時段</span>}
            </p>
          </div>
          {navSeries.length > 0 && (
            <button
              onClick={() => {
                navRef.current = []
                saveNavPoints([])
                setNavSeries([])
              }}
              className="text-[10px] text-slate-300 hover:text-slate-500 transition-colors px-2 py-1 rounded border border-slate-100 hover:border-slate-300"
            >
              清除
            </button>
          )}
        </div>

        {navSeries.length < 2 ? (
          <div className="h-36 flex flex-col items-center justify-center gap-1.5 text-slate-300 text-sm">
            <span>{latestFetchAt === 0 ? '載入報價中…' : '等待資料累積中…'}</span>
            {latestFetchAt > 0 && (
              <span className="text-[11px] text-slate-200">已載入 1 筆，再等 30 秒即可顯示</span>
            )}
          </div>
        ) : (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={navSeries} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={(v: number) => `${v >= 0 ? '+' : ''}$${formatMoney(Math.abs(v))}`}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="4 4" strokeWidth={1.5} />
                <ReTooltip content={<NavTooltip />} />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={isUp ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  fill="url(#navGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ③ 個股今日損益貢獻 橫條圖 */}
      {contribData.length > 0 && (
        <div className="glass-card p-4 animate-fade-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">個股今日損益貢獻</p>
              <p className="text-[11px] text-slate-400 mt-0.5">依貢獻金額排序</p>
            </div>
            <div className="flex gap-3">
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-2 h-2 rounded bg-emerald-500 inline-block" />正貢獻
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <span className="w-2 h-2 rounded bg-red-400 inline-block" />負貢獻
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={contribBarH}>
            <BarChart
              data={contribData}
              layout="vertical"
              margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
              barSize={22}
            >
              <XAxis
                type="number"
                tickFormatter={(v: number) =>
                  v === 0 ? '0' : `${v > 0 ? '+' : ''}$${formatMoney(Math.abs(v))}`
                }
                tick={{ fontSize: 9, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="code"
                tick={{ fontSize: 11, fill: '#1A1A2E', fontWeight: 700, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <ReferenceLine x={0} stroke="#e2e8f0" strokeWidth={1} />
              <ReTooltip content={<ContribTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Bar dataKey="delta" radius={[0, 4, 4, 0]}
                label={{
                  position: 'right',
                  formatter: (v: number) =>
                    `${v >= 0 ? '+' : ''}$${formatMoney(Math.abs(v))}`,
                  style: { fontSize: 10, fill: '#64748b' },
                }}
              >
                {contribData.map((d, i) => (
                  <Cell key={i} fill={d.delta >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ④ 勝負甜甜圈 + 泡泡圖 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* 今日勝負分布甜甜圈 */}
        <div className="glass-card p-4 animate-fade-up">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">今日持倉勝負分布</p>
          <p className="text-[11px] text-slate-400 mb-2">上漲 / 下跌 / 持平家數</p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={winLoseData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="32%"
                  outerRadius="65%"
                  paddingAngle={2}
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {winLoseData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <ReTooltip
                  formatter={(value: number, name: string) => [value + ' 檔', name]}
                  contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex justify-center gap-4 mt-1">
            {winLoseData.map((d) => (
              <li key={d.name} className="flex items-center gap-1 text-[11px] text-slate-500">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.color }} />
                {d.name} {d.value}
              </li>
            ))}
          </ul>
        </div>

        {/* 持倉風險/報酬泡泡圖 */}
        <div className="glass-card p-4 animate-fade-up">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">持倉風險 / 報酬</p>
          <p className="text-[11px] text-slate-400 mb-2">X＝52週振幅% · Y＝今日漲跌% · 圓圈大小＝市值</p>
          {bubbleData.every((d) => d.x === 0) ? (
            <div className="h-44 flex items-center justify-center text-slate-300 text-xs">載入 52 週高低後顯示</div>
          ) : (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="振幅"
                    unit="%"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    label={{ value: '52週振幅%', position: 'insideBottomRight', offset: -4, style: { fontSize: 9, fill: '#94a3b8' } }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="今日漲跌"
                    unit="%"
                    tick={{ fontSize: 9, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ZAxis type="number" dataKey="z" range={[200, 2000]} />
                  <ReferenceLine y={0} stroke="#e2e8f0" strokeDasharray="4 4" />
                  <ReTooltip content={<BubbleTooltip />} />
                  <Scatter
                    data={bubbleData}
                    fill="#3b82f6"
                    fillOpacity={0.6}
                    shape={(props: {
                      cx?: number; cy?: number; r?: number
                      payload?: { y: number }
                    }) => {
                      const { cx = 0, cy = 0, r = 8, payload } = props
                      const fill = (payload?.y ?? 0) >= 0 ? '#10b981' : '#ef4444'
                      return <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={0.6} stroke="white" strokeWidth={1.5} />
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}

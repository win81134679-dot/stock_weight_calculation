'use client'

/**
 * StockContributionChart.tsx
 * 每日個股貢獻% — 堆疊面積圖 (stackOffset="sign")
 * X = 快照日期，Y = 各股 todayDelta（當日 Δ TWD）
 * 只顯示「貢獻金額前 N 大」（依所有快照合計絕對值排序）
 * 依賴 PnLSnapshot.stocks (takeSnapshot 新版才有)
 */

import React, { useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { PnLSnapshot, StockDailySnap } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'
import type { TickerItem } from './HoldingTickerBoard'

interface Props {
  snapshots: PnLSnapshot[]
  tickerItems?: TickerItem[]
  topN?: number
}

const STOCK_COLORS = [
  '#2C5F8A', '#34D399', '#F59E0B', '#F87171', '#A78BFA',
  '#FB923C', '#60A5FA', '#F472B6', '#2DD4BF', '#FBBF24',
  '#818CF8', '#4ADE80', '#FB7185', '#38BDF8', '#E879F9',
]

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// Custom tooltip
interface TooltipProps {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number; color: string }>
  label?: string
  codeToName: Record<string, string>
}

function ContribTooltip({ active, payload, label, codeToName }: TooltipProps) {
  if (!active || !payload?.length) return null
  const entries = (payload ?? [])
    .filter((p) => p.value !== 0 && p.value !== undefined)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
  const total = entries.reduce((s, p) => s + p.value, 0)

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 shadow-lg text-xs min-w-[180px] max-w-[240px]">
      <p className="text-slate-400 mb-1 font-mono">{label}</p>
      <p className={`font-mono font-bold mb-2 text-sm ${total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        合計 {total >= 0 ? '+' : ''}${formatMoney(Math.abs(total))}
      </p>
      <div className="space-y-1 border-t border-slate-100 pt-1.5">
        {entries.slice(0, 8).map((p) => {
          const name = codeToName[p.dataKey] ?? ''
          return (
            <div key={p.dataKey} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                <span className="text-slate-500 text-[10px] font-mono">
                  {p.dataKey}{name ? ` ${name.slice(0, 5)}` : ''}
                </span>
              </div>
              <span className={`font-mono text-[10px] font-semibold ${p.value >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {p.value >= 0 ? '+' : ''}${formatMoney(Math.abs(p.value))}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StockContributionChart({ snapshots, tickerItems = [], topN = 10 }: Props) {
  const [showTopN, setShowTopN] = useState(topN)

  // 只用含 stocks 欄位的快照
  const withStocks = useMemo(
    () => [...snapshots]
      .filter((s) => s.stocks && s.stocks.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [snapshots]
  )

  if (withStocks.length < 2) {
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-2 text-slate-300 text-sm">
        <span>個股貢獻圖需要 ≥2 個新版快照</span>
        <span className="text-[11px] text-slate-200">（現有快照無逐股明細，請點「今日快照」等待新快照積累）</span>
      </div>
    )
  }

  // 所有出現過的 code，依合計絕對貢獻排序，取前 N
  const codeAbsSum = new Map<string, number>()
  for (const s of withStocks) {
    for (const st of (s.stocks ?? [])) {
      codeAbsSum.set(st.code, (codeAbsSum.get(st.code) ?? 0) + Math.abs(st.todayDelta))
    }
  }
  const topCodes = Array.from(codeAbsSum.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, showTopN)
    .map(([code]) => code)

  // name lookup
  const codeToName: Record<string, string> = {}
  for (const s of withStocks) {
    for (const st of (s.stocks ?? [])) {
      codeToName[st.code] = st.name
    }
  }
  for (const ti of tickerItems) {
    codeToName[ti.code] = ti.name
  }

  // chart data
  const chartData = withStocks.map((s) => {
    const row: Record<string, number | string> = { label: formatDateLabel(s.date) }
    const stockMap: Record<string, StockDailySnap> = {}
    for (const st of (s.stocks ?? [])) stockMap[st.code] = st
    for (const code of topCodes) {
      row[code] = stockMap[code]?.todayDelta ?? 0
    }
    return row
  })

  const totalCodes = codeAbsSum.size

  return (
    <div>
      {/* topN 選擇 */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] text-slate-400">
          共 {totalCodes} 檔，顯示前
          <select
            className="mx-1 text-[10px] border border-slate-200 rounded px-1 py-0.5 bg-white text-slate-600"
            value={showTopN}
            onChange={(e) => setShowTopN(Number(e.target.value))}
          >
            {[5, 8, 10, 15].filter((n) => n <= totalCodes || n === 5).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          大
        </p>
        <p className="text-[10px] text-slate-400">Y = 當日 Δ 金額（vs 昨收）</p>
      </div>

      <div className="h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
          <AreaChart
            data={chartData}
            stackOffset="sign"
            margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
          >
            <defs>
              {topCodes.map((code, idx) => (
                <linearGradient key={code} id={`cg_${code}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={STOCK_COLORS[idx % STOCK_COLORS.length]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={STOCK_COLORS[idx % STOCK_COLORS.length]} stopOpacity={0.05} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v >= 0 ? '' : '-'}$${formatMoney(Math.abs(v))}`}
              width={68}
            />
            <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1.5} />
            <Tooltip
              content={<ContribTooltip codeToName={codeToName} />}
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
            />
            <Legend
              formatter={(value) => {
                const name = codeToName[value] ?? ''
                return <span style={{ fontSize: 10, color: '#64748b' }}>{value}{name ? ` ${name.slice(0, 4)}` : ''}</span>
              }}
              iconType="square"
              iconSize={8}
            />
            {topCodes.map((code, idx) => (
              <Area
                key={code}
                type="monotone"
                dataKey={code}
                stackId="stack"
                stroke={STOCK_COLORS[idx % STOCK_COLORS.length]}
                strokeWidth={1.5}
                fill={`url(#cg_${code})`}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

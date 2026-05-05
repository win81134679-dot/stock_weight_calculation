'use client'

/**
 * HoldingRankChart.tsx
 * 個股持倉市值排行 — 水平 bar chart
 * 依市值降序，每條顯示代碼+名稱+市值+損益%
 */

import React from 'react'
import { formatMoney } from '@/lib/calculator'
import type { TickerItem } from './HoldingTickerBoard'

interface Props {
  tickerItems: TickerItem[]
  maxItems?: number
}

const BAR_COLORS = [
  '#2C5F8A', '#4A90C4', '#60A5FA', '#34D399',
  '#F59E0B', '#A78BFA', '#FB923C', '#F472B6',
  '#2DD4BF', '#FBBF24',
]

export default function HoldingRankChart({ tickerItems, maxItems = 12 }: Props) {
  const sorted = [...tickerItems]
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, maxItems)

  if (sorted.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-slate-300 text-sm">
        無持倉資料
      </div>
    )
  }

  const maxVal = sorted[0].value

  return (
    <div className="space-y-2.5">
      {sorted.map((item, idx) => {
        const pct = maxVal > 0 ? (item.value / maxVal) * 100 : 0
        const isPnlUp = item.pnl >= 0
        const isTodayUp = item.todayChange >= 0
        const color = BAR_COLORS[idx % BAR_COLORS.length]
        return (
          <div key={item.code} className="flex items-center gap-3">
            {/* 排名 */}
            <span className="w-5 text-[10px] font-mono text-slate-300 text-right shrink-0">{idx + 1}</span>
            {/* 代碼+名 */}
            <div className="w-24 shrink-0">
              <p className="text-xs font-mono font-semibold text-[#1A1A2E] truncate">{item.code}</p>
              <p className="text-[10px] text-slate-400 truncate">{item.name}</p>
            </div>
            {/* Bar */}
            <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct.toFixed(1)}%`, background: color }}
              />
            </div>
            {/* 市值 */}
            <div className="w-20 text-right shrink-0">
              <p className="text-xs font-mono font-bold text-[#1A1A2E]">${formatMoney(item.value)}</p>
              <p className={`text-[10px] font-mono ${isTodayUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {isTodayUp ? '▲' : '▼'}{Math.abs(item.todayChangePct).toFixed(1)}%
              </p>
            </div>
            {/* 未實現損益 */}
            <div className="w-20 text-right shrink-0 hidden sm:block">
              <p className={`text-[10px] font-mono ${isPnlUp ? 'text-emerald-600' : 'text-red-500'}`}>
                {isPnlUp ? '+' : '-'}${formatMoney(Math.abs(item.pnl))}
              </p>
              <p className={`text-[10px] text-slate-300`}>
                {item.pnlPct >= 0 ? '+' : ''}{item.pnlPct.toFixed(1)}%
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

'use client'

/**
 * UsStockPerfCard.tsx
 * 美股個股績效卡 — 對齊台股 StockPerfCard
 * 顯示單一標的的關鍵指標：報酬率、今日漲跌、52週高低、持倉權重
 */

import React from 'react'
import { formatUsd } from '@/lib/us-calculator'

interface Props {
  symbol: string
  name: string
  priceUsd: number
  prevCloseUsd: number
  week52HighUsd?: number
  week52LowUsd?: number
  shares: number
  avgCostUsd: number
  currentWeight: number
  targetWeight: number
  pnlPct: number
}

export default function UsStockPerfCard({
  symbol,
  name,
  priceUsd,
  prevCloseUsd,
  week52HighUsd,
  week52LowUsd,
  shares,
  avgCostUsd,
  currentWeight,
  targetWeight,
  pnlPct,
}: Props) {
  const todayChangePct = prevCloseUsd > 0 ? ((priceUsd - prevCloseUsd) / prevCloseUsd) * 100 : 0
  const todayPositive = todayChangePct >= 0
  const pnlPositive = pnlPct >= 0
  const deviation = currentWeight - targetWeight

  // 52週高低相對位置（百分比）
  let relativePosition = 50
  if (week52HighUsd && week52LowUsd && week52HighUsd > week52LowUsd) {
    relativePosition = ((priceUsd - week52LowUsd) / (week52HighUsd - week52LowUsd)) * 100
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="font-mono font-bold text-lg text-[#1A1A2E]">{symbol}</div>
          <div className="text-xs text-slate-400 mt-0.5 line-clamp-1">{name}</div>
        </div>
        <div className="text-right">
          <div className="font-mono font-bold text-xl text-[#1A1A2E]">
            ${formatUsd(priceUsd)}
          </div>
          <div className={`text-xs font-semibold ${todayPositive ? 'text-emerald-600' : 'text-red-500'}`}>
            {todayPositive ? '+' : ''}{todayChangePct.toFixed(2)}% 今日
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <MetricBox
          label="持倉報酬"
          value={`${pnlPositive ? '+' : ''}${pnlPct.toFixed(2)}%`}
          color={pnlPositive ? 'text-emerald-600' : 'text-red-500'}
        />
        <MetricBox
          label="持股權重"
          value={`${currentWeight.toFixed(1)}%`}
          sub={`目標 ${targetWeight.toFixed(1)}%`}
        />
        <MetricBox
          label="均價"
          value={`$${formatUsd(avgCostUsd)}`}
          sub={`持有 ${shares.toLocaleString()} 股`}
        />
        <MetricBox
          label="偏差"
          value={`${deviation >= 0 ? '+' : ''}${deviation.toFixed(1)}%`}
          color={Math.abs(deviation) > 3 ? (deviation > 0 ? 'text-blue-600' : 'text-amber-500') : 'text-slate-400'}
        />
      </div>

      {/* 52週高低進度條 */}
      {week52HighUsd && week52LowUsd && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
            <span>52週低 ${formatUsd(week52LowUsd)}</span>
            <span>52週高 ${formatUsd(week52HighUsd)}</span>
          </div>
          <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-red-400 via-yellow-300 to-emerald-400 transition-all"
              style={{ width: `${Math.min(Math.max(relativePosition, 0), 100)}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#1A1A2E] shadow"
              style={{ left: `${Math.min(Math.max(relativePosition, 0), 100)}%` }}
            />
          </div>
          <div className="text-center text-[10px] text-slate-500 mt-1">
            目前位於 52週區間的 {relativePosition.toFixed(0)}% 位置
          </div>
        </div>
      )}
    </div>
  )
}

function MetricBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">{label}</div>
      <div className={`font-mono font-bold text-sm ${color ?? 'text-[#1A1A2E]'}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  )
}

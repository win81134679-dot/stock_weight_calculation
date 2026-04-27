'use client'

/**
 * StockPerfCard.tsx
 * 個股績效磁磚：代碼、現價、日漲跌%、損益金額/損益%、市值。
 * v3: 新增 52週高低 range bar、累積配息、含息報酬率。
 */

import React from 'react'
import { formatMoney } from '@/lib/calculator'

interface Props {
  code: string
  name: string
  price: number
  prevClose: number
  shares: number
  avgCost: number
  accountColor?: string
  firstBuyDate?: string   // 'YYYY-MM-DD'
  high52w?: number        // 近 52 週最高
  low52w?: number         // 近 52 週最低
  totalDividends?: number // 累積領息金額
}

const ACCOUNT_DOT: Record<string, string> = {
  blue:   'bg-blue-400',
  green:  'bg-emerald-400',
  yellow: 'bg-yellow-400',
  purple: 'bg-violet-400',
  pink:   'bg-pink-400',
  orange: 'bg-orange-400',
  teal:   'bg-teal-400',
}

export default function StockPerfCard({
  code, name, price, prevClose, shares, avgCost, accountColor,
  firstBuyDate, high52w, low52w, totalDividends,
}: Props) {
  const marketValue = price > 0 ? Math.round(price * shares) : 0
  const costValue = Math.floor(avgCost * shares)
  const pnl = marketValue - costValue
  const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0

  // Holding time & annualized return
  const holdingDays = firstBuyDate
    ? Math.max(0, Math.floor((Date.now() - new Date(firstBuyDate).getTime()) / (1000 * 60 * 60 * 24)))
    : 0
  const annualizedReturn = holdingDays >= 30 && costValue > 0 && pnlPct !== 0
    ? (Math.pow(1 + pnlPct / 100, 365 / holdingDays) - 1) * 100
    : null

  // Day change
  const dayChange = price > 0 && prevClose > 0 ? price - prevClose : 0
  const dayChangePct = prevClose > 0 ? (dayChange / prevClose) * 100 : 0

  // 52-week position (0–100%)
  const has52w = high52w != null && low52w != null && high52w > low52w && price > 0
  const position52w = has52w
    ? Math.min(100, Math.max(0, ((price - low52w!) / (high52w! - low52w!)) * 100))
    : null

  // Total return including dividends
  const divPnlPct = costValue > 0 && totalDividends
    ? ((pnl + totalDividends) / costValue) * 100
    : null

  const isProfit = pnl >= 0
  const isDayUp = dayChange >= 0
  const hasPrice = price > 0
  const dotClass = accountColor ? (ACCOUNT_DOT[accountColor] ?? 'bg-slate-300') : ''

  return (
    <div className="glass-card p-4 flex flex-col gap-2 min-w-[148px] animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-1">
        <div>
          <div className="flex items-center gap-1.5">
            {dotClass && <span className={`w-2 h-2 rounded-full ${dotClass} shrink-0`} />}
            <span className="font-mono font-bold text-[#1A1A2E] text-sm">{code}</span>
          </div>
          <div className="text-xs text-slate-400 mt-0.5 truncate max-w-[120px]">{name}</div>
        </div>
        {hasPrice && (
          <div className={`shrink-0 text-xs font-mono font-semibold px-1.5 py-0.5 rounded-md ${
            isDayUp ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'
          }`}>
            {isDayUp ? '▲' : '▼'}{Math.abs(dayChangePct).toFixed(2)}%
          </div>
        )}
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-mono font-black text-[#1A1A2E]">
          {hasPrice ? `$${price.toFixed(2)}` : '—'}
        </span>
        {hasPrice && dayChange !== 0 && (
          <span className={`text-xs font-mono ${isDayUp ? 'text-emerald-600' : 'text-red-500'}`}>
            {isDayUp ? '+' : ''}{dayChange.toFixed(2)}
          </span>
        )}
      </div>

      {/* 52-week range bar */}
      {has52w && position52w !== null && (
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>${low52w!.toFixed(2)}</span>
            <span className="text-[9px] text-slate-300">52週</span>
            <span>${high52w!.toFixed(2)}</span>
          </div>
          <div className="relative h-1.5 bg-slate-100 rounded-full overflow-visible">
            <div
              className="absolute h-1.5 rounded-full"
              style={{
                left: 0,
                width: `${position52w}%`,
                background: position52w > 70
                  ? 'linear-gradient(90deg,#93c5fd,#2C5F8A)'
                  : position52w < 30
                  ? 'linear-gradient(90deg,#fca5a5,#ef4444)'
                  : 'linear-gradient(90deg,#fde68a,#f59e0b)',
              }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-[#4A90C4] shadow-sm"
              style={{ left: `calc(${position52w}% - 5px)` }}
            />
          </div>
          <div className="text-center text-[10px] text-slate-400">
            近高 {position52w.toFixed(0)}%
          </div>
        </div>
      )}

      <div className="h-px bg-slate-100" />

      {/* PnL */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">未實現損益</span>
        <span className={`text-xs font-mono font-semibold ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
          {isProfit ? '+' : ''}${formatMoney(Math.abs(pnl))}
        </span>
      </div>
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">報酬率</span>
        <span className={`text-xs font-mono font-bold ${isProfit ? 'text-emerald-600' : 'text-red-500'}`}>
          {isProfit ? '+' : ''}{pnlPct.toFixed(2)}%
        </span>
      </div>

      {/* Dividends */}
      {totalDividends != null && totalDividends > 0 && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">累積配息</span>
            <span className="text-xs font-mono font-semibold text-blue-600">+${formatMoney(totalDividends)}</span>
          </div>
          {divPnlPct != null && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-slate-400">含息報酬</span>
              <span className={`text-xs font-mono font-bold ${divPnlPct >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {divPnlPct >= 0 ? '+' : ''}{divPnlPct.toFixed(2)}%
              </span>
            </div>
          )}
        </>
      )}

      {/* Market value */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">市值</span>
        <span className="text-xs font-mono text-slate-600">
          {hasPrice ? `$${formatMoney(marketValue)}` : '—'}
        </span>
      </div>

      {/* Shares */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-400">持股</span>
        <span className="text-xs font-mono text-slate-500">{shares.toLocaleString()} 股</span>
      </div>

      {/* Holding time */}
      {holdingDays > 0 && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">持有天數</span>
          <span className="text-xs font-mono text-slate-500">
            {holdingDays >= 365
              ? `${Math.floor(holdingDays / 365)}年${holdingDays % 365}天`
              : `${holdingDays} 天`}
          </span>
        </div>
      )}

      {/* Annualized return */}
      {annualizedReturn !== null && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-slate-400">年化報酬</span>
          <span className={`text-xs font-mono font-semibold ${
            annualizedReturn >= 0 ? 'text-emerald-600' : 'text-red-500'
          }`}>
            {annualizedReturn >= 0 ? '+' : ''}{annualizedReturn.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}

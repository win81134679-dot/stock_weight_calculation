'use client'

/**
 * HoldingTickerBoard.tsx
 * 個股即時看板：每格顯示現價、今日漲跌（元/%）、持倉市值、未實現損益。
 * 按今日漲跌% 由高到低排列。
 */

import React from 'react'
import { formatMoney } from '@/lib/calculator'

export interface TickerItem {
  code: string
  name: string
  price: number
  prevClose: number
  shares: number
  value: number          // 持倉市值
  pnl: number            // 未實現損益（含估計賣出費用）
  pnlPct: number         // 未實現損益%
  todayChange: number    // (price - prevClose) * shares
  todayChangePct: number // (price - prevClose) / prevClose * 100
}

interface HoldingTickerBoardProps {
  items: TickerItem[]
  isMarketHours: boolean
}

export default function HoldingTickerBoard({ items, isMarketHours }: HoldingTickerBoardProps) {
  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => b.todayChangePct - a.todayChangePct)

  return (
    <div className="animate-fade-up">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          個股即時看板
        </p>
        {isMarketHours && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            盤中更新
          </span>
        )}
        <span className="text-[10px] text-slate-300 ml-auto">依今日漲跌% 排序</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sorted.map((item) => {
          const noPriceData = item.price === 0
          const noChangeData = item.prevClose === 0
          const isUp = item.todayChange >= 0
          const isPnlUp = item.pnl >= 0

          return (
            <div
              key={`${item.code}`}
              className={`relative rounded-xl border p-3 transition-all ${
                noPriceData || noChangeData
                  ? 'bg-white border-slate-100'
                  : isUp
                  ? 'bg-emerald-50/70 border-emerald-200'
                  : 'bg-red-50/70 border-red-200'
              } ${isMarketHours && !noPriceData ? 'shadow-sm' : ''}`}
            >
              {/* Code & Name */}
              <div className="flex items-baseline gap-1.5 mb-1.5">
                <span className="font-mono text-sm font-black text-[#1A1A2E]">{item.code}</span>
                {item.name && (
                  <span className="text-[10px] text-slate-400 truncate max-w-[5rem] leading-none">
                    {item.name}
                  </span>
                )}
              </div>

              {/* Current price — big number */}
              <p
                className={`text-xl font-mono font-black leading-none mb-1 ${
                  noPriceData
                    ? 'text-slate-400'
                    : noChangeData
                    ? 'text-[#1A1A2E]'
                    : isUp
                    ? 'text-emerald-700'
                    : 'text-red-600'
                }`}
              >
                {noPriceData ? '—' : `$${item.price.toFixed(2)}`}
              </p>

              {/* Today's change row */}
              {!noPriceData && !noChangeData && (
                <div
                  className={`flex items-center gap-1 text-xs font-mono font-bold mb-2 ${
                    isUp ? 'text-emerald-600' : 'text-red-500'
                  }`}
                >
                  <span>{isUp ? '▲' : '▼'}</span>
                  <span>${formatMoney(Math.abs(item.todayChange))}</span>
                  <span className="font-normal opacity-70">
                    ({isUp ? '+' : ''}
                    {item.todayChangePct.toFixed(2)}%)
                  </span>
                </div>
              )}

              {/* Divider + P&L detail */}
              <div className="border-t border-slate-200/60 pt-2 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">市值</span>
                  <span className="font-mono font-semibold text-[#1A1A2E]">
                    {item.value > 0 ? `$${formatMoney(item.value)}` : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-[10px]">
                  <span className="text-slate-400">未實現</span>
                  <span
                    className={`font-mono font-bold ${
                      isPnlUp ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {isPnlUp ? '+' : ''}${formatMoney(item.pnl)}
                    <span className="font-normal opacity-70 ml-0.5">
                      ({isPnlUp ? '+' : ''}
                      {item.pnlPct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

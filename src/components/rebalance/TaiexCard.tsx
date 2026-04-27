'use client'

/**
 * TaiexCard.tsx
 * 加權指數即時卡片：顯示指數、今日漲跌點數與漲跌%。
 * 使用現有 stock-price API 的 tse_t00.tw 代碼，不需額外 API。
 */

import React from 'react'

interface TaiexCardProps {
  price: number
  prevClose: number
  isMarketHours: boolean
  loading: boolean
}

export default function TaiexCard({ price, prevClose, isMarketHours, loading }: TaiexCardProps) {
  // 還沒有資料且不在 loading 中 → 不渲染
  if (price === 0 && !loading) return null

  const change = price - prevClose
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0
  const isUp = change >= 0

  if (loading && price === 0) {
    return (
      <div className="rounded-2xl bg-slate-100 animate-pulse h-[88px]" />
    )
  }

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-md animate-fade-up flex-1 min-w-0"
      style={{
        background: isUp
          ? 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)'
          : 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 50%, #b91c1c 100%)',
      }}
    >
      {/* Dot-grid texture */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <div className="relative p-4 sm:p-5 flex items-center justify-between gap-4">
        {/* Left: label + value */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest">
              加權指數 TAIEX
            </p>
            <span
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                isMarketHours
                  ? 'bg-emerald-400/20 text-emerald-300'
                  : 'bg-white/10 text-white/40'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isMarketHours ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'
                }`}
              />
              {isMarketHours ? '盤中' : '已收盤'}
            </span>
          </div>
          <p className="text-2xl sm:text-3xl font-black font-mono text-white leading-none tracking-tight">
            {price > 0
              ? price.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : '—'}
          </p>
        </div>

        {/* Right: change */}
        <div className="text-right shrink-0">
          <p
            className={`text-xl font-mono font-black leading-none ${
              isUp ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {isUp ? '▲' : '▼'} {Math.abs(change).toFixed(2)}
          </p>
          <p
            className={`text-sm font-mono font-bold mt-0.5 ${
              isUp ? 'text-emerald-300/80' : 'text-red-300/80'
            }`}
          >
            {isUp ? '+' : ''}
            {changePct.toFixed(2)}%
          </p>
          {prevClose > 0 && (
            <p className="text-white/30 text-[10px] mt-1">
              昨收 {prevClose.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * LivePriceStatus.tsx
 * 即時股價狀態徽章：脈動綠點 + 倒數計時 / 盤後靜態顯示。
 */

import React from 'react'

interface Props {
  loading: boolean
  secondsUntilRefresh: number
  isMarketHours: boolean
  onRefresh: () => void
}

export default function LivePriceStatus({ loading, secondsUntilRefresh, isMarketHours, onRefresh }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-4 h-4 border-2 border-[#4A90C4] border-t-transparent rounded-full animate-spin" />
        <span>更新中…</span>
      </div>
    )
  }

  if (isMarketHours) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-emerald-600">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse-dot" />
          <span className="font-medium">即時報價</span>
          {secondsUntilRefresh > 0 && (
            <span className="text-slate-400">{secondsUntilRefresh}s</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="text-xs text-[#4A90C4] hover:text-[#2C5F8A] transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50"
        >
          ↺
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="w-2 h-2 bg-slate-300 rounded-full" />
        <span>使用昨收價</span>
      </div>
      <button
        onClick={onRefresh}
        className="text-xs text-[#4A90C4] hover:text-[#2C5F8A] transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50"
      >
        ↺ 刷新
      </button>
    </div>
  )
}

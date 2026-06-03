'use client'

/**
 * UsPortfolioHeatmap.tsx
 * 美股投資組合熱力圖 — 新功能
 * 以色彩深淺顯示各標的市值佔比與報酬率
 */

import React from 'react'
import { formatUsd } from '@/lib/us-calculator'

interface HeatmapCell {
  symbol: string
  name: string
  valueUsd: number
  weightPct: number
  pnlPct: number
}

interface Props {
  data: HeatmapCell[]
}

export default function UsPortfolioHeatmap({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
        尚無投資組合資料
      </div>
    )
  }

  // 排序：市值由大到小
  const sorted = [...data].sort((a, b) => b.valueUsd - a.valueUsd)

  // 計算色彩（報酬率 -20% ~ +20% 映射到紅→綠）
  const getColor = (pnlPct: number) => {
    const clamped = Math.max(-20, Math.min(20, pnlPct))
    if (clamped >= 0) {
      // 綠色系：0% → 淺綠，+20% → 深綠
      const intensity = Math.floor((clamped / 20) * 255)
      return `rgb(${255 - intensity}, ${200 + (intensity * 0.2)}, ${255 - intensity})`
    } else {
      // 紅色系：0% → 淺紅，-20% → 深紅
      const intensity = Math.floor((Math.abs(clamped) / 20) * 255)
      return `rgb(${200 + (intensity * 0.2)}, ${255 - intensity}, ${255 - intensity})`
    }
  }

  // 計算格子大小（依權重，手機版縮小）
  const getSize = (weightPct: number, isMobile: boolean) => {
    if (isMobile) {
      // 手機：最小 60px，最大 120px
      return Math.max(60, Math.min(120, 60 + weightPct * 2))
    }
    // 桌面：最小 80px，最大 200px
    return Math.max(80, Math.min(200, 80 + weightPct * 3))
  }

  // 檢測螢幕寬度（簡易方案）
  const [isMobile, setIsMobile] = React.useState(false)
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return (
    <div>
      <div className="flex flex-wrap gap-2 md:gap-3 justify-center">
        {sorted.map((cell) => {
          const size = getSize(cell.weightPct, isMobile)
          const color = getColor(cell.pnlPct)
          return (
            <div
              key={cell.symbol}
              className="rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col items-center justify-center text-center p-3"
              style={{
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: color,
              }}
            >
              <div className="font-mono font-bold text-sm text-slate-900">{cell.symbol}</div>
              <div className="text-[10px] text-slate-600 mt-1 line-clamp-1 px-1">{cell.name}</div>
              <div className="mt-2 font-mono text-xs font-semibold text-slate-900">
                ${formatUsd(cell.valueUsd)}
              </div>
              <div className="text-[10px] text-slate-600">
                {cell.weightPct.toFixed(1)}% 權重
              </div>
              <div className="mt-1 font-bold text-xs text-slate-900">
                {cell.pnlPct >= 0 ? '+' : ''}{cell.pnlPct.toFixed(1)}%
              </div>
            </div>
          )
        })}
      </div>

      {/* 圖例 */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(255, 220, 220)' }} />
          <span>虧損</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-100" />
          <span>持平</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded" style={{ backgroundColor: 'rgb(220, 255, 220)' }} />
          <span>獲利</span>
        </div>
        <div className="ml-4 text-slate-400">
          格子大小 = 權重佔比
        </div>
      </div>
    </div>
  )
}

'use client'

/**
 * TreemapChart.tsx
 * 持倉市值 Treemap：磚塊大小=市值，顏色深淺=損益率。
 * 使用 Recharts Treemap (不依賴額外套件)。
 */

import React, { useMemo } from 'react'
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts'
import { formatMoney } from '@/lib/calculator'

interface StockNode {
  code: string
  name: string
  value: number    // 市值
  pnl: number
  pnlPct: number
  currentWeight: number
  targetWeight: number
}

interface Props {
  holdings: StockNode[]
}

/** 依損益率插值顏色：虧損→磚紅，平手→中性藍，獲利→深藍 */
function pnlColor(pnlPct: number): string {
  if (pnlPct >= 3)   return '#1e3a5f'   // 深藍 (高獲利)
  if (pnlPct >= 1)   return '#2C5F8A'   // 主藍
  if (pnlPct >= 0)   return '#4A90C4'   // 淺藍
  if (pnlPct >= -1)  return '#fb923c'   // 淺橙
  return '#ef4444'                       // 紅 (虧損)
}

interface ContentProps {
  x?: number
  y?: number
  width?: number
  height?: number
  depth?: number
  name?: string
  value?: number
  root?: unknown
  currentWeight?: number
  code?: string
  pnlPct?: number
}

function CustomContent(props: ContentProps) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', code = '', pnlPct = 0 } = props
  const color = pnlColor(pnlPct)
  const showText = width > 44 && height > 32
  return (
    <g>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, width - 2)}
        height={Math.max(0, height - 2)}
        rx={8}
        ry={8}
        fill={color}
        stroke="#FAF9F6"
        strokeWidth={2}
      />
      {showText && (
        <>
          <text
            x={x + 10}
            y={y + 20}
            fill="rgba(255,255,255,0.95)"
            fontSize={Math.min(13, width / (code.length + 1))}
            fontWeight={700}
            fontFamily="monospace"
          >
            {code}
          </text>
          {height > 52 && (
            <text
              x={x + 10}
              y={y + 36}
              fill="rgba(255,255,255,0.7)"
              fontSize={10}
              fontFamily="sans-serif"
            >
              {name.length > 8 ? name.slice(0, 8) + '…' : name}
            </text>
          )}
          {height > 70 && (
            <text
              x={x + 10}
              y={y + 52}
              fill={pnlPct >= 0 ? 'rgba(134,239,172,0.9)' : 'rgba(252,165,165,0.9)'}
              fontSize={11}
              fontFamily="monospace"
              fontWeight={600}
            >
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </text>
          )}
        </>
      )}
    </g>
  )
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: StockNode & { value: number } }>
}

function TreemapTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const isPos = (d.pnl ?? 0) >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[168px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-slate-800 font-mono">{d.code}</span>
        <span className="text-slate-400 text-xs">{d.name}</span>
      </div>
      <div className="space-y-1 text-xs text-slate-500">
        <div className="flex justify-between gap-4">
          <span>市值</span>
          <span className="font-mono font-bold text-slate-800">${formatMoney(d.value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>比重</span>
          <span className="font-mono">{(d.currentWeight ?? 0).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>損益率</span>
          <span className={`font-mono font-bold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}>
            {isPos ? '+' : ''}{(d.pnlPct ?? 0).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export default function TreemapChart({ holdings }: Props) {
  const data = useMemo(() =>
    holdings
      .filter((h) => h.value > 0)
      .map((h) => ({ ...h, name: h.name })),
    [holdings]
  )

  if (data.length === 0) return null

  return (
    <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
      <Treemap
        data={data}
        dataKey="value"
        aspectRatio={4 / 3}
        content={<CustomContent />}
      >
        <Tooltip content={<TreemapTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  )
}

'use client'

/**
 * RadialWeightChart.tsx
 * 目標比重 vs 實際比重 RadialBarChart。
 * 每個標的一條弧，達標=藍，超標=深藍，不足=琥珀。
 */

import React, { useMemo } from 'react'
import { RadialBarChart, RadialBar, ResponsiveContainer, Tooltip } from 'recharts'

interface WeightItem {
  code: string
  name: string
  targetWeight: number
  currentWeight: number
}

interface Props {
  weights: WeightItem[]
}

const COLORS = ['#2C5F8A', '#4A90C4', '#60A5FA', '#34D399', '#F59E0B', '#F87171', '#A78BFA']

interface TooltipProps {
  active?: boolean
  payload?: Array<{ payload: WeightItem & { fill: string; currentWeight: number; targetWeight: number } }>
}

function RadialTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const diff = d.currentWeight - d.targetWeight
  const isOver = diff > 0.5
  const isUnder = diff < -0.5
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[148px]">
      <div className="font-bold text-slate-800 mb-1.5 font-mono">{d.code}</div>
      <div className="space-y-1 text-slate-500">
        <div className="flex justify-between gap-3">
          <span>目標</span>
          <span className="font-mono">{d.targetWeight.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>現在</span>
          <span className={`font-mono font-bold ${
            isOver ? 'text-blue-600' : isUnder ? 'text-amber-500' : 'text-emerald-600'
          }`}>{d.currentWeight.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>偏差</span>
          <span className={`font-mono font-semibold ${
            isOver ? 'text-blue-500' : isUnder ? 'text-amber-500' : 'text-slate-400'
          }`}>{diff >= 0 ? '+' : ''}{diff.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  )
}

export default function RadialWeightChart({ weights }: Props) {
  const data = useMemo(() =>
    weights
      .filter((w) => w.targetWeight > 0)
      .map((w, i) => ({
        ...w,
        value: Math.min(w.currentWeight, 100),
        target: w.targetWeight,
        fill: COLORS[i % COLORS.length],
      })),
    [weights]
  )

  if (data.length === 0) return null

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%" className="text-xs md:text-sm">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="25%"
            outerRadius="90%"
            data={data}
            startAngle={180}
            endAngle={0}
            barSize={18}
          >
            <RadialBar
              label={false}
              background={{ fill: '#f1f5f9' }}
              dataKey="value"
            />
            <Tooltip content={<RadialTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center pt-1">
        {data.map((d) => (
          <div key={d.code} className="flex items-center gap-1 text-[11px] text-slate-600 font-mono">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
            <span>{d.code}</span>
            <span className="text-slate-400">({d.currentWeight.toFixed(1)}%/{d.targetWeight}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}

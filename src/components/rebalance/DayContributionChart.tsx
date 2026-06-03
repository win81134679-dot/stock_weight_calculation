'use client'

/**
 * DayContributionChart.tsx
 * 今日貢獻度橫條圖：每檔持倉對今日 P&L 的貢獻（綠=正、紅=負），
 * 按絕對貢獻大小排序。使用現有 Recharts，不需額外套件。
 */

import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import { formatMoney } from '@/lib/calculator'

export interface ContributionItem {
  code: string
  contribution: number  // (price - prevClose) * shares
}

interface TooltipPayloadItem {
  payload: ContributionItem
  value: number
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload?.length) return null
  const { code, contribution } = payload[0].payload
  const isUp = contribution >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-mono font-bold text-[#1A1A2E]">{code}</p>
      <p
        className={`font-mono font-semibold ${
          isUp ? 'text-emerald-600' : 'text-red-500'
        }`}
      >
        今日貢獻：{isUp ? '+' : ''}${formatMoney(Math.abs(contribution))}
      </p>
    </div>
  )
}

interface DayContributionChartProps {
  items: ContributionItem[]
}

export default function DayContributionChart({ items }: DayContributionChartProps) {
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.contribution - a.contribution),
    [items]
  )

  // 沒資料 or 全部貢獻為 0（收盤前無成交）→ 不渲染
  if (items.length === 0) return null
  if (items.every((i) => i.contribution === 0)) return null

  const barH = 36
  const chartH = sorted.length * barH + 8

  return (
    <div className="glass-card p-4 animate-fade-up">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          今日貢獻度
        </p>
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded bg-emerald-500 inline-block" />
            正貢獻
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="w-2 h-2 rounded bg-red-400 inline-block" />
            負貢獻
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={chartH} className="text-xs md:text-sm">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 0, right: 60, left: 0, bottom: 0 }}
          barSize={20}
        >
          <XAxis
            type="number"
            tickFormatter={(v: number) =>
              v === 0 ? '0' : `${v > 0 ? '+' : ''}$${formatMoney(Math.abs(v))}`
            }
            tick={{ fontSize: 8, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="code"
            tick={{ fontSize: 10, fill: '#1A1A2E', fontWeight: 700, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <ReferenceLine x={0} stroke="#e2e8f0" strokeWidth={1} />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
          />
          <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
            {sorted.map((item, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={item.contribution >= 0 ? '#10b981' : '#ef4444'}
                fillOpacity={0.85}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

'use client'

import React from 'react'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { PortfolioResult } from '@/lib/types'
import { formatMoney } from '@/lib/calculator'

interface Props {
  result: PortfolioResult | null
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#f43f5e']

export default function PortfolioChart({ result }: Props) {
  if (!result) return null

  const validStocks = result.stocks.filter((s) => s.price > 0 && s.weight > 0)
  if (validStocks.length === 0) return null

  // 圓餅圖資料
  const pieData = validStocks.map((s) => ({
    name: s.name || s.code,
    value: s.weight,
  }))

  // 長條圖資料
  const barData = validStocks.map((s) => ({
    name: s.name || s.code,
    分配金額: s.allocatedAmount,
    實際投入: s.actualCost,
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCustomLabel = (props: any) => {
    const { value, cx, cy, midAngle, innerRadius, outerRadius } = props
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {value}%
      </text>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 圓餅圖 — 權重分佈 */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          權重分佈
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomLabel}
              outerRadius={90}
              innerRadius={40}
              dataKey="value"
              stroke="none"
            >
              {pieData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => `${v}%`} />
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-slate-600">{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* 長條圖 — 金額分配 */}
      <div>
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
          金額分配
        </h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={barData} barGap={4}>
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 10000).toFixed(0)}萬`}
            />
            <Tooltip
              formatter={(v) => `$${formatMoney(Number(v))}`}
              contentStyle={{
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                fontSize: '12px',
              }}
            />
            <Legend
              formatter={(value: string) => (
                <span className="text-xs text-slate-600">{value}</span>
              )}
            />
            <Bar dataKey="分配金額" fill="#94a3b8" radius={[6, 6, 0, 0]} />
            <Bar dataKey="實際投入" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

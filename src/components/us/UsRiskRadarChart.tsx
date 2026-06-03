'use client'

/**
 * UsRiskRadarChart.tsx
 * 美股風險分散度雷達圖 — 新功能
 * 多維度評估投資組合風險：集中度、波動度、偏差度、報酬率、配息率
 */

import React from 'react'
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts'

interface RiskMetrics {
  concentration: number // 集中度（100 - 最大持股比重）
  volatility: number // 波動度（100 - 回撤百分比）
  deviation: number // 偏差度（100 - 最大偏差）
  returnRate: number // 報酬率（轉換成 0-100，0% = 50）
  dividendYield: number // 配息率（年化配息 / 總市值 × 1000）
}

interface Props {
  metrics: RiskMetrics
}

export default function UsRiskRadarChart({ metrics }: Props) {
  const data = [
    { subject: '分散度', value: Math.min(100, Math.max(0, metrics.concentration)), fullMark: 100 },
    { subject: '穩定度', value: Math.min(100, Math.max(0, metrics.volatility)), fullMark: 100 },
    { subject: '平衡度', value: Math.min(100, Math.max(0, metrics.deviation)), fullMark: 100 },
    { subject: '報酬率', value: Math.min(100, Math.max(0, metrics.returnRate)), fullMark: 100 },
    { subject: '配息力', value: Math.min(100, Math.max(0, metrics.dividendYield)), fullMark: 100 },
  ]

  return (
    <div>
      <ResponsiveContainer width="100%" height={280} className="text-xs md:text-sm">
        <RadarChart data={data}>
          <PolarGrid stroke="#e2e8f0" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: '#64748b' }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <Radar
            name="風險指標"
            dataKey="value"
            stroke="#2C5F8A"
            fill="#2C5F8A"
            fillOpacity={0.6}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value: number) => [`${value.toFixed(0)} 分`, '評分']}
          />
        </RadarChart>
      </ResponsiveContainer>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <MetricLabel label="分散度" value={data[0].value} desc="持股越分散分數越高" />
        <MetricLabel label="穩定度" value={data[1].value} desc="回撤越小分數越高" />
        <MetricLabel label="平衡度" value={data[2].value} desc="權重偏差越小分數越高" />
        <MetricLabel label="報酬率" value={data[3].value} desc="正報酬加分、負報酬減分" />
        <MetricLabel label="配息力" value={data[4].value} desc="配息率越高分數越高" />
      </div>
    </div>
  )
}

function MetricLabel({ label, value, desc }: { label: string; value: number; desc: string }) {
  const color = value >= 70 ? 'text-emerald-600' : value >= 50 ? 'text-blue-600' : value >= 30 ? 'text-amber-500' : 'text-red-500'
  return (
    <div className="rounded-lg bg-slate-50 p-2 text-center">
      <div className="text-[10px] text-slate-400 uppercase">{label}</div>
      <div className={`font-mono font-bold text-sm ${color}`}>{value.toFixed(0)}</div>
      <div className="text-[9px] text-slate-400 mt-0.5">{desc}</div>
    </div>
  )
}

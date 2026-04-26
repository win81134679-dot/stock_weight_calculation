'use client'

/**
 * AccountCharts.tsx
 * 個別帳戶專用圖表：持倉比例圓餅圖 + 損益歷史折線圖。
 * 僅在選擇特定帳戶時渲染，合併總覽不顯示。
 */

import React, { useMemo } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { PnLSnapshot } from '@/lib/types'
import PnLHistoryChart from './PnLHistoryChart'
import { formatMoney } from '@/lib/calculator'

const PIE_COLORS = ['#2C5F8A', '#4A90C4', '#60A5FA', '#34D399', '#F59E0B', '#F87171', '#A78BFA', '#FB923C']

interface HoldingRow {
  code: string
  name: string
  value: number
  currentWeight: number
  targetWeight: number
  pnl: number
  pnlPct: number
}

interface Props {
  accountId: string
  holdings: HoldingRow[]
  snapshots: PnLSnapshot[]
}

interface PiePayload {
  code: string
  name: string
  value: number
  weight: number
  targetWeight: number
  pnl: number
  pnlPct: number
}

function PieTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ payload: PiePayload; fill: string }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const d = payload[0].payload
  const isPos = d.pnl >= 0
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm min-w-[160px]">
      <div className="flex items-center gap-2 mb-2">
        <span
          className="inline-block w-3 h-3 rounded-full"
          style={{ background: payload[0].fill }}
        />
        <span className="font-bold text-slate-800">{d.code}</span>
        <span className="text-slate-400 text-xs">{d.name}</span>
      </div>
      <div className="space-y-1 text-xs text-slate-500">
        <div className="flex justify-between gap-4">
          <span>市值</span>
          <span className="font-mono font-bold text-slate-800">${formatMoney(d.value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>現在比重</span>
          <span className="font-mono font-bold text-slate-700">{d.weight.toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>目標比重</span>
          <span className="font-mono text-slate-500">{d.targetWeight.toFixed(0)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>損益</span>
          <span className={`font-mono font-bold ${isPos ? 'text-green-600' : 'text-red-500'}`}>
            {isPos ? '+' : ''}${formatMoney(d.pnl)} ({isPos ? '+' : ''}{d.pnlPct.toFixed(2)}%)
          </span>
        </div>
      </div>
    </div>
  )
}

function PieLegend({ payload }: { payload?: Array<{ value: string; color: string; payload: { weight: number } }> }) {
  if (!payload) return null
  return (
    <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
      {payload.map((entry, i) => (
        <li key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: entry.color }} />
          <span className="font-mono font-medium">{entry.value}</span>
          <span className="text-slate-400">({entry.payload.weight.toFixed(1)}%)</span>
        </li>
      ))}
    </ul>
  )
}

export default function AccountCharts({ accountId, holdings, snapshots }: Props) {
  const pieData = useMemo(() =>
    holdings
      .filter((h) => h.value > 0)
      .map((h) => ({
        code: h.code,
        name: h.name,
        value: h.value,
        weight: h.currentWeight,
        targetWeight: h.targetWeight,
        pnl: h.pnl,
        pnlPct: h.pnlPct,
      })),
    [holdings]
  )

  const hasSnapshots = snapshots.length >= 2

  if (pieData.length === 0 && !hasSnapshots && snapshots.length === 0) return null

  return (
    <div className="flex flex-col gap-4 mt-2">
      {/* 圓餅圖 */}
      {pieData.length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">持倉比例</p>
          <p className="text-xs text-slate-400 mb-3">各標的市值佔比（圓圈大小 = 比重）</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="code"
                cx="50%"
                cy="45%"
                innerRadius="38%"
                outerRadius="65%"
                paddingAngle={2}
                label={false}
                labelLine={false}
              >
                {pieData.map((_, idx) => (
                  <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend content={<PieLegend />} />
            </PieChart>
          </ResponsiveContainer>

          {/* Target vs actual comparison bar */}
          {pieData.some((d) => d.targetWeight > 0) && (
            <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              {pieData.map((d, idx) => {
                const diff = d.weight - d.targetWeight
                const isOver = diff > 0
                return (
                  <div key={d.code} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <span className="w-14 font-mono font-medium text-slate-700">{d.code}</span>
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          Math.abs(diff) < 1 ? 'bg-slate-300' : isOver ? 'bg-red-400' : 'bg-blue-400'
                        }`}
                        style={{ width: `${Math.min((d.weight / 100) * 100, 100)}%` }}
                      />
                    </div>
                    <span className={`w-14 text-right font-mono ${
                      Math.abs(diff) < 1 ? 'text-slate-400' : isOver ? 'text-red-500' : 'text-blue-500'
                    }`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* PnL 折線圖 */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">損益歷史</p>
        <p className="text-xs text-slate-400 mb-3">此帳戶每日損益快照</p>
        {hasSnapshots ? (
          <PnLHistoryChart snapshots={snapshots} accountId={accountId} />
        ) : (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-center">
            <div className="text-3xl mb-2">📅</div>
            <p className="text-sm font-medium text-slate-500">資料累積中</p>
            <p className="text-xs mt-1">
              目前有 {snapshots.length} 筆快照<br />
              明天再開啟 App 即可看到折線圖
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

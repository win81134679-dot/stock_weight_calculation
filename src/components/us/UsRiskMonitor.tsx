'use client'

/**
 * UsRiskMonitor.tsx
 * 美股風險監控儀表板 — 偏差警示、再平衡提醒、集中度風險
 */

import React from 'react'
import { UsAccountSummary } from '@/lib/us-rebalance-calculator'
import { formatTwd } from '@/lib/us-calculator'

interface RiskAlert {
  type: 'warning' | 'danger' | 'info'
  title: string
  message: string
}

interface Props {
  accountSummaries: UsAccountSummary[]
  nextRebalanceDate?: string
  combinedPnlPct: number
  combinedValueTwd: number
}

export default function UsRiskMonitor({
  accountSummaries,
  nextRebalanceDate,
  combinedPnlPct,
  combinedValueTwd,
}: Props) {
  const alerts: RiskAlert[] = []

  // 1. 檢查偏差超過 ±5%
  accountSummaries.forEach((summary) => {
    summary.holdings.forEach((holding) => {
      const deviation = holding.currentWeight - holding.targetWeight
      if (Math.abs(deviation) > 5) {
        alerts.push({
          type: deviation > 0 ? 'warning' : 'danger',
          title: `${holding.symbol} 偏差過大`,
          message: `目前 ${holding.currentWeight.toFixed(1)}% vs 目標 ${holding.targetWeight.toFixed(1)}%（${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%）`,
        })
      }
    })
  })

  // 2. 檢查單一持股占比過高（>40%）
  accountSummaries.forEach((summary) => {
    summary.holdings.forEach((holding) => {
      if (holding.currentWeight > 40) {
        alerts.push({
          type: 'danger',
          title: `${holding.symbol} 集中度風險`,
          message: `單一標的占比 ${holding.currentWeight.toFixed(1)}% 過高，建議分散風險`,
        })
      }
    })
  })

  // 3. 檢查再平衡日期接近
  if (nextRebalanceDate) {
    const daysLeft = Math.floor((new Date(nextRebalanceDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    if (daysLeft <= 7 && daysLeft >= 0) {
      alerts.push({
        type: daysLeft <= 3 ? 'danger' : 'warning',
        title: `再平衡倒數 ${daysLeft} 天`,
        message: `下次再平衡日期：${nextRebalanceDate}`,
      })
    }
  }

  // 4. 檢查總損益超過 ±20%
  if (Math.abs(combinedPnlPct) > 20) {
    alerts.push({
      type: combinedPnlPct > 0 ? 'info' : 'danger',
      title: combinedPnlPct > 0 ? '投資組合大幅獲利' : '投資組合大幅虧損',
      message: `總報酬率 ${combinedPnlPct >= 0 ? '+' : ''}${combinedPnlPct.toFixed(2)}%，建議檢視策略`,
    })
  }

  // 5. 檢查總市值過小（<10萬台幣）
  if (combinedValueTwd > 0 && combinedValueTwd < 100000) {
    alerts.push({
      type: 'info',
      title: '投資組合規模較小',
      message: `總市值 NT$${formatTwd(combinedValueTwd)}，交易成本比例可能較高`,
    })
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <div className="text-2xl">✅</div>
          <div>
            <div className="font-semibold text-green-900">投資組合狀態良好</div>
            <div className="text-sm text-green-700">無重大風險警示，持續追蹤即可</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <AlertCard key={index} alert={alert} />
      ))}
    </div>
  )
}

function AlertCard({ alert }: { alert: RiskAlert }) {
  const colors = {
    warning: {
      border: 'border-yellow-200',
      bg: 'bg-yellow-50',
      icon: '⚠️',
      title: 'text-yellow-900',
      message: 'text-yellow-700',
    },
    danger: {
      border: 'border-red-200',
      bg: 'bg-red-50',
      icon: '🚨',
      title: 'text-red-900',
      message: 'text-red-700',
    },
    info: {
      border: 'border-blue-200',
      bg: 'bg-blue-50',
      icon: 'ℹ️',
      title: 'text-blue-900',
      message: 'text-blue-700',
    },
  }

  const style = colors[alert.type]

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-3`}>
      <div className="flex items-start gap-3">
        <div className="text-xl">{style.icon}</div>
        <div className="flex-1">
          <div className={`font-semibold ${style.title}`}>{alert.title}</div>
          <div className={`text-sm ${style.message} mt-1`}>{alert.message}</div>
        </div>
      </div>
    </div>
  )
}

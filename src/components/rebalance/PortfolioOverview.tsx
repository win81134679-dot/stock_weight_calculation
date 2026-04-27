'use client'

/**
 * PortfolioOverview.tsx
 * Main overview tab: account PnL summary + deviation indicators + combined PnL.
 */

import React, { useMemo } from 'react'
import { Account, Holding, PriceCache, TargetWeight, PnLSnapshot, Transaction } from '@/lib/types'
import { calcAccountPnL, calcCombinedPnL } from '@/lib/rebalance-calculator'
import { formatMoney } from '@/lib/calculator'
import { accountColorStyle } from './AccountManager'
import ScenarioChart from './ScenarioChart'
import AccountCharts from './AccountCharts'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  prices: Record<string, PriceCache>
  targetWeights: TargetWeight[]
  snapshots: PnLSnapshot[]
  loading: boolean
  onRefreshPrices: () => void
}

function PnLBadge({ pnl, pct }: { pnl: number; pct: number }) {
  const isPos = pnl >= 0
  return (
    <div className={`flex items-center gap-1 font-mono text-sm font-bold ${isPos ? 'text-green-600' : 'text-red-500'}`}>
      <span>{isPos ? '▲' : '▼'}</span>
      <span>${formatMoney(Math.abs(pnl))}</span>
      <span className="text-xs font-normal opacity-70">({isPos ? '+' : ''}{pct.toFixed(2)}%)</span>
    </div>
  )
}

function DeviationBar({ current, target }: { current: number; target: number }) {
  const diff = current - target
  const clamp = Math.min(Math.abs(diff), 20) / 20 // max 20% shown as full bar
  const isOver = diff > 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            Math.abs(diff) < 1 ? 'bg-slate-300' : isOver ? 'bg-red-400' : 'bg-blue-400'
          }`}
          style={{ width: `${Math.max(clamp * 100, 4)}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-14 text-right ${
        Math.abs(diff) < 1 ? 'text-slate-400' : isOver ? 'text-red-500' : 'text-blue-500'
      }`}>
        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
      </span>
    </div>
  )
}

export default function PortfolioOverview({
  accounts,
  holdings,
  transactions,
  prices,
  targetWeights,
  snapshots,
  loading,
  onRefreshPrices,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = React.useState<string>('__all__')

  const combined = useMemo(
    () => calcCombinedPnL(accounts.map((a) => a.id), holdings, prices, targetWeights, transactions),
    [accounts, holdings, prices, targetWeights, transactions]
  )

  const accountPnLs = useMemo(
    () => accounts.map((a) => ({ account: a, pnl: calcAccountPnL(a.id, holdings, prices, targetWeights, transactions) })),
    [accounts, holdings, prices, targetWeights, transactions]
  )

  const displayPnL = selectedAccountId === '__all__'
    ? { totalValue: combined.totalValue, totalCost: combined.totalCost, totalFees: combined.totalFees, totalPnl: combined.totalPnl, pnlPct: combined.pnlPct, holdings: combined.byAccount.flatMap((a) => a.holdings) }
    : accountPnLs.find((a) => a.account.id === selectedAccountId)?.pnl

  if (accounts.length === 0) {
    return (
      <div className="text-center py-14 text-slate-400">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-sm">尚未建立帳戶</p>
        <p className="text-xs mt-1">請至「持倉管理」→「帳戶管理」新增帳戶</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => setSelectedAccountId('__all__')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            selectedAccountId === '__all__'
              ? 'bg-[#2C5F8A] text-white border-[#2C5F8A]'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          全部合併
        </button>
        {accounts.map((acc) => {
          const s = accountColorStyle(acc.color)
          const active = acc.id === selectedAccountId
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                active ? `${s.bg} ${s.border} ${s.text}` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {acc.name}
            </button>
          )
        })}
        <button
          onClick={onRefreshPrices}
          disabled={loading}
          className="ml-auto text-xs text-[#4A90C4] hover:text-[#2C5F8A] disabled:opacity-40 flex items-center gap-1"
        >
          {loading ? '更新中…' : '↺ 更新股價'}
        </button>
      </div>

      {/* Summary cards */}
      {displayPnL && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '總市值', value: `$${formatMoney(displayPnL.totalValue)}`, sub: '' },
            { label: '總成本', value: `$${formatMoney(displayPnL.totalCost)}`, sub: '' },
            {
              label: '損益',
              value: `${displayPnL.totalPnl >= 0 ? '+' : ''}$${formatMoney(Math.abs(displayPnL.totalPnl))}`,
              sub: `${displayPnL.pnlPct >= 0 ? '+' : ''}${displayPnL.pnlPct.toFixed(2)}%`,
              color: displayPnL.totalPnl >= 0 ? 'text-green-600' : 'text-red-500',
            },
            {
              label: '已付手續費',
              value: displayPnL.totalFees > 0 ? `-$${formatMoney(displayPnL.totalFees)}` : '$0',
              sub: '',
              color: displayPnL.totalFees > 0 ? 'text-orange-500' : 'text-slate-400',
            },
          ].map((card) => (
            <div key={card.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs text-slate-400 mb-1">{card.label}</p>
              <p className={`text-base font-bold font-mono ${card.color ?? 'text-[#1A1A2A]'}`}>{card.value}</p>
              {card.sub && <p className={`text-xs mt-0.5 ${card.color ?? 'text-slate-400'}`}>{card.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Holdings deviation table */}
      {displayPnL && displayPnL.holdings.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2 text-left">代碼 / 名稱</th>
                <th className="px-3 py-2 text-right">股數</th>
                <th className="px-3 py-2 text-right">現價</th>
                <th className="px-3 py-2 text-right">市值</th>
                <th className="px-3 py-2 text-right">損益</th>
                <th className="px-3 py-2 text-right">目標</th>
                <th className="px-3 py-2 min-w-[140px]">偏差</th>
              </tr>
            </thead>
            <tbody>
              {displayPnL.holdings.map((h, i) => (
                <tr key={`${h.code}-${i}`} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-mono font-medium text-[#1A1A2A]">{h.code}</div>
                    <div className="text-xs text-slate-400">{h.name}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{h.shares.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.price > 0 ? `$${h.price.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {h.price > 0 ? `$${formatMoney(h.value)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {h.price > 0 ? (
                      <PnLBadge pnl={h.pnl} pct={h.pnlPct} />
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">
                    {h.targetWeight > 0 ? `${h.targetWeight.toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {h.price > 0 && h.targetWeight > 0 ? (
                      <DeviationBar current={h.currentWeight} target={h.targetWeight} />
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {displayPnL && displayPnL.holdings.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          此帳戶尚未有持倉資料，請至「持倉管理」新增
        </div>
      )}

      {/* Per-account charts: pie + PnL history (only for individual accounts, not combined) */}
      {selectedAccountId !== '__all__' && displayPnL && (
        <AccountCharts
          accountId={selectedAccountId}
          holdings={displayPnL.holdings}
          snapshots={snapshots}
        />
      )}

      {/* Scenario simulation chart */}
      <ScenarioChart
        holdings={holdings}
        prices={prices}
        targetWeights={targetWeights}
      />
    </div>
  )
}

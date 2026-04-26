'use client'

/**
 * QuarterlyRebalancer.tsx
 * Quarterly rebalance suggestion: shows buy/sell actions per account.
 */

import React, { useState, useMemo } from 'react'
import { Account, Holding, PriceCache, TargetWeight } from '@/lib/types'
import { calcQuarterlyRebalance, daysUntilRebalance } from '@/lib/rebalance-calculator'
import { formatMoney } from '@/lib/calculator'
import { accountColorStyle } from './AccountManager'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  prices: Record<string, PriceCache>
  targetWeights: TargetWeight[]
  nextRebalanceDate: string
  discount: number
}

export default function QuarterlyRebalancer({
  accounts,
  holdings,
  prices,
  targetWeights,
  nextRebalanceDate,
  discount,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? '')

  const daysLeft = useMemo(() => daysUntilRebalance(nextRebalanceDate), [nextRebalanceDate])

  const plan = useMemo(() => {
    if (!selectedAccountId) return null
    return calcQuarterlyRebalance(selectedAccountId, holdings, prices, targetWeights, discount)
  }, [selectedAccountId, holdings, prices, targetWeights, discount])

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        請先至「持倉管理」建立帳戶並輸入持倉
      </div>
    )
  }

  const urgencyColor =
    daysLeft <= 0 ? 'bg-red-50 border-red-200 text-red-700' :
    daysLeft <= 7 ? 'bg-orange-50 border-orange-200 text-orange-700' :
    daysLeft <= 30 ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
    'bg-blue-50 border-blue-200 text-blue-700'

  return (
    <div className="space-y-4">
      {/* Countdown banner */}
      <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${urgencyColor}`}>
        <div>
          <p className="font-semibold text-sm">
            {daysLeft <= 0 ? '🔔 今日為再平衡日！' : `📅 下次再平衡倒數 ${daysLeft} 天`}
          </p>
          <p className="text-xs opacity-70 mt-0.5">預計日期：{nextRebalanceDate}</p>
        </div>
        <div className="text-3xl font-black opacity-20">{daysLeft <= 0 ? '0' : daysLeft}</div>
      </div>

      {/* Account selector */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">計算帳戶</p>
        <div className="flex gap-2 flex-wrap">
          {accounts.map((acc) => {
            const s = accountColorStyle(acc.color)
            const active = acc.id === selectedAccountId
            return (
              <button
                key={acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  active ? `${s.bg} ${s.border} ${s.text}` : 'bg-white border-slate-200 text-slate-500'
                }`}
              >
                {acc.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
        <span className="font-semibold">建議：</span>
        賣出會產生手續費與證交稅，優先透過「資金投入」補足欠買方向，減少賣出操作。
      </div>

      {/* Plan table */}
      {plan && plan.actions.length > 0 && (
        <>
          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {plan.actions.map((a) => (
              <div key={a.code} className={`rounded-xl border p-3 ${
                a.action === 'buy' ? 'bg-green-50 border-green-200' :
                a.action === 'sell' ? 'bg-red-50 border-red-200' :
                'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex justify-between items-center mb-2">
                  <span className="font-mono font-bold">{a.code}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                    a.action === 'buy' ? 'bg-green-200 text-green-800' :
                    a.action === 'sell' ? 'bg-red-200 text-red-800' :
                    'bg-slate-200 text-slate-600'
                  }`}>
                    {a.action === 'buy' ? '買入' : a.action === 'sell' ? '賣出' : '持平'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-slate-500">現價</div>
                  <div className="text-right font-mono">${a.price.toFixed(2)}</div>
                  <div className="text-slate-500">目前比重 → 目標</div>
                  <div className="text-right font-mono">{a.currentWeight.toFixed(1)}% → {a.targetWeight}%</div>
                  {a.action !== 'hold' && (
                    <>
                      <div className="text-slate-500">股數變化</div>
                      <div className="text-right font-mono font-semibold">
                        {a.sharesChange > 0 ? '+' : ''}{a.sharesChange}股
                      </div>
                      <div className="text-slate-500">預估金額</div>
                      <div className="text-right font-mono">${formatMoney(a.estimatedAmount)}</div>
                      <div className="text-slate-500">手續費+稅</div>
                      <div className="text-right font-mono text-orange-600">${formatMoney(a.fee + a.tax)}</div>
                      <div className="text-slate-500">執行後比重</div>
                      <div className="text-right font-mono font-semibold text-[#2C5F8A]">{a.newWeight.toFixed(1)}%</div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">代碼</th>
                  <th className="px-3 py-2 text-center">動作</th>
                  <th className="px-3 py-2 text-right">現價</th>
                  <th className="px-3 py-2 text-right">目前比重</th>
                  <th className="px-3 py-2 text-right">目標比重</th>
                  <th className="px-3 py-2 text-right">股數變化</th>
                  <th className="px-3 py-2 text-right">預估金額</th>
                  <th className="px-3 py-2 text-right">手續費</th>
                  <th className="px-3 py-2 text-right">稅金</th>
                  <th className="px-3 py-2 text-right">執行後比重</th>
                </tr>
              </thead>
              <tbody>
                {plan.actions.map((a) => (
                  <tr key={a.code} className={`border-t border-slate-100 ${
                    a.action === 'sell' ? 'bg-red-50/30' : ''
                  }`}>
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold">{a.code}</div>
                      <div className="text-xs text-slate-400">{a.name}</div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                        a.action === 'buy' ? 'bg-green-100 text-green-700' :
                        a.action === 'sell' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>
                        {a.action === 'buy' ? '買入' : a.action === 'sell' ? '賣出 ⚠️' : '持平'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${a.price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono">{a.currentWeight.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-mono">{a.targetWeight}%</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${
                      a.sharesChange > 0 ? 'text-green-600' : a.sharesChange < 0 ? 'text-red-500' : 'text-slate-400'
                    }`}>
                      {a.sharesChange > 0 ? '+' : ''}{a.sharesChange}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${formatMoney(a.estimatedAmount)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">${a.fee}</td>
                    <td className="px-3 py-2 text-right font-mono text-orange-500">${a.tax}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-[#2C5F8A]">
                      {a.newWeight.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cash flow summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '買入總花費', value: `$${formatMoney(plan.totalBuyCost)}`, color: 'text-green-700' },
              { label: '賣出淨回收', value: `$${formatMoney(plan.totalSellReturn)}`, color: 'text-red-600' },
              {
                label: '需補充現金',
                value: `${plan.netCashFlow >= 0 ? '+' : ''}$${formatMoney(Math.abs(plan.netCashFlow))}`,
                color: plan.netCashFlow > 0 ? 'text-orange-600' : 'text-green-600',
              },
            ].map((c) => (
              <div key={c.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                <p className="text-xs text-slate-400 mb-1">{c.label}</p>
                <p className={`font-bold font-mono text-base ${c.color}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {plan && plan.actions.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          此帳戶尚無持倉資料，無法計算再平衡
        </div>
      )}
    </div>
  )
}

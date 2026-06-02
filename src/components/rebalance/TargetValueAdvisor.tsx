'use client'

/**
 * TargetValueAdvisor.tsx
 * 目標總市值配置：輸入目標總市值，計算需買賣哪些標的以達成目標權重
 */

import React, { useState, useMemo } from 'react'
import { Account, Holding, PriceCache, AllocationConfig } from '@/lib/types'
import { calcTargetValueRebalance } from '@/lib/rebalance-calculator'
import { formatMoney } from '@/lib/calculator'
import { accountColorStyle } from './AccountManager'
import { resolveAccountConfig } from '@/lib/portfolio-store'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  prices: Record<string, PriceCache>
  allocationConfigs: AllocationConfig[]
  discount: number
}

const QUICK_TARGET_VALUES = [100000, 200000, 300000, 500000, 1000000]

export default function TargetValueAdvisor({
  accounts,
  holdings,
  prices,
  allocationConfigs,
  discount,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [targetTotalValue, setTargetTotalValue] = useState<number>(0)
  const [targetInputStr, setTargetInputStr] = useState<string>('0')
  const [realizedPnL, setRealizedPnL] = useState<number>(0)
  const [realizedInputStr, setRealizedInputStr] = useState<string>('0')

  const account = accounts.find((a) => a.id === selectedAccountId)
  const targetWeights = account ? resolveAccountConfig(account, allocationConfigs).targetWeights : []
  const configName = account ? resolveAccountConfig(account, allocationConfigs).name : ''

  // Current account total value & cost
  const acctValue = holdings
    .filter((h) => h.accountId === selectedAccountId)
    .reduce((s, h) => s + h.shares * (prices[h.code]?.price ?? 0), 0)

  const acctCost = holdings
    .filter((h) => h.accountId === selectedAccountId)
    .reduce((s, h) => s + Math.floor(h.shares * h.avgCost), 0)

  const result = useMemo(() => {
    if (!selectedAccountId || targetWeights.length === 0 || targetTotalValue <= 0) return null
    return calcTargetValueRebalance(
      selectedAccountId, holdings, prices, targetWeights, targetTotalValue, realizedPnL, discount
    )
  }, [selectedAccountId, holdings, prices, targetWeights, targetTotalValue, realizedPnL, discount])

  function handleTargetInput(raw: string) {
    setTargetInputStr(raw)
    const n = parseFloat(raw.replace(/,/g, ''))
    if (!isNaN(n) && n >= 0) setTargetTotalValue(n)
  }

  function handleRealizedInput(raw: string) {
    setRealizedInputStr(raw)
    const n = parseFloat(raw.replace(/,/g, ''))
    if (!isNaN(n)) setRealizedPnL(n)
  }

  function handleQuick(amount: number) {
    setTargetTotalValue(amount)
    setTargetInputStr(amount.toString())
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        請先至「持倉管理」建立帳戶並輸入持倉
      </div>
    )
  }

  const style = account ? accountColorStyle(account.color) : accountColorStyle('blue')
  const requiredFund = targetTotalValue - acctValue - realizedPnL

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">選擇配置帳戶</p>
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
                {acctValue > 0 && acc.id === selectedAccountId && (
                  <span className="ml-1 text-xs opacity-60">${formatMoney(acctValue)}</span>
                )}
              </button>
            )
          })}
        </div>
        {configName && (
          <p className="mt-1.5 text-[11px] text-slate-400">使用配置：<span className="font-semibold text-[#2C5F8A]">{configName}</span></p>
        )}
      </div>

      {/* Input section */}
      <div className={`rounded-xl border p-4 space-y-4 ${style.bg} ${style.border}`}>
        {/* Target Total Value */}
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">目標總市值（台幣）</p>
          <div className="flex gap-2 flex-wrap mb-3">
            {QUICK_TARGET_VALUES.map((amt) => (
              <button
                key={amt}
                onClick={() => handleQuick(amt)}
                className={`px-3 py-1.5 text-sm rounded-lg border font-mono transition-colors ${
                  targetTotalValue === amt
                    ? 'bg-[#2C5F8A] text-white border-[#2C5F8A]'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-[#4A90C4]'
                }`}
              >
                ${amt >= 10000 ? (amt / 10000).toFixed(0) : amt}萬
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-slate-500 text-sm">$</span>
            <input
              type="text"
              inputMode="numeric"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono"
              value={targetInputStr}
              onChange={(e) => handleTargetInput(e.target.value)}
              placeholder="輸入目標總市值"
            />
            <span className="text-xs text-slate-400">元</span>
          </div>
        </div>

        {/* Realized PnL */}
        <div>
          <p className="text-xs font-semibold text-slate-500 mb-2">
            已實現損益（選填）
            <span className="ml-1 text-[10px] text-slate-400 font-normal">
              本次換倉賣出的獲利/虧損
            </span>
          </p>
          <div className="flex gap-2 items-center">
            <span className="text-slate-500 text-sm">$</span>
            <input
              type="text"
              inputMode="numeric"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono"
              value={realizedInputStr}
              onChange={(e) => handleRealizedInput(e.target.value)}
              placeholder="0（正數=獲利、負數=虧損）"
            />
            <span className="text-xs text-slate-400">元</span>
          </div>
        </div>

        {/* Summary */}
        <div className="border-t border-slate-200 pt-3 space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">目前總市值</span>
            <span className="font-mono font-semibold">${formatMoney(acctValue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">目前總成本</span>
            <span className="font-mono font-semibold">${formatMoney(acctCost)}</span>
          </div>
          {realizedPnL !== 0 && (
            <div className="flex justify-between">
              <span className="text-slate-500">已實現損益</span>
              <span className={`font-mono font-semibold ${realizedPnL > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {realizedPnL > 0 ? '+' : ''}${formatMoney(realizedPnL)}
              </span>
            </div>
          )}
          {targetTotalValue > 0 && (
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="text-slate-600 font-semibold">需投入金額</span>
              <span className={`font-mono font-bold text-base ${
                requiredFund > 0 ? 'text-green-600' : requiredFund < 0 ? 'text-red-600' : 'text-slate-600'
              }`}>
                {requiredFund > 0 ? '+' : ''}${formatMoney(requiredFund)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {result && result.actions.length > 0 && (
        <>
          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
              {result.warnings.map((w, i) => (
                <div key={i} className="text-yellow-700 text-sm flex items-start gap-2">
                  <span className="text-base">⚠️</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            <span className="font-semibold">目標總市值配置：</span>
            依目標總市值 ${formatMoney(targetTotalValue)} 與目標權重，自動計算各標的買賣清單。
            {realizedPnL !== 0 && (
              <span className="ml-1">
                本次換倉{realizedPnL > 0 ? '獲利' : '虧損'} ${formatMoney(Math.abs(realizedPnL))} 已計入。
              </span>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-600 mb-1">買入成本</div>
              <div className="text-xl font-bold font-mono text-green-700">
                ${formatMoney(result.totalBuyCost)}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-600 mb-1">賣出收入</div>
              <div className="text-xl font-bold font-mono text-red-700">
                ${formatMoney(result.totalSellReturn)}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <div className="text-xs text-blue-600 mb-1">實際需投入</div>
              <div className={`text-xl font-bold font-mono ${
                result.netCashFlow > 0 ? 'text-blue-700' : 'text-red-700'
              }`}>
                ${formatMoney(result.netCashFlow)}
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
              <div className="text-xs text-green-600 mb-1">調整後總市值</div>
              <div className="text-xl font-bold font-mono text-green-700">
                ${formatMoney(result.afterTotalValue)}
              </div>
            </div>
          </div>

          {/* After adjustment summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">調整後預估</p>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-400 mb-1">總成本</div>
                <div className="font-mono font-semibold">${formatMoney(result.afterTotalCost)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">總市值</div>
                <div className="font-mono font-semibold text-[#2C5F8A]">${formatMoney(result.afterTotalValue)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-400 mb-1">未實現損益</div>
                <div className={`font-mono font-semibold ${
                  result.afterUnrealizedPnL > 0 ? 'text-green-600' : result.afterUnrealizedPnL < 0 ? 'text-red-600' : 'text-slate-600'
                }`}>
                  {result.afterUnrealizedPnL > 0 ? '+' : ''}${formatMoney(result.afterUnrealizedPnL)}
                  {result.afterTotalCost > 0 && (
                    <span className="text-xs text-slate-400 ml-1">
                      ({((result.afterUnrealizedPnL / result.afterTotalCost) * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left">代碼</th>
                  <th className="px-3 py-2 text-right">現價</th>
                  <th className="px-3 py-2 text-right">持股</th>
                  <th className="px-3 py-2 text-right">目前比重</th>
                  <th className="px-3 py-2 text-right">目標比重</th>
                  <th className="px-3 py-2 text-center">操作</th>
                  <th className="px-3 py-2 text-right">股數變化</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2 text-right">手續費</th>
                  <th className="px-3 py-2 text-right">稅</th>
                  <th className="px-3 py-2 text-right">調整後比重</th>
                </tr>
              </thead>
              <tbody>
                {result.actions.map((a) => {
                  const displayShares = (shares: number) => {
                    const lots = Math.floor(shares / 1000)
                    const remaining = shares % 1000
                    if (lots === 0 && remaining === 0) return '0股'
                    if (lots === 0) return `${remaining}股`
                    if (remaining === 0) return `${lots}張`
                    return `${lots}張${remaining}股`
                  }

                  return (
                    <tr key={a.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-mono font-bold">{a.code}</div>
                        <div className="text-xs text-slate-400">{a.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {a.price > 0 ? `$${a.price.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {displayShares(a.currentShares)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{a.currentWeight.toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right font-mono">{a.targetWeight}%</td>
                      <td className="px-3 py-2 text-center">
                        {a.action === 'buy' && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">
                            買入
                          </span>
                        )}
                        {a.action === 'sell' && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-red-100 text-red-700">
                            賣出
                          </span>
                        )}
                        {a.action === 'hold' && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-500">
                            持有
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${
                        a.action === 'buy' ? 'text-green-600' : a.action === 'sell' ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {a.sharesChange === 0 ? '—' : (
                          <>
                            {a.action === 'buy' ? '+' : ''}{displayShares(Math.abs(a.sharesChange))}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {a.estimatedAmount > 0 ? `$${formatMoney(a.estimatedAmount)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">
                        {a.fee > 0 ? `$${a.fee}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-500">
                        {a.tax > 0 ? `$${a.tax}` : '—'}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${
                        Math.abs(a.weightDeviation) < 1 ? 'text-green-600' : 'text-[#4A90C4]'
                      }`}>
                        {a.newWeight.toFixed(1)}%
                        {Math.abs(a.weightDeviation) >= 0.1 && (
                          <span className="text-xs text-slate-400 ml-1">
                            ({a.weightDeviation >= 0 ? '+' : ''}{a.weightDeviation.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result && result.actions.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          請先設定目標權重並輸入持倉資料
        </div>
      )}
    </div>
  )
}

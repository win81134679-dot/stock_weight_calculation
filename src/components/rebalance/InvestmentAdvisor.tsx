'use client'

/**
 * InvestmentAdvisor.tsx
 * Single-account deviation-correction investment advisor.
 * User picks an account and an investment amount → shows how to distribute.
 */

import React, { useState, useMemo } from 'react'
import { Account, Holding, PriceCache, TargetWeight } from '@/lib/types'
import { calcDeviationInvestment } from '@/lib/rebalance-calculator'
import { formatMoney } from '@/lib/calculator'
import { accountColorStyle } from './AccountManager'
import InjectionScenarioChart from './InjectionScenarioChart'

interface Props {
  accounts: Account[]
  holdings: Holding[]
  prices: Record<string, PriceCache>
  targetWeights: TargetWeight[]
  discount: number
}

const QUICK_AMOUNTS = [10000, 12000, 15000, 20000, 30000, 50000]

export default function InvestmentAdvisor({
  accounts,
  holdings,
  prices,
  targetWeights,
  discount,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id ?? '')
  const [investAmount, setInvestAmount] = useState<number>(10000)
  const [inputStr, setInputStr] = useState<string>('10000')

  const result = useMemo(() => {
    if (!selectedAccountId || investAmount <= 0 || targetWeights.length === 0) return null
    return calcDeviationInvestment(
      selectedAccountId, holdings, prices, targetWeights, investAmount, discount
    )
  }, [selectedAccountId, holdings, prices, targetWeights, investAmount, discount])

  function handleAmountInput(raw: string) {
    setInputStr(raw)
    const n = parseFloat(raw.replace(/,/g, ''))
    if (!isNaN(n) && n > 0) setInvestAmount(n)
  }

  function handleQuick(amount: number) {
    setInvestAmount(amount)
    setInputStr(amount.toString())
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        請先至「持倉管理」建立帳戶並輸入持倉
      </div>
    )
  }

  const account = accounts.find((a) => a.id === selectedAccountId)
  const style = account ? accountColorStyle(account.color) : accountColorStyle('blue')

  // Current account total value for context
  const acctValue = holdings
    .filter((h) => h.accountId === selectedAccountId)
    .reduce((s, h) => s + h.shares * (prices[h.code]?.price ?? 0), 0)

  return (
    <div className="space-y-4">
      {/* Account selector */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">選擇投入帳戶</p>
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
      </div>

      {/* Amount input */}
      <div className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
        <p className="text-xs font-semibold text-slate-500 mb-3">本次投入金額（台幣）</p>
        <div className="flex gap-2 flex-wrap mb-3">
          {QUICK_AMOUNTS.map((amt) => (
            <button
              key={amt}
              onClick={() => handleQuick(amt)}
              className={`px-3 py-1.5 text-sm rounded-lg border font-mono transition-colors ${
                investAmount === amt
                  ? 'bg-[#2C5F8A] text-white border-[#2C5F8A]'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-[#4A90C4]'
              }`}
            >
              ${amt % 10000 === 0 ? (amt / 10000).toFixed(0) : (amt / 10000).toFixed(1)}萬
            </button>
          ))}
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-slate-500 text-sm">$</span>
          <input
            type="text"
            inputMode="numeric"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono"
            value={inputStr}
            onChange={(e) => handleAmountInput(e.target.value)}
            placeholder="自訂金額"
          />
          <span className="text-xs text-slate-400">元</span>
        </div>
      </div>

      {/* Results */}
      {result && result.results.length > 0 && (
        <>
          {/* Deviation correction explanation */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-700">
            <span className="font-semibold">偏差修正法：</span>
            將資金優先分配給偏離目標比重最多的標的，讓組合逐漸靠近目標配置。
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {result.results.map((r) => (
              <div key={r.code} className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-mono font-bold text-[#1A1A2A]">{r.code}</span>
                    <span className="ml-2 text-xs text-slate-400">{r.name}</span>
                  </div>
                  <div className={`text-xs px-2 py-0.5 rounded font-medium ${
                    r.deviation < -1 ? 'bg-blue-100 text-blue-700' :
                    r.deviation > 1 ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {r.deviation >= 0 ? '+' : ''}{r.deviation.toFixed(1)}%
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="text-slate-400">現價</div>
                  <div className="text-right font-mono">{r.price > 0 ? `$${r.price.toFixed(2)}` : '—'}</div>
                  <div className="text-slate-400">目前比重</div>
                  <div className="text-right font-mono">{r.currentWeight.toFixed(1)}% → 目標 {r.targetWeight}%</div>
                  <div className="text-slate-400">建議投入</div>
                  <div className="text-right font-mono font-semibold">${formatMoney(r.suggestedAmount)}</div>
                  <div className="text-slate-400">可買</div>
                  <div className="text-right font-mono font-semibold text-[#2C5F8A]">{r.displayShares}</div>
                  <div className="text-slate-400">實際花費</div>
                  <div className="text-right font-mono">${formatMoney(r.actualCost)}</div>
                  <div className="text-slate-400">買後比重</div>
                  <div className={`text-right font-mono font-semibold ${
                    Math.abs(r.newWeight - r.targetWeight) < 1 ? 'text-green-600' : 'text-[#4A90C4]'
                  }`}>
                    {r.newWeight.toFixed(1)}%
                  </div>
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
                  <th className="px-3 py-2 text-right">現價</th>
                  <th className="px-3 py-2 text-right">目前比重</th>
                  <th className="px-3 py-2 text-right">目標比重</th>
                  <th className="px-3 py-2 text-right">偏差</th>
                  <th className="px-3 py-2 text-right">建議投入</th>
                  <th className="px-3 py-2 text-right">可買</th>
                  <th className="px-3 py-2 text-right">手續費</th>
                  <th className="px-3 py-2 text-right">實際花費</th>
                  <th className="px-3 py-2 text-right">買後比重</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold">{r.code}</div>
                      <div className="text-xs text-slate-400">{r.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {r.price > 0 ? `$${r.price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.currentWeight.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right font-mono">{r.targetWeight}%</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${
                      r.deviation < -1 ? 'text-blue-600' : r.deviation > 1 ? 'text-red-500' : 'text-slate-400'
                    }`}>
                      {r.deviation >= 0 ? '+' : ''}{r.deviation.toFixed(1)}%
                    </td>
                    <td className="px-3 py-2 text-right font-mono">${formatMoney(r.suggestedAmount)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold text-[#2C5F8A]">{r.displayShares}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500">${r.buyFee}</td>
                    <td className="px-3 py-2 text-right font-mono">${formatMoney(r.actualCost)}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${
                      Math.abs(r.newWeight - r.targetWeight) < 1 ? 'text-green-600' : 'text-[#4A90C4]'
                    }`}>
                      {r.newWeight.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '投入金額', value: `$${formatMoney(result.investAmount)}` },
              { label: '實際花費', value: `$${formatMoney(result.totalAllocated)}`, color: 'text-[#2C5F8A]' },
              { label: '剩餘現金', value: `$${formatMoney(result.remainingCash)}`, color: result.remainingCash < 0 ? 'text-red-500' : 'text-green-600' },
            ].map((c) => (
              <div key={c.label} className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                <p className="text-xs text-slate-400 mb-1">{c.label}</p>
                <p className={`font-bold font-mono text-base ${c.color ?? 'text-[#1A1A2A]'}`}>{c.value}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {result && result.results.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          請先設定目標權重並輸入持倉資料
        </div>
      )}

      {/* 資金投入情境模擬：對應本次投入金額 */}
      <InjectionScenarioChart
        holdings={holdings.filter((h) => h.accountId === selectedAccountId)}
        prices={prices}
        injectionAmount={investAmount}
      />
    </div>
  )
}

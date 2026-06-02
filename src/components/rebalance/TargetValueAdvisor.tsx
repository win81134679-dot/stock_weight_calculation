'use client'

/**
 * TargetValueAdvisor.tsx
 * 目標總市值配置：含換倉賣出、滑價保護、持倉對比、交割款明細
 */

import React, { useState, useMemo } from 'react'
import { Account, Holding, PriceCache, AllocationConfig, SellEntry } from '@/lib/types'
import { calcTargetValueRebalance, calcEstimatedSellProceeds } from '@/lib/target-value-rebalance'
import { formatMoney } from '@/lib/calculator'
import { accountColorStyle } from './AccountManager'
import { resolveAccountConfig } from '@/lib/portfolio-store'
import { exportTargetValuePlanToPDF } from '@/lib/pdf-export'

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
  const [externalFund, setExternalFund] = useState<number>(0)
  const [externalInputStr, setExternalInputStr] = useState<string>('0')
  const [slippageRate, setSlippageRate] = useState<number>(0.03) // 預設 3%

  // 換倉賣出：{ code: { shares, actualProceeds } }
  const [sellInputs, setSellInputs] = useState<Record<string, { shares: string; actualProceeds: string }>>({})

  const account = accounts.find((a) => a.id === selectedAccountId)
  const targetWeights = account ? resolveAccountConfig(account, allocationConfigs).targetWeights : []
  const configName = account ? resolveAccountConfig(account, allocationConfigs).name : ''

  // Current account holdings
  const acctHoldings = holdings.filter((h) => h.accountId === selectedAccountId)
  const acctValue = acctHoldings.reduce((s, h) => s + h.shares * (prices[h.code]?.price ?? 0), 0)

  // 建立 SellEntry 陣列
  const sellEntries: SellEntry[] = useMemo(() => {
    return acctHoldings.map(h => {
      const input = sellInputs[h.code]
      const shares = parseFloat(input?.shares || '0')
      const actualProceeds = parseFloat(input?.actualProceeds || '0')

      // 計算預估收入
      const estimatedProceeds = shares > 0
        ? calcEstimatedSellProceeds(shares, prices[h.code]?.price ?? 0, discount, h.isETF)
        : 0

      return {
        code: h.code,
        shares: shares || 0,
        actualProceeds: actualProceeds || 0,
        estimatedProceeds,
      }
    }).filter(e => e.shares > 0 || e.actualProceeds > 0) // 只保留有輸入的
  }, [acctHoldings, sellInputs, prices, discount])

  const result = useMemo(() => {
    if (!selectedAccountId || targetWeights.length === 0 || targetTotalValue <= 0) return null
    return calcTargetValueRebalance(
      selectedAccountId,
      holdings,
      prices,
      targetWeights,
      targetTotalValue,
      sellEntries,
      externalFund,
      slippageRate,
      discount
    )
  }, [selectedAccountId, holdings, prices, targetWeights, targetTotalValue, sellEntries, externalFund, slippageRate, discount])

  function handleTargetInput(raw: string) {
    setTargetInputStr(raw)
    const n = parseFloat(raw.replace(/,/g, ''))
    if (!isNaN(n) && n >= 0) setTargetTotalValue(n)
  }

  function handleExternalInput(raw: string) {
    setExternalInputStr(raw)
    const n = parseFloat(raw.replace(/,/g, ''))
    if (!isNaN(n)) setExternalFund(n)
  }

  function handleQuick(amount: number) {
    setTargetTotalValue(amount)
    setTargetInputStr(amount.toString())
  }

  function handleSellSharesInput(code: string, value: string) {
    setSellInputs(prev => ({
      ...prev,
      [code]: { ...prev[code], shares: value }
    }))
  }

  function handleSellProceedsInput(code: string, value: string) {
    setSellInputs(prev => ({
      ...prev,
      [code]: { ...prev[code], actualProceeds: value }
    }))
  }

  const displayShares = (shares: number) => {
    const lots = Math.floor(shares / 1000)
    const remaining = shares % 1000
    if (lots === 0 && remaining === 0) return '0股'
    if (lots === 0) return `${remaining}股`
    if (remaining === 0) return `${lots}張`
    return `${lots}張${remaining}股`
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-10 text-slate-400 text-sm">
        請先至「持倉管理」建立帳戶並輸入持倉
      </div>
    )
  }

  const style = account ? accountColorStyle(account.color) : accountColorStyle('blue')

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

      {/* Target Total Value Input */}
      <div className={`rounded-xl border p-4 space-y-3 ${style.bg} ${style.border}`}>
        <p className="text-xs font-semibold text-slate-500">目標總市值（台幣）</p>
        <div className="flex gap-2 flex-wrap">
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

      {/* 換倉賣出清單 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
          🔄 換倉賣出清單
        </p>
        <p className="text-xs text-slate-400 mb-3">
          請輸入實際成交後的淨收入（已扣手續費與稅），避免滑價風險
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2 text-left">代碼</th>
                <th className="px-3 py-2 text-right">持股</th>
                <th className="px-3 py-2 text-right">現價</th>
                <th className="px-3 py-2 text-right">賣出股數</th>
                <th className="px-3 py-2 text-right">實際淨收入</th>
                <th className="px-3 py-2 text-right">預估參考</th>
              </tr>
            </thead>
            <tbody>
              {acctHoldings.map((h) => {
                const price = prices[h.code]?.price ?? 0
                const input = sellInputs[h.code]
                const sellShares = parseFloat(input?.shares || '0')
                const estimated = sellShares > 0
                  ? calcEstimatedSellProceeds(sellShares, price, discount, h.isETF)
                  : 0

                return (
                  <tr key={h.code} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-mono font-bold">{h.code}</div>
                      <div className="text-xs text-slate-400">{h.name}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-600">
                      {displayShares(h.shares)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {price > 0 ? `$${price.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        max={h.shares}
                        placeholder="0"
                        className="w-24 border border-slate-200 rounded px-2 py-1 text-sm text-right font-mono"
                        value={input?.shares || ''}
                        onChange={(e) => handleSellSharesInput(h.code, e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        className="w-32 border border-slate-200 rounded px-2 py-1 text-sm text-right font-mono"
                        value={input?.actualProceeds || ''}
                        onChange={(e) => handleSellProceedsInput(h.code, e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400 text-xs">
                      {estimated > 0 ? `≈ $${formatMoney(estimated)}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {sellEntries.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex justify-end">
            <div className="text-sm">
              <span className="text-slate-500">賣出總淨收入：</span>
              <span className="font-mono font-bold text-green-600 ml-2">
                ${formatMoney(sellEntries.reduce((s, e) => s + e.actualProceeds, 0))}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* External Fund & Slippage Protection */}
      <div className="grid grid-cols-2 gap-4">
        {/* External Fund */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">
            💰 外部投入金額（選填）
          </p>
          <div className="flex gap-2 items-center">
            <span className="text-slate-500 text-sm">$</span>
            <input
              type="text"
              inputMode="numeric"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white font-mono"
              value={externalInputStr}
              onChange={(e) => handleExternalInput(e.target.value)}
              placeholder="0（額外投入資金）"
            />
            <span className="text-xs text-slate-400">元</span>
          </div>
        </div>

        {/* Slippage Protection */}
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-semibold text-slate-500 mb-2">
            🛡️ 滑價保護（僅買入）
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={slippageRate * 100}
              onChange={(e) => setSlippageRate(parseFloat(e.target.value) / 100)}
              className="flex-1"
            />
            <span className="font-mono font-bold text-[#2C5F8A] text-lg min-w-[4rem] text-right">
              {(slippageRate * 100).toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            預留緩衝，避免實際成交價高於預期導致超買
          </p>
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
            依目標總市值 ${formatMoney(targetTotalValue)} 與目標權重，在滑價保護 {(slippageRate * 100).toFixed(1)}% 下計算買入建議，確保不超買。
          </div>

          {/* Fund Summary */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-600 mb-1">賣出收入</div>
              <div className="text-xl font-bold font-mono text-green-700">
                ${formatMoney(result.totalSellProceeds)}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-600 mb-1">外部投入</div>
              <div className="text-xl font-bold font-mono text-blue-700">
                ${formatMoney(result.externalFund)}
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-600 mb-1">可用資金</div>
              <div className="text-xl font-bold font-mono text-[#2C5F8A]">
                ${formatMoney(result.availableFund)}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
              <div className="text-xs text-blue-600 mb-1">保護後可用</div>
              <div className="text-xl font-bold font-mono text-blue-700">
                ${formatMoney(result.protectedFund)}
              </div>
            </div>
          </div>

          {/* Buy Actions Table */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              📋 買入建議清單
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">代碼</th>
                    <th className="px-3 py-2 text-right">現價</th>
                    <th className="px-3 py-2 text-right">目前持股</th>
                    <th className="px-3 py-2 text-right">目標權重</th>
                    <th className="px-3 py-2 text-center">操作</th>
                    <th className="px-3 py-2 text-right">股數變化</th>
                    <th className="px-3 py-2 text-right">金額</th>
                    <th className="px-3 py-2 text-right">手續費</th>
                    <th className="px-3 py-2 text-right">調整後持股</th>
                  </tr>
                </thead>
                <tbody>
                  {result.actions.map((a) => (
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
                      <td className="px-3 py-2 text-right font-mono">{a.targetWeight}%</td>
                      <td className="px-3 py-2 text-center">
                        {a.action === 'buy' && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-green-100 text-green-700">
                            買入
                          </span>
                        )}
                        {a.action === 'hold' && (
                          <span className="inline-block px-2 py-1 text-xs font-semibold rounded bg-slate-100 text-slate-500">
                            持有
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${
                        a.action === 'buy' ? 'text-green-600' : 'text-slate-400'
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
                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#2C5F8A]">
                        {displayShares(a.newShares)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Holding Comparison */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              📊 持倉對比（調倉前後）
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">代碼</th>
                    <th className="px-3 py-2 text-right">調倉前持股</th>
                    <th className="px-3 py-2 text-right">調倉前市值</th>
                    <th className="px-3 py-2 text-right">調倉後持股</th>
                    <th className="px-3 py-2 text-right">調倉後市值</th>
                    <th className="px-3 py-2 text-right">市值變化</th>
                  </tr>
                </thead>
                <tbody>
                  {result.holdingComparisons.map((hc) => (
                    <tr key={hc.code} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="font-mono font-bold">{hc.code}</div>
                        <div className="text-xs text-slate-400">{hc.name}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-600">
                        {displayShares(hc.beforeShares)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        ${formatMoney(hc.beforeValue)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">
                        {displayShares(hc.afterShares)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#2C5F8A]">
                        ${formatMoney(hc.afterValue)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${
                        hc.valueChange > 0 ? 'text-green-600' : hc.valueChange < 0 ? 'text-red-600' : 'text-slate-400'
                      }`}>
                        {hc.valueChange === 0 ? '—' : (
                          <>
                            {hc.valueChange > 0 ? '+' : ''}${formatMoney(hc.valueChange)}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Settlement Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">💵 交割款明細（T+2）</p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">應付款（買入）</div>
                <div className="text-2xl font-bold font-mono text-red-600">
                  ${formatMoney(result.totalBuyCost)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">應收款（賣出）</div>
                <div className="text-2xl font-bold font-mono text-green-600">
                  ${formatMoney(result.totalSellReturn)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">淨交割款</div>
                <div className={`text-2xl font-bold font-mono ${
                  result.netCashFlow > 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {result.netCashFlow > 0 ? '+' : ''}${formatMoney(result.netCashFlow)}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {result.netCashFlow > 0
                    ? `需額外投入 $${formatMoney(result.netCashFlow)}`
                    : result.netCashFlow < 0
                    ? `剩餘 $${formatMoney(Math.abs(result.netCashFlow))}`
                    : '收支平衡'
                  }
                </div>
              </div>
            </div>
          </div>

          {/* After Adjustment Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
              📈 調整後預估
            </p>
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

          {/* Export PDF Button */}
          <div className="flex justify-end">
            <button
              onClick={() => exportTargetValuePlanToPDF(result, account?.name || 'Unknown')}
              className="px-4 py-2 bg-[#2C5F8A] text-white rounded-lg text-sm font-medium hover:bg-[#1e4a6a] transition-colors"
            >
              📄 匯出 PDF（A4）
            </button>
          </div>
        </>
      )}

      {!result && targetTotalValue > 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">
          請設定目標權重並輸入持倉資料
        </div>
      )}
    </div>
  )
}

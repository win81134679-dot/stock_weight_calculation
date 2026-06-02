'use client'

/**
 * TargetValueAdvisor.tsx
 * 目標總市值配置：系統先計算賣出建議 → 使用者回填實際成交 → 計算買入建議
 */

import React, { useState, useMemo } from 'react'
import { Account, Holding, PriceCache, AllocationConfig, SellEntry } from '@/lib/types'
import { calcTargetValueRebalance, calcSellSuggestions } from '@/lib/target-value-rebalance'
import { formatMoney } from '@/lib/calculator'
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

  // 實際賣出回填：{ code: { actualShares, actualProceeds } }
  const [actualSells, setActualSells] = useState<Record<string, { actualShares: string; actualProceeds: string }>>({})

  const account = accounts.find((a) => a.id === selectedAccountId)
  const targetWeights = account ? resolveAccountConfig(account, allocationConfigs).targetWeights : []
  const configName = account ? resolveAccountConfig(account, allocationConfigs).name : ''

  // Step 1: 計算賣出建議（系統自動）
  const sellSuggestions = useMemo(() => {
    if (!selectedAccountId || targetWeights.length === 0 || targetTotalValue <= 0) return []
    return calcSellSuggestions(
      selectedAccountId,
      holdings,
      prices,
      targetWeights,
      targetTotalValue,
      discount
    )
  }, [selectedAccountId, holdings, prices, targetWeights, targetTotalValue, discount])

  // Step 2: 合併賣出建議 + 使用者實際回填
  const sellEntries: SellEntry[] = useMemo(() => {
    return sellSuggestions.map(sug => {
      const actual = actualSells[sug.code]
      const actualShares = actual?.actualShares ? parseFloat(actual.actualShares) : undefined
      const actualProceeds = actual?.actualProceeds ? parseFloat(actual.actualProceeds) : undefined

      return {
        ...sug,
        actualShares,
        actualProceeds,
      }
    })
  }, [sellSuggestions, actualSells])

  // Step 3: 計算買入建議（基於實際賣出收入）
  const result = useMemo(() => {
    if (!selectedAccountId || targetWeights.length === 0 || targetTotalValue <= 0) return null

    // 只有當有實際回填時才計算
    const hasActualSells = sellEntries.some(e => e.actualProceeds !== undefined && e.actualShares !== undefined)
    if (!hasActualSells && sellSuggestions.length > 0) return null

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
  }, [selectedAccountId, holdings, prices, targetWeights, targetTotalValue, sellEntries, externalFund, slippageRate, discount, sellSuggestions.length])

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
    setTargetInputStr(formatMoney(amount))
  }

  function handleActualSellInput(code: string, field: 'actualShares' | 'actualProceeds', value: string) {
    setActualSells(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: value,
      }
    }))
  }

  function handleExportPDF() {
    if (!result || !account) return
    exportTargetValuePlanToPDF(result, account.name)
  }

  if (!account) {
    return <div className="text-slate-500">請先建立帳戶</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-800">目標總市值配置</h2>
      </div>

      {/* Account Selector */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">選擇帳戶</label>
        <select
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
          className="block w-full px-3 py-2 border border-slate-300 rounded-lg"
        >
          {accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} — 目前市值 NT${formatMoney(
                holdings
                  .filter((h) => h.accountId === acc.id)
                  .reduce((s, h) => s + h.shares * (prices[h.code]?.price ?? 0), 0)
              )}
            </option>
          ))}
        </select>
        <div className="mt-1 text-sm text-slate-500">
          使用配置：{configName}
        </div>
      </div>

      {/* Target Total Value Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          目標總市值（含未實現損益）
        </label>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-slate-700 font-medium">NT$</span>
          <input
            type="text"
            value={targetInputStr}
            onChange={(e) => handleTargetInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="0"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {QUICK_TARGET_VALUES.map((val) => (
            <button
              key={val}
              onClick={() => handleQuick(val)}
              className="px-3 py-1 text-sm border border-slate-300 rounded-md hover:bg-slate-50"
            >
              NT${formatMoney(val)}
            </button>
          ))}
        </div>
      </div>

      {/* Sell Suggestions Table */}
      {sellSuggestions.length > 0 && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
            <h3 className="font-semibold text-slate-800">📊 配置標的檢視與換倉建議</h3>
            <p className="text-sm text-slate-600 mt-1">
              顯示所有配置標的目前狀態。需要賣出的標的請執行賣出後，回填「實際成交股數」與「實際淨收入」。
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">代碼</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">名稱</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-slate-700">建議操作</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">目前持股</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">目前權重</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">目標權重</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 bg-amber-50">
                    建議賣出股數
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 bg-amber-50">
                    預估淨收入
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 bg-blue-50">
                    實際賣出股數
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-slate-700 bg-blue-50">
                    實際淨收入
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {sellSuggestions.map((sug) => {
                  // 判斷操作類型
                  const isOutOfConfig = sug.targetWeight === 0  // 不在配置內
                  const isSell = sug.suggestedShares > 0
                  const isHold = !isSell && sug.currentShares > 0

                  let actionLabel = '買入'
                  let actionColor = 'bg-green-100 text-green-700'

                  if (isOutOfConfig) {
                    actionLabel = '清倉'
                    actionColor = 'bg-purple-100 text-purple-700'
                  } else if (isSell) {
                    actionLabel = '賣出'
                    actionColor = 'bg-red-100 text-red-700'
                  } else if (isHold) {
                    actionLabel = '持有'
                    actionColor = 'bg-slate-100 text-slate-600'
                  }

                  return (
                    <tr key={sug.code} className={`hover:bg-slate-50 ${isOutOfConfig ? 'bg-purple-50' : ''}`}>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{sug.code}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{sug.name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${actionColor}`}>
                          {actionLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{sug.currentShares}股</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{sug.currentWeight.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">
                        {isOutOfConfig ? (
                          <span className="text-purple-600 font-semibold">0% (不在配置)</span>
                        ) : (
                          `${sug.targetWeight.toFixed(1)}%`
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold bg-amber-50">
                        {sug.suggestedShares > 0 ? (
                          <span className="text-red-700">{sug.suggestedShares}股</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold bg-amber-50">
                        {sug.estimatedProceeds > 0 ? (
                          <span className="text-red-700">NT${formatMoney(sug.estimatedProceeds)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 bg-blue-50">
                        {sug.suggestedShares > 0 ? (
                          <input
                            type="number"
                            placeholder={sug.suggestedShares.toString()}
                            value={actualSells[sug.code]?.actualShares || ''}
                            onChange={(e) => handleActualSellInput(sug.code, 'actualShares', e.target.value)}
                            className="w-full px-2 py-1 text-sm text-right border border-blue-300 rounded"
                          />
                        ) : (
                          <span className="text-sm text-slate-400 block text-right">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 bg-blue-50">
                        {sug.suggestedShares > 0 ? (
                          <input
                            type="number"
                            placeholder={sug.estimatedProceeds.toString()}
                            value={actualSells[sug.code]?.actualProceeds || ''}
                            onChange={(e) => handleActualSellInput(sug.code, 'actualProceeds', e.target.value)}
                            className="w-full px-2 py-1 text-sm text-right border border-blue-300 rounded"
                          />
                        ) : (
                          <span className="text-sm text-slate-400 block text-right">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* External Fund Input */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          額外投入金額（可選）
        </label>
        <div className="flex items-center gap-2">
          <span className="text-slate-700 font-medium">NT$</span>
          <input
            type="text"
            value={externalInputStr}
            onChange={(e) => handleExternalInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg"
            placeholder="0"
          />
        </div>
      </div>

      {/* Slippage Protection */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          滑價保護（買入預留緩衝）
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max="10"
            step="0.1"
            value={slippageRate * 100}
            onChange={(e) => setSlippageRate(parseFloat(e.target.value) / 100)}
            className="flex-1"
          />
          <span className="text-lg font-semibold text-[#2C5F8A] w-16 text-right">
            {(slippageRate * 100).toFixed(1)}%
          </span>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          買入時保留資金應付滑價風險，避免違約交割。預設 3%。
        </p>
      </div>

      {/* Buy Actions */}
      {result && (
        <>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">📈 買入建議（基於實際賣出收入）</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">代碼</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">名稱</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">操作</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">股數變化</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">金額</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">手續費</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">總成本</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">調整後權重</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {result.actions
                    .filter(a => a.action !== 'hold')
                    .map((action) => (
                      <tr key={action.code} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm font-medium text-slate-800">{action.code}</td>
                        <td className="px-4 py-3 text-sm text-slate-700">{action.name}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className={`px-2 py-1 rounded text-xs font-semibold ${
                            action.action === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {action.action === 'buy' ? '買入' : '賣出'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-slate-800">
                          {action.sharesChange > 0 ? '+' : ''}{action.sharesChange}股
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">
                          NT${formatMoney(action.estimatedAmount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-600">
                          NT${formatMoney(action.fee)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-slate-800">
                          NT${formatMoney(action.totalCost)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-slate-700">
                          {action.newWeight.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Holding Comparison */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">📊 持倉對比（調整前後）</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">代碼</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-slate-700">名稱</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">調整前持股</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">調整前權重</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">調整後持股</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">調整後權重</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-slate-700">變化</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {result.holdingComparisons.map((hc) => (
                    <tr key={hc.code} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">{hc.code}</td>
                      <td className="px-4 py-3 text-sm text-slate-700">{hc.name}</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{hc.beforeShares}股</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{hc.beforeWeight.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{hc.afterShares}股</td>
                      <td className="px-4 py-3 text-sm text-right text-slate-700">{hc.afterWeight.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold">
                        <span className={hc.sharesChange > 0 ? 'text-green-600' : hc.sharesChange < 0 ? 'text-red-600' : 'text-slate-500'}>
                          {hc.sharesChange > 0 ? '+' : ''}{hc.sharesChange}股
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Settlement Summary */}
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-800">💰 交割款明細（T+2）</h3>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">買入應付款：</span>
                <span className="font-semibold text-slate-800">NT${formatMoney(result.totalBuyCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">賣出應收款：</span>
                <span className="font-semibold text-slate-800">NT${formatMoney(result.totalSellReturn)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                <span className="text-slate-700 font-medium">淨交割款：</span>
                <span className={`font-bold text-lg ${
                  result.netCashFlow > 0 ? 'text-red-600' : result.netCashFlow < 0 ? 'text-green-600' : 'text-slate-600'
                }`}>
                  {result.netCashFlow > 0 ? '需支付' : result.netCashFlow < 0 ? '回收' : ''}
                  {' '}NT${formatMoney(Math.abs(result.netCashFlow))}
                </span>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 text-lg">⚠️</span>
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-800 mb-2">警示</h4>
                  <ul className="space-y-1 text-sm text-amber-700">
                    {result.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Export PDF Button */}
          <div className="flex justify-end">
            <button
              onClick={handleExportPDF}
              className="px-4 py-2 bg-[#2C5F8A] text-white rounded-lg hover:bg-[#234B6E] transition-colors"
            >
              📄 匯出 PDF
            </button>
          </div>
        </>
      )}

      {/* No Result Hint */}
      {sellSuggestions.length > 0 && !result && (
        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 text-lg">ℹ️</span>
            <div className="flex-1 text-sm text-blue-700">
              請在上方「換倉賣出建議」表格中，回填「實際賣出股數」與「實際淨收入」後，系統將計算買入建議。
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

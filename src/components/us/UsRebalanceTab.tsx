'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useUsPortfolioStore } from '@/hooks/useUsPortfolioStore'
import { useUsCurrentPrices } from '@/hooks/useUsCurrentPrices'
import { formatTwd, formatUsd } from '@/lib/us-calculator'
import {
  calcUsAccountSummary,
  calcUsDeviationInvestment,
  calcUsNextRebalanceDate,
  calcUsQuarterlyRebalance,
  findEarliestBuyDate,
  resolveUsAccountConfig,
} from '@/lib/us-rebalance-calculator'
import { UsCustomFeeSettings, UsFeeProfileId, UsHolding } from '@/lib/us-types'

type SubTab = 'overview' | 'holdings' | 'invest' | 'rebalance' | 'settings'

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview', label: '總覽' },
  { id: 'holdings', label: '資料管理' },
  { id: 'invest', label: '資金投入' },
  { id: 'rebalance', label: '再平衡' },
  { id: 'settings', label: '設定' },
]

async function fetchSymbolMeta(symbol: string) {
  const res = await fetch(`/api/us-stock-price?symbols=${encodeURIComponent(symbol.trim().toUpperCase())}`)
  const data = await res.json() as { stocks?: Array<{ symbol: string; name: string; exchange: UsHolding['exchange']; isETF: boolean }>; error?: string }
  if (!res.ok || !data.stocks?.[0]) {
    throw new Error(data.error ?? '找不到代碼')
  }
  return data.stocks[0]
}

export default function UsRebalanceTab() {
  const [activeTab, setActiveTab] = useState<SubTab>('overview')
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountBroker, setNewAccountBroker] = useState('')
  const [selectedConfigId, setSelectedConfigId] = useState('')
  const [configName, setConfigName] = useState('')
  const [configDescription, setConfigDescription] = useState('')
  const [configInterval, setConfigInterval] = useState(3)
  const [configDay, setConfigDay] = useState(1)
  const [newWeightSymbol, setNewWeightSymbol] = useState('')
  const [newWeightValue, setNewWeightValue] = useState('')
  const [holdingSymbol, setHoldingSymbol] = useState('')
  const [holdingShares, setHoldingShares] = useState('')
  const [holdingAvgCostUsd, setHoldingAvgCostUsd] = useState('')
  const [txSymbol, setTxSymbol] = useState('')
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0])
  const [txType, setTxType] = useState<'buy' | 'sell'>('buy')
  const [txShares, setTxShares] = useState('')
  const [txPriceUsd, setTxPriceUsd] = useState('')
  const [txFeeUsd, setTxFeeUsd] = useState('')
  const [investAmountTwd, setInvestAmountTwd] = useState(100000)
  const [manualDividendSymbol, setManualDividendSymbol] = useState('')
  const [manualDividendDate, setManualDividendDate] = useState(new Date().toISOString().split('T')[0])
  const [manualDividendCash, setManualDividendCash] = useState('')
  const [importExportJson, setImportExportJson] = useState('')

  const {
    store,
    mounted,
    addAccount,
    updateAccount,
    deleteAccount,
    upsertHolding,
    deleteHolding,
    addTransaction,
    deleteTransaction,
    addAllocationConfig,
    updateAllocationConfig,
    deleteAllocationConfig,
    duplicateAllocationConfig,
    setAccountAllocationConfig,
    addDividend,
    deleteDividend,
    bulkUpsertDividends,
    setDividendEntryDate,
    updateSettings,
    exportJSON,
    importJSON,
  } = useUsPortfolioStore()

  const { prices, fxRate, loading, error, fetchPrices, refreshPrices, startAutoRefresh, stopAutoRefresh, secondsUntilRefresh, isMarketOpen } = useUsCurrentPrices()

  useEffect(() => {
    if (!selectedAccountId && store.accounts[0]) {
      setSelectedAccountId(store.accounts[0].id)
    }
    if (!selectedConfigId && store.allocationConfigs[0]) {
      setSelectedConfigId(store.allocationConfigs[0].id)
    }
  }, [selectedAccountId, selectedConfigId, store.accounts, store.allocationConfigs])

  const trackedSymbols = useMemo(() => Array.from(new Set([
    ...store.holdings.map((holding) => holding.symbol),
    ...store.allocationConfigs.flatMap((config) => config.targetWeights.map((target) => target.symbol)),
  ])), [store.allocationConfigs, store.holdings])

  useEffect(() => {
    if (trackedSymbols.length > 0) {
      void fetchPrices(trackedSymbols)
      startAutoRefresh(trackedSymbols)
    }
    return () => stopAutoRefresh()
  }, [fetchPrices, startAutoRefresh, stopAutoRefresh, trackedSymbols])

  const selectedAccount = store.accounts.find((account) => account.id === selectedAccountId)
  const resolvedConfig = selectedAccount
    ? resolveUsAccountConfig(selectedAccount.id, store.allocationConfigs, store.accounts)
    : store.allocationConfigs[0]
  const selectedConfig = store.allocationConfigs.find((config) => config.id === selectedConfigId) ?? store.allocationConfigs[0]

  useEffect(() => {
    if (!selectedConfig) return
    setConfigName(selectedConfig.name)
    setConfigDescription(selectedConfig.description ?? '')
    setConfigInterval(selectedConfig.rebalanceIntervalMonths)
    setConfigDay(selectedConfig.rebalanceDayOfMonth)
  }, [selectedConfig])

  const accountSummaries = useMemo(() => store.accounts.map((account) =>
    calcUsAccountSummary(
      account.id,
      account.name,
      store.holdings,
      prices,
      resolveUsAccountConfig(account.id, store.allocationConfigs, store.accounts).targetWeights,
    ),
  ), [prices, store.accounts, store.allocationConfigs, store.holdings])

  const selectedSummary = accountSummaries.find((summary) => summary.accountId === selectedAccountId)
  const deviationSummary = useMemo(() => {
    if (!selectedAccount || !(fxRate > 0) || !resolvedConfig) return null
    return calcUsDeviationInvestment(
      selectedAccount.id,
      store.holdings,
      prices,
      resolvedConfig.targetWeights,
      investAmountTwd,
      fxRate,
      store.settings.profileId,
      store.settings.customFees,
    )
  }, [fxRate, investAmountTwd, prices, resolvedConfig, selectedAccount, store.holdings, store.settings.customFees, store.settings.profileId])

  const rebalancePlan = useMemo(() => {
    if (!selectedAccount || !(fxRate > 0) || !resolvedConfig) return null
    return calcUsQuarterlyRebalance(
      selectedAccount.id,
      store.holdings,
      prices,
      resolvedConfig.targetWeights,
      fxRate,
      store.settings.profileId,
      store.settings.customFees,
    )
  }, [fxRate, prices, resolvedConfig, selectedAccount, store.holdings, store.settings.customFees, store.settings.profileId])

  const saveConfigDetails = useCallback(() => {
    if (!selectedConfig) return
    updateAllocationConfig(selectedConfig.id, {
      name: configName.trim() || selectedConfig.name,
      description: configDescription.trim() || undefined,
      rebalanceIntervalMonths: Math.max(1, configInterval),
      rebalanceDayOfMonth: Math.max(1, Math.min(28, configDay)),
      nextRebalanceDate: calcUsNextRebalanceDate(Math.max(1, configInterval), Math.max(1, Math.min(28, configDay))),
    })
  }, [configDay, configDescription, configInterval, configName, selectedConfig, updateAllocationConfig])

  const handleAddTargetWeight = useCallback(async () => {
    if (!selectedConfig) return
    const symbol = newWeightSymbol.trim().toUpperCase()
    const weight = parseFloat(newWeightValue)
    if (!symbol || !(weight > 0)) return
    if (selectedConfig.targetWeights.some((target) => target.symbol === symbol)) return
    const meta = await fetchSymbolMeta(symbol)
    updateAllocationConfig(selectedConfig.id, {
      targetWeights: [
        ...selectedConfig.targetWeights,
        {
          symbol: meta.symbol,
          name: meta.name,
          exchange: meta.exchange,
          isETF: meta.isETF,
          weight,
        },
      ],
    })
    setNewWeightSymbol('')
    setNewWeightValue('')
  }, [newWeightSymbol, newWeightValue, selectedConfig, updateAllocationConfig])

  const handleQuickHoldingSave = useCallback(async () => {
    if (!selectedAccountId) return
    const symbol = holdingSymbol.trim().toUpperCase()
    const shares = parseInt(holdingShares, 10)
    const avgCostUsd = parseFloat(holdingAvgCostUsd)
    if (!symbol || !(shares >= 0) || !(avgCostUsd >= 0)) return
    const meta = await fetchSymbolMeta(symbol)
    upsertHolding({
      accountId: selectedAccountId,
      symbol: meta.symbol,
      name: meta.name,
      exchange: meta.exchange,
      isETF: meta.isETF,
      shares,
      avgCostUsd,
    })
    setHoldingSymbol('')
    setHoldingShares('')
    setHoldingAvgCostUsd('')
    void refreshPrices([meta.symbol])
  }, [holdingAvgCostUsd, holdingShares, holdingSymbol, refreshPrices, selectedAccountId, upsertHolding])

  const handleAddTransaction = useCallback(async () => {
    if (!selectedAccountId) return
    const symbol = txSymbol.trim().toUpperCase()
    const shares = parseInt(txShares, 10)
    const priceUsd = parseFloat(txPriceUsd)
    const feeUsd = parseFloat(txFeeUsd) || 0
    if (!symbol || !(shares > 0) || !(priceUsd > 0)) return
    const meta = await fetchSymbolMeta(symbol)
    const existing = store.holdings.find((holding) => holding.accountId === selectedAccountId && holding.symbol === meta.symbol)
    if (!existing) {
      upsertHolding({
        accountId: selectedAccountId,
        symbol: meta.symbol,
        name: meta.name,
        exchange: meta.exchange,
        isETF: meta.isETF,
        shares: 0,
        avgCostUsd: 0,
      })
    }
    addTransaction({
      accountId: selectedAccountId,
      symbol: meta.symbol,
      date: txDate,
      type: txType,
      shares,
      priceUsd,
      feeUsd,
    })
    setTxSymbol('')
    setTxShares('')
    setTxPriceUsd('')
    setTxFeeUsd('')
    void refreshPrices([meta.symbol])
  }, [addTransaction, refreshPrices, selectedAccountId, store.holdings, txDate, txFeeUsd, txPriceUsd, txShares, txSymbol, txType, upsertHolding])

  const handleSyncDividend = useCallback(async (accountId: string, symbol: string) => {
    const holding = store.holdings.find((item) => item.accountId === accountId && item.symbol === symbol)
    if (!holding) return
    const res = await fetch(`/api/us-dividend?symbol=${encodeURIComponent(symbol)}`)
    const data = await res.json() as { records?: Array<{ exDate: string; cashPerShareUsd: number }> }
    const entryDate = store.dividendEntryDates[`${accountId}_${symbol}`] ?? findEarliestBuyDate(accountId, symbol, store.transactions)
    const records = (data.records ?? [])
      .filter((record) => record.exDate >= entryDate)
      .map((record) => ({
        accountId,
        symbol,
        exDate: record.exDate,
        cashPerShareUsd: record.cashPerShareUsd,
        shares: holding.shares,
        totalCashUsd: holding.shares * record.cashPerShareUsd,
        source: 'auto' as const,
      }))
    if (records.length > 0) {
      bulkUpsertDividends(records)
    }
  }, [bulkUpsertDividends, store.dividendEntryDates, store.holdings, store.transactions])

  const handleManualDividendAdd = useCallback(() => {
    if (!selectedAccountId) return
    const symbol = manualDividendSymbol.trim().toUpperCase()
    const cashPerShareUsd = parseFloat(manualDividendCash)
    const holding = store.holdings.find((item) => item.accountId === selectedAccountId && item.symbol === symbol)
    if (!symbol || !(cashPerShareUsd > 0) || !holding) return
    addDividend({
      accountId: selectedAccountId,
      symbol,
      exDate: manualDividendDate,
      cashPerShareUsd,
      shares: holding.shares,
      totalCashUsd: holding.shares * cashPerShareUsd,
      source: 'manual',
    })
    setManualDividendSymbol('')
    setManualDividendCash('')
  }, [addDividend, manualDividendCash, manualDividendDate, manualDividendSymbol, selectedAccountId, store.holdings])

  if (!mounted) {
    return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 bg-slate-100 rounded-xl p-1">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              activeTab === tab.id ? 'bg-white shadow text-[#2C5F8A]' : 'text-slate-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-400 px-1">
        <span>
          {loading ? '更新股價中…' : error ? `報價警示：${error}` : `USD/TWD ${fxRate > 0 ? fxRate.toFixed(3) : '—'} · ${isMarketOpen ? '美股盤中' : '非盤中或已收盤'}`}
        </span>
        <button
          onClick={() => void refreshPrices(trackedSymbols)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2C5F8A] text-white"
        >
          刷新股價 {secondsUntilRefresh > 0 ? `(${secondsUntilRefresh}s)` : ''}
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {accountSummaries.map((summary) => (
              <div key={summary.accountId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-[#1A1A2E]">{summary.accountName}</div>
                  <div className="text-xs text-slate-400">{summary.holdings.length} 檔</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <Metric label="市值 TWD" value={`NT$${formatTwd(summary.totalValueTwd)}`} />
                  <Metric label="市值 USD" value={`USD ${formatUsd(summary.totalValueUsd)}`} />
                  <Metric label="損益 TWD" value={`${summary.totalPnlTwd >= 0 ? '+' : '-'}NT$${formatTwd(Math.abs(summary.totalPnlTwd))}`} />
                  <Metric label="損益 %" value={`${summary.totalPnlPct >= 0 ? '+' : ''}${summary.totalPnlPct.toFixed(2)}%`} />
                </div>
              </div>
            ))}
          </div>

          {selectedSummary && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-[#1A1A2E]">{selectedSummary.accountName} 持倉明細</div>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-2 py-1.5"
                >
                  {store.accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
                      <th className="text-left py-2 px-2">股票</th>
                      <th className="text-right py-2 px-2">股數</th>
                      <th className="text-right py-2 px-2">均價 USD</th>
                      <th className="text-right py-2 px-2">現價 USD</th>
                      <th className="text-right py-2 px-2">市值 TWD</th>
                      <th className="text-right py-2 px-2">損益</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedSummary.holdings.map((holding) => (
                      <tr key={holding.symbol} className="border-b border-slate-100">
                        <td className="py-2 px-2">
                          <div className="font-medium">{holding.name}</div>
                          <div className="text-[11px] text-slate-400">{holding.symbol}</div>
                        </td>
                        <td className="text-right py-2 px-2">{holding.shares.toLocaleString()}</td>
                        <td className="text-right py-2 px-2 font-mono">USD {formatUsd(holding.avgCostUsd)}</td>
                        <td className="text-right py-2 px-2 font-mono">USD {formatUsd(holding.priceUsd)}</td>
                        <td className="text-right py-2 px-2 font-mono">NT${formatTwd(holding.valueTwd)}</td>
                        <td className={`text-right py-2 px-2 font-mono ${holding.pnlTwd >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {holding.pnlTwd >= 0 ? '+' : '-'}NT${formatTwd(Math.abs(holding.pnlTwd))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'holdings' && (
        <div className="space-y-4">
          <Section title="帳戶管理">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={newAccountName} onChange={(e) => setNewAccountName(e.target.value)} placeholder="帳戶名稱" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              <input value={newAccountBroker} onChange={(e) => setNewAccountBroker(e.target.value)} placeholder="券商（選填）" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              <button
                onClick={() => {
                  if (!newAccountName.trim()) return
                  addAccount(newAccountName.trim(), newAccountBroker.trim() || undefined)
                  setNewAccountName('')
                  setNewAccountBroker('')
                }}
                className="rounded-xl bg-[#2C5F8A] text-white text-sm font-semibold px-4 py-2.5"
              >
                新增帳戶
              </button>
            </div>
            <div className="space-y-2 mt-4">
              {store.accounts.map((account) => (
                <div key={account.id} className="flex flex-col md:flex-row md:items-center gap-2 rounded-xl border border-slate-200 p-3">
                  <div className="font-medium min-w-[120px]">{account.name}</div>
                  <input
                    value={account.broker ?? ''}
                    onChange={(e) => updateAccount(account.id, { broker: e.target.value })}
                    placeholder="券商"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={account.allocationConfigId ?? ''}
                    onChange={(e) => setAccountAllocationConfig(account.id, e.target.value || null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">預設配置</option>
                    {store.allocationConfigs.map((config) => (
                      <option key={config.id} value={config.id}>{config.name}</option>
                    ))}
                  </select>
                  <button onClick={() => deleteAccount(account.id)} className="text-sm text-red-500">刪除</button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="配置管理">
            <div className="flex flex-wrap gap-2 mb-3">
              <select
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {store.allocationConfigs.map((config) => (
                  <option key={config.id} value={config.id}>{config.name}</option>
                ))}
              </select>
              <button
                onClick={() => {
                  addAllocationConfig({
                    name: `新配置 ${store.allocationConfigs.length + 1}`,
                    description: '',
                    targetWeights: [],
                    rebalanceIntervalMonths: 3,
                    rebalanceDayOfMonth: 1,
                    nextRebalanceDate: calcUsNextRebalanceDate(3, 1),
                  })
                }}
                className="rounded-lg bg-slate-700 text-white text-sm px-3 py-2"
              >
                新增配置
              </button>
              {selectedConfig && (
                <>
                  <button onClick={() => duplicateAllocationConfig(selectedConfig.id)} className="rounded-lg border border-slate-200 text-sm px-3 py-2">複製</button>
                  <button
                    onClick={() => deleteAllocationConfig(selectedConfig.id)}
                    className="rounded-lg border border-red-200 text-red-500 text-sm px-3 py-2"
                  >
                    刪除
                  </button>
                </>
              )}
            </div>

            {selectedConfig && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={configName} onChange={(e) => setConfigName(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="配置名稱" />
                  <input value={configDescription} onChange={(e) => setConfigDescription(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="說明" />
                  <input type="number" min={1} value={configInterval} onChange={(e) => setConfigInterval(parseInt(e.target.value, 10) || 1)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="幾個月再平衡" />
                  <div className="flex gap-2">
                    <input type="number" min={1} max={28} value={configDay} onChange={(e) => setConfigDay(parseInt(e.target.value, 10) || 1)} className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="每月幾號" />
                    <button onClick={saveConfigDetails} className="rounded-xl bg-[#2C5F8A] text-white text-sm px-3">儲存</button>
                  </div>
                </div>

                <div className="space-y-2">
                  {selectedConfig.targetWeights.map((target, index) => (
                    <div key={target.symbol} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center rounded-xl border border-slate-200 p-3">
                      <div className="md:col-span-3 font-mono font-semibold">{target.symbol}</div>
                      <div className="md:col-span-5 text-sm text-slate-600">{target.name}</div>
                      <div className="md:col-span-2">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={target.weight}
                          onChange={(e) => {
                            const next = [...selectedConfig.targetWeights]
                            next[index] = { ...next[index], weight: parseFloat(e.target.value) || 0 }
                            updateAllocationConfig(selectedConfig.id, { targetWeights: next })
                          }}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => updateAllocationConfig(selectedConfig.id, { targetWeights: selectedConfig.targetWeights.filter((item) => item.symbol !== target.symbol) })}
                        className="md:col-span-2 text-sm text-red-500"
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input value={newWeightSymbol} onChange={(e) => setNewWeightSymbol(e.target.value.toUpperCase())} placeholder="新 ticker" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
                  <input value={newWeightValue} onChange={(e) => setNewWeightValue(e.target.value)} placeholder="權重 %" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <button onClick={() => void handleAddTargetWeight()} className="rounded-xl bg-slate-700 text-white text-sm font-semibold px-4 py-2.5">加入標的</button>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                    合計 {selectedConfig.targetWeights.reduce((sum, target) => sum + target.weight, 0).toFixed(1)}%
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="持倉與交易">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="font-medium text-[#1A1A2E]">快速持倉輸入</div>
                <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="">選擇帳戶</option>
                  {store.accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <input value={holdingSymbol} onChange={(e) => setHoldingSymbol(e.target.value.toUpperCase())} placeholder="Ticker" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
                <input value={holdingShares} onChange={(e) => setHoldingShares(e.target.value)} placeholder="股數" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <input value={holdingAvgCostUsd} onChange={(e) => setHoldingAvgCostUsd(e.target.value)} placeholder="均價 USD" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                <button onClick={() => void handleQuickHoldingSave()} className="rounded-xl bg-[#2C5F8A] text-white text-sm font-semibold px-4 py-2.5">儲存持倉</button>
              </div>

              <div className="space-y-3">
                <div className="font-medium text-[#1A1A2E]">新增交易紀錄</div>
                <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="">選擇帳戶</option>
                  {store.accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input value={txSymbol} onChange={(e) => setTxSymbol(e.target.value.toUpperCase())} placeholder="Ticker" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
                  <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <select value={txType} onChange={(e) => setTxType(e.target.value as 'buy' | 'sell')} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                    <option value="buy">買入</option>
                    <option value="sell">賣出</option>
                  </select>
                  <input value={txShares} onChange={(e) => setTxShares(e.target.value)} placeholder="股數" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <input value={txPriceUsd} onChange={(e) => setTxPriceUsd(e.target.value)} placeholder="成交價 USD" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <input value={txFeeUsd} onChange={(e) => setTxFeeUsd(e.target.value)} placeholder="手續費 USD" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
                <button onClick={() => void handleAddTransaction()} className="rounded-xl bg-slate-700 text-white text-sm font-semibold px-4 py-2.5">新增交易</button>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mt-4">
              <DataCard title="持倉列表">
                <Table
                  headers={['帳戶', 'Ticker', '股數', '均價 USD', '']}
                  rows={store.holdings.map((holding) => ({
                    key: `${holding.accountId}_${holding.symbol}`,
                    cells: [
                      store.accounts.find((account) => account.id === holding.accountId)?.name ?? holding.accountId,
                      holding.symbol,
                      holding.shares.toLocaleString(),
                      `USD ${formatUsd(holding.avgCostUsd)}`,
                      <button key="delete" onClick={() => deleteHolding(holding.accountId, holding.symbol)} className="text-red-500">刪除</button>,
                    ],
                  }))}
                />
              </DataCard>

              <DataCard title="交易紀錄">
                <Table
                  headers={['日期', 'Ticker', '類型', '股數', '價格', '']}
                  rows={store.transactions
                    .slice()
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((tx) => ({
                      key: tx.id,
                      cells: [
                        tx.date,
                        tx.symbol,
                        tx.type === 'buy' ? '買入' : '賣出',
                        tx.shares.toLocaleString(),
                        `USD ${formatUsd(tx.priceUsd)}`,
                        <button key="delete" onClick={() => deleteTransaction(tx.id)} className="text-red-500">刪除</button>,
                      ],
                    }))}
                />
              </DataCard>
            </div>
          </Section>

          <Section title="股利 / 配息">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="font-medium text-[#1A1A2E]">自動同步</div>
                {store.holdings.map((holding) => {
                  const entryKey = `${holding.accountId}_${holding.symbol}`
                  const entryDate = store.dividendEntryDates[entryKey] ?? findEarliestBuyDate(holding.accountId, holding.symbol, store.transactions)
                  return (
                    <div key={entryKey} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex flex-col md:flex-row md:items-center gap-2">
                        <div className="flex-1">
                          <div className="font-medium">{holding.symbol}</div>
                          <div className="text-xs text-slate-400">{store.accounts.find((account) => account.id === holding.accountId)?.name}</div>
                        </div>
                        <input
                          type="date"
                          value={entryDate}
                          onChange={(e) => setDividendEntryDate(holding.accountId, holding.symbol, e.target.value)}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <button onClick={() => void handleSyncDividend(holding.accountId, holding.symbol)} className="rounded-lg bg-[#2C5F8A] text-white text-sm px-3 py-2">同步</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="space-y-3">
                <div className="font-medium text-[#1A1A2E]">手動新增</div>
                <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm">
                  <option value="">選擇帳戶</option>
                  {store.accounts.map((account) => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
                <input value={manualDividendSymbol} onChange={(e) => setManualDividendSymbol(e.target.value.toUpperCase())} placeholder="Ticker" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={manualDividendDate} onChange={(e) => setManualDividendDate(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                  <input value={manualDividendCash} onChange={(e) => setManualDividendCash(e.target.value)} placeholder="每股 USD" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                </div>
                <button onClick={handleManualDividendAdd} className="rounded-xl bg-slate-700 text-white text-sm font-semibold px-4 py-2.5">新增股利</button>
              </div>
            </div>

            <div className="mt-4">
              <DataCard title="股利紀錄">
                <Table
                  headers={['帳戶', 'Ticker', '除息日', '每股 USD', '總額 USD', '']}
                  rows={store.dividends
                    .slice()
                    .sort((a, b) => b.exDate.localeCompare(a.exDate))
                    .map((dividend) => ({
                      key: dividend.id,
                      cells: [
                        store.accounts.find((account) => account.id === dividend.accountId)?.name ?? dividend.accountId,
                        dividend.symbol,
                        dividend.exDate,
                        formatUsd(dividend.cashPerShareUsd),
                        formatUsd(dividend.totalCashUsd),
                        <button key="delete" onClick={() => deleteDividend(dividend.id)} className="text-red-500">刪除</button>,
                      ],
                    }))}
                />
              </DataCard>
            </div>
          </Section>
        </div>
      )}

      {activeTab === 'invest' && (
        <Section title="偏差修正投入">
          <div className="flex flex-col md:flex-row gap-3 md:items-end mb-4">
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-w-[220px]">
              <option value="">選擇帳戶</option>
              {store.accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
            <input value={investAmountTwd} onChange={(e) => setInvestAmountTwd(parseInt(e.target.value, 10) || 0)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-w-[220px]" />
            <div className="text-xs text-slate-400">依目標配置優先補足欠配部位</div>
          </div>
          {deviationSummary ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label="投入 TWD" value={`NT$${formatTwd(deviationSummary.investAmountTwd)}`} />
                <MetricCard label="投入 USD" value={`USD ${formatUsd(deviationSummary.investAmountUsd)}`} />
                <MetricCard label="實際分配" value={`NT$${formatTwd(deviationSummary.totalAllocatedTwd)}`} />
                <MetricCard label="剩餘現金" value={`NT$${formatTwd(deviationSummary.remainingCashTwd)}`} />
              </div>
              <Table
                headers={['股票', '目前比重', '目標比重', '建議投入', '可買股數', '新比重']}
                rows={deviationSummary.results.map((result) => ({
                  key: result.symbol,
                  cells: [
                    `${result.symbol} / ${result.name}`,
                    `${result.currentWeight.toFixed(2)}%`,
                    `${result.targetWeight.toFixed(2)}%`,
                    `NT$${formatTwd(result.suggestedAmountTwd)} / USD ${formatUsd(result.suggestedAmountUsd)}`,
                    result.displayShares,
                    `${result.newWeight.toFixed(2)}%`,
                  ],
                }))}
              />
            </div>
          ) : (
            <EmptyState text="請先建立帳戶、配置與報價資料" />
          )}
        </Section>
      )}

      {activeTab === 'rebalance' && (
        <Section title="再平衡試算">
          <div className="mb-4">
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm min-w-[220px]">
              <option value="">選擇帳戶</option>
              {store.accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>
          {rebalancePlan ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MetricCard label="目前總市值" value={`NT$${formatTwd(rebalancePlan.totalCurrentValueTwd)}`} />
                <MetricCard label="買入成本" value={`NT$${formatTwd(rebalancePlan.totalBuyCostTwd)}`} />
                <MetricCard label="賣出回收" value={`NT$${formatTwd(rebalancePlan.totalSellReturnTwd)}`} />
                <MetricCard label="淨現金流" value={`${rebalancePlan.netCashFlowTwd >= 0 ? '' : '-'}NT$${formatTwd(Math.abs(rebalancePlan.netCashFlowTwd))}`} />
              </div>
              <Table
                headers={['股票', '目前比重', '目標比重', '動作', '股數變化', '金額 / 手續費']}
                rows={rebalancePlan.actions.map((action) => ({
                  key: action.symbol,
                  cells: [
                    `${action.symbol} / ${action.name}`,
                    `${action.currentWeight.toFixed(2)}%`,
                    `${action.targetWeight.toFixed(2)}%`,
                    action.action === 'buy' ? '買入' : action.action === 'sell' ? '賣出' : '持有',
                    `${action.sharesChange > 0 ? '+' : ''}${action.sharesChange.toLocaleString()} 股`,
                    `USD ${formatUsd(action.estimatedAmountUsd)} / fee USD ${formatUsd(action.feeUsd)}`,
                  ],
                }))}
              />
            </div>
          ) : (
            <EmptyState text="請先建立帳戶、配置與報價資料" />
          )}
        </Section>
      )}

      {activeTab === 'settings' && (
        <Section title="系統設定">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="font-medium text-[#1A1A2E]">費率模板</div>
              <select
                value={store.settings.profileId}
                onChange={(e) => updateSettings({ profileId: e.target.value as UsFeeProfileId })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              >
                <option value="standard">凱基一般單筆</option>
                <option value="promo_no_min">凱基優惠無低消</option>
                <option value="dca">凱基定期定額</option>
                <option value="custom">自訂</option>
              </select>

              <div className="grid grid-cols-2 gap-3">
                <FeeInput label="買入費率" value={store.settings.customFees.buyRate} onChange={(value) => updateCustomFee(updateSettings, store.settings.customFees, { buyRate: value })} />
                <FeeInput label="買入最低 USD" value={store.settings.customFees.buyMinUsd} onChange={(value) => updateCustomFee(updateSettings, store.settings.customFees, { buyMinUsd: value })} />
                <FeeInput label="賣出費率" value={store.settings.customFees.sellRate} onChange={(value) => updateCustomFee(updateSettings, store.settings.customFees, { sellRate: value })} />
                <FeeInput label="賣出最低 USD" value={store.settings.customFees.sellMinUsd} onChange={(value) => updateCustomFee(updateSettings, store.settings.customFees, { sellMinUsd: value })} />
              </div>
            </div>

            <div className="space-y-3">
              <div className="font-medium text-[#1A1A2E]">匯入 / 匯出</div>
              <div className="flex gap-2">
                <button onClick={() => setImportExportJson(exportJSON())} className="rounded-xl bg-[#2C5F8A] text-white text-sm px-4 py-2.5">匯出 JSON</button>
                <button
                  onClick={() => {
                    if (!importExportJson.trim()) return
                    importJSON(importExportJson)
                  }}
                  className="rounded-xl border border-slate-200 text-sm px-4 py-2.5"
                >
                  匯入 JSON
                </button>
              </div>
              <textarea
                value={importExportJson}
                onChange={(e) => setImportExportJson(e.target.value)}
                className="w-full min-h-[240px] rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-mono"
                placeholder="匯出後的 JSON 或欲匯入資料"
              />
            </div>
          </div>
        </Section>
      )}
    </div>
  )
}

function updateCustomFee(
  updateSettings: (patch: { customFees: UsCustomFeeSettings }) => void,
  current: UsCustomFeeSettings,
  patch: Partial<UsCustomFeeSettings>,
) {
  updateSettings({ customFees: { ...current, ...patch } })
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-1 h-4 bg-[#2C5F8A] rounded-full" />
        <h2 className="text-xs font-bold text-[#2C5F8A] uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="mt-1 font-bold text-[#1A1A2E]">{value}</div>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="mt-1 text-sm font-bold font-mono text-[#1A1A2E]">{value}</div>
    </div>
  )
}

function FeeInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div>
      <label className="text-[11px] text-slate-400 block mb-1.5">{label}</label>
      <input
        type="number"
        min={0}
        step={0.0001}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
      />
    </div>
  )
}

function DataCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="font-medium text-[#1A1A2E] mb-3">{title}</div>
      {children}
    </div>
  )
}

function Table({
  headers,
  rows,
}: {
  headers: string[]
  rows: Array<{ key: string; cells: React.ReactNode[] }>
}) {
  if (rows.length === 0) {
    return <EmptyState text="尚無資料" />
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
            {headers.map((header) => (
              <th key={header} className="text-left py-2 px-2">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-100">
              {row.cells.map((cell, index) => (
                <td key={`${row.key}_${index}`} className="py-2 px-2 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">{text}</div>
}

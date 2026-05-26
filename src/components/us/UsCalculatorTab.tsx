'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  calcUsMinFundTwd,
  calcUsTopUp,
  calculateUsPortfolio,
  formatTwd,
  formatUsd,
} from '@/lib/us-calculator'
import { useUsPortfolioStore } from '@/hooks/useUsPortfolioStore'
import { UsCustomFeeSettings, UsFeeProfileId, UsStockEntry, UsStockPriceResponse } from '@/lib/us-types'

interface StockRow extends UsStockEntry {
  loading: boolean
  error: string
}

const DEFAULT_ROWS: StockRow[] = [
  { symbol: 'VOO', name: '', exchange: 'arca', priceUsd: 0, weight: 50, isETF: true, hold: false, loading: false, error: '' },
  { symbol: 'AAPL', name: '', exchange: 'nasdaq', priceUsd: 0, weight: 25, isETF: false, hold: false, loading: false, error: '' },
  { symbol: 'MSFT', name: '', exchange: 'nasdaq', priceUsd: 0, weight: 25, isETF: false, hold: false, loading: false, error: '' },
  { symbol: '', name: '', exchange: 'unknown', priceUsd: 0, weight: 0, isETF: false, hold: false, loading: false, error: '' },
]

function buildInitialRows(): StockRow[] {
  return DEFAULT_ROWS.map((row) => ({ ...row }))
}

export default function UsCalculatorTab() {
  const { store, updateSettings } = useUsPortfolioStore()
  const [stocks, setStocks] = useState<StockRow[]>(buildInitialRows)
  const [totalFundTwd, setTotalFundTwd] = useState(300000)
  const [fxRate, setFxRate] = useState(store.settings.lastFxRate || 32)
  const [selectedConfigId, setSelectedConfigId] = useState('')
  const [topUpAmountTwd, setTopUpAmountTwd] = useState(0)
  const hasFetched = useRef(false)

  const profileId = store.settings.profileId
  const customFees = store.settings.customFees

  const setProfileId = useCallback((nextProfileId: UsFeeProfileId) => {
    updateSettings({ profileId: nextProfileId })
  }, [updateSettings])

  const setCustomFees = useCallback((patch: Partial<UsCustomFeeSettings>) => {
    updateSettings({
      customFees: {
        ...store.settings.customFees,
        ...patch,
      },
    })
  }, [store.settings.customFees, updateSettings])

  const updateRow = useCallback((index: number, patch: Partial<StockRow>) => {
    setStocks((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
  }, [])

  const fetchQuotes = useCallback(async (symbols: string[]) => {
    const cleaned = Array.from(new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)))
    if (cleaned.length === 0) return null

    const res = await fetch(`/api/us-stock-price?symbols=${encodeURIComponent(cleaned.join('|'))}`)
    const data = await res.json() as UsStockPriceResponse & { error?: string }
    if (!res.ok) {
      throw new Error(data.error ?? '查詢失敗')
    }
    if (data.fxRate > 0) {
      setFxRate(data.fxRate)
      updateSettings({ lastFxRate: data.fxRate })
    }
    return data
  }, [updateSettings])

  const fetchSingleRow = useCallback(async (index: number) => {
    const symbol = stocks[index]?.symbol.trim().toUpperCase()
    if (!symbol) return
    updateRow(index, { loading: true, error: '' })
    try {
      const data = await fetchQuotes([symbol])
      const quote = data?.stocks?.[0]
      if (!quote) {
        updateRow(index, { name: '', priceUsd: 0, loading: false, error: '找不到此美股代碼' })
        return
      }
      updateRow(index, {
        symbol: quote.symbol,
        name: quote.name,
        exchange: quote.exchange,
        priceUsd: quote.priceUsd,
        isETF: quote.isETF,
        loading: false,
        error: '',
      })
    } catch (error) {
      updateRow(index, {
        loading: false,
        error: error instanceof Error ? error.message : '查詢失敗',
      })
    }
  }, [fetchQuotes, stocks, updateRow])

  const applyConfig = useCallback(async (configId: string) => {
    const config = store.allocationConfigs.find((item) => item.id === configId)
    if (!config) return

    const rows: StockRow[] = config.targetWeights.map((target) => ({
      symbol: target.symbol,
      name: target.name,
      exchange: target.exchange,
      priceUsd: 0,
      weight: target.weight,
      isETF: target.isETF,
      hold: false,
      loading: true,
      error: '',
    }))

    while (rows.length < 4) {
      rows.push({ symbol: '', name: '', exchange: 'unknown', priceUsd: 0, weight: 0, isETF: false, hold: false, loading: false, error: '' })
    }

    setStocks(rows)
    try {
      const data = await fetchQuotes(rows.map((row) => row.symbol))
      const quoteMap = new Map((data?.stocks ?? []).map((quote) => [quote.symbol, quote]))
      setStocks((prev) => prev.map((row) => {
        const quote = quoteMap.get(row.symbol)
        if (!quote) return { ...row, loading: false, error: row.symbol ? '查詢失敗' : '' }
        return {
          ...row,
          name: quote.name,
          exchange: quote.exchange,
          priceUsd: quote.priceUsd,
          isETF: quote.isETF,
          loading: false,
          error: '',
        }
      }))
    } catch {
      setStocks((prev) => prev.map((row) => ({ ...row, loading: false, error: row.symbol ? '查詢失敗' : '' })))
    }
  }, [fetchQuotes, store.allocationConfigs])

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true
    void (async () => {
      try {
        const data = await fetchQuotes(stocks.filter((row) => row.symbol).map((row) => row.symbol))
        const quoteMap = new Map((data?.stocks ?? []).map((quote) => [quote.symbol, quote]))
        setStocks((prev) => prev.map((row) => {
          const quote = quoteMap.get(row.symbol)
          if (!quote) return row
          return {
            ...row,
            name: quote.name,
            exchange: quote.exchange,
            priceUsd: quote.priceUsd,
            isETF: quote.isETF,
          }
        }))
      } catch {
        // ignore first-load errors
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const validRows = useMemo(() => stocks.filter((row) => row.priceUsd > 0 && row.weight > 0), [stocks])
  const totalWeight = stocks.reduce((sum, row) => sum + row.weight, 0)
  const minFundTwd = useMemo(
    () => calcUsMinFundTwd(stocks, fxRate, profileId, customFees),
    [customFees, fxRate, profileId, stocks],
  )

  const portfolioResult = useMemo(() => {
    if (totalFundTwd <= 0 || totalWeight <= 0 || totalWeight > 100.01) return null
    if (validRows.length === 0 || !(fxRate > 0)) return null
    return calculateUsPortfolio(validRows, totalFundTwd, fxRate, profileId, customFees)
  }, [customFees, fxRate, profileId, totalFundTwd, totalWeight, validRows])

  const topUpResult = useMemo(() => {
    if (topUpAmountTwd <= 0 || validRows.length === 0 || !(fxRate > 0)) return null
    return calcUsTopUp(
      validRows.map(({ symbol, name, exchange, priceUsd, weight, isETF }) => ({
        symbol,
        name,
        exchange,
        priceUsd,
        weight,
        isETF,
      })),
      topUpAmountTwd,
      fxRate,
      profileId,
      customFees,
    )
  }, [customFees, fxRate, profileId, topUpAmountTwd, validRows])

  return (
    <div className="space-y-4 sm:space-y-6">
      <Section title="基本設定">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1.5 font-medium tracking-wide">總資金（TWD）</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">NT$</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={totalFundTwd || ''}
                onChange={(e) => setTotalFundTwd(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-xl border border-slate-200 pl-12 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]/30"
              />
            </div>
            {minFundTwd > 0 && (
              <p className={`mt-1.5 text-xs ${totalFundTwd > 0 && totalFundTwd < minFundTwd ? 'text-amber-600' : 'text-slate-400'}`}>
                最低需要 NT${formatTwd(minFundTwd)}
              </p>
            )}
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1.5 font-medium tracking-wide">費率模板</label>
            <select
              value={profileId}
              onChange={(e) => setProfileId(e.target.value as UsFeeProfileId)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]/30"
            >
              <option value="standard">凱基一般單筆</option>
              <option value="promo_no_min">凱基優惠無低消</option>
              <option value="dca">凱基定期定額</option>
              <option value="custom">自訂</option>
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] text-slate-400 uppercase tracking-wider">USD / TWD</div>
            <div className="mt-1 text-lg font-black text-[#2C5F8A]">{fxRate > 0 ? fxRate.toFixed(3) : '—'}</div>
            <div className="text-xs text-slate-400 mt-1">依 Yahoo `USDTWD=X` 即時換算</div>
          </div>
        </div>

        {profileId === 'custom' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <FeeField label="買入費率" value={customFees.buyRate} step={0.0001} onChange={(value) => setCustomFees({ buyRate: value })} />
            <FeeField label="買入最低 USD" value={customFees.buyMinUsd} step={0.01} onChange={(value) => setCustomFees({ buyMinUsd: value })} />
            <FeeField label="賣出費率" value={customFees.sellRate} step={0.0001} onChange={(value) => setCustomFees({ sellRate: value })} />
            <FeeField label="賣出最低 USD" value={customFees.sellMinUsd} step={0.01} onChange={(value) => setCustomFees({ sellMinUsd: value })} />
          </div>
        )}
      </Section>

      <Section
        title="股票配置"
        right={
          store.allocationConfigs.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={selectedConfigId}
                onChange={(e) => setSelectedConfigId(e.target.value)}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="">選擇配置…</option>
                {store.allocationConfigs.map((config) => (
                  <option key={config.id} value={config.id}>{config.name}</option>
                ))}
              </select>
              <button
                onClick={() => selectedConfigId && applyConfig(selectedConfigId)}
                disabled={!selectedConfigId}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#2C5F8A] text-white disabled:opacity-40"
              >
                套用
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          {stocks.map((stock, index) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">美股 {index + 1}</div>
                {stock.priceUsd > 0 && (
                  <div className="text-xs text-slate-500">
                    USD <span className="font-mono font-bold text-emerald-600">{stock.priceUsd.toFixed(2)}</span>
                    <span className="ml-2 text-slate-400">約 NT${formatTwd(stock.priceUsd * fxRate)}</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <label className="text-[11px] text-slate-400 block mb-1">Ticker</label>
                  <input
                    type="text"
                    value={stock.symbol}
                    onChange={(e) => updateRow(index, { symbol: e.target.value.toUpperCase(), error: '', name: e.target.value !== stock.symbol ? '' : stock.name })}
                    onBlur={() => { if (stock.symbol.trim()) void fetchSingleRow(index) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void fetchSingleRow(index) }}
                    placeholder="AAPL"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]/30"
                  />
                </div>
                <div className="md:col-span-2">
                  <button
                    onClick={() => void fetchSingleRow(index)}
                    disabled={!stock.symbol.trim() || stock.loading}
                    className="w-full rounded-lg bg-slate-700 text-white text-sm py-2.5 disabled:opacity-40"
                  >
                    {stock.loading ? '查詢中…' : '查詢'}
                  </button>
                </div>
                <div className="md:col-span-4">
                  <label className="text-[11px] text-slate-400 block mb-1">名稱</label>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 min-h-[42px]">
                    {stock.error ? <span className="text-red-500">{stock.error}</span> : stock.name || '輸入代碼後查詢'}
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="text-[11px] text-slate-400 block mb-1">權重 %</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={stock.weight || ''}
                    onChange={(e) => updateRow(index, { weight: parseFloat(e.target.value) || 0 })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#2C5F8A]/30"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-slate-500">權重總計</span>
          <span className={`font-bold ${totalWeight > 100.01 ? 'text-red-500' : 'text-emerald-600'}`}>
            {totalWeight.toFixed(1)}%
          </span>
        </div>
      </Section>

      {portfolioResult && (
        <Section title="計算結果">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
                  <th className="text-left py-2 px-2">股票</th>
                  <th className="text-right py-2 px-2">現價 USD</th>
                  <th className="text-right py-2 px-2">權重</th>
                  <th className="text-right py-2 px-2">分配 TWD</th>
                  <th className="text-right py-2 px-2">可買股數</th>
                  <th className="text-right py-2 px-2">買入手續費</th>
                  <th className="text-right py-2 px-2">實際花費</th>
                </tr>
              </thead>
              <tbody>
                {portfolioResult.stocks.map((stock) => (
                  <tr key={stock.symbol} className={`border-b border-slate-100 ${stock.insufficientFund ? 'bg-red-50/60' : ''}`}>
                    <td className="py-3 px-2">
                      <div className="font-bold text-[#2C5F8A]">{stock.name || stock.symbol}</div>
                      <div className="text-[11px] text-slate-400">{stock.symbol} {stock.isETF ? '• ETF' : ''}</div>
                    </td>
                    <td className="text-right py-3 px-2 font-mono">USD {stock.priceUsd.toFixed(2)}</td>
                    <td className="text-right py-3 px-2">{stock.weight}%</td>
                    <td className="text-right py-3 px-2 font-mono">NT${formatTwd(stock.allocatedTwd)}</td>
                    <td className="text-right py-3 px-2">{stock.insufficientFund ? '資金不足' : stock.displayShares}</td>
                    <td className="text-right py-3 px-2 font-mono">
                      USD {formatUsd(stock.buyFeeUsd)}
                      <div className="text-[11px] text-slate-400">約 NT${formatTwd(stock.buyFeeTwd)}</div>
                    </td>
                    <td className="text-right py-3 px-2 font-mono font-bold">
                      USD {formatUsd(stock.actualCostUsd)}
                      <div className="text-[11px] text-slate-400">約 NT${formatTwd(stock.actualCostTwd)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <SummaryCard label="總投入" value={`NT$${formatTwd(portfolioResult.totalInvestedTwd)}`} sub={`USD ${formatUsd(portfolioResult.totalInvestedUsd)}`} />
            <SummaryCard label="總手續費" value={`NT$${formatTwd(portfolioResult.totalBuyFeeTwd)}`} sub={`USD ${formatUsd(portfolioResult.totalBuyFeeUsd)}`} />
            <SummaryCard label="預估賣出手續費" value={`NT$${formatTwd(portfolioResult.totalSellCostTwd)}`} sub={`USD ${formatUsd(portfolioResult.totalSellCostUsd)}`} />
            <SummaryCard label="剩餘現金" value={`NT$${formatTwd(portfolioResult.remainingCashTwd)}`} sub={`USD ${formatUsd(portfolioResult.remainingCashUsd)}`} />
          </div>
        </Section>
      )}

      {validRows.length > 0 && (
        <Section title="等比例加碼試算">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="text-[11px] text-slate-400 block mb-1.5">加碼金額（TWD）</label>
              <input
                type="number"
                min={0}
                value={topUpAmountTwd || ''}
                onChange={(e) => setTopUpAmountTwd(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2">
              {[100000, 300000, 500000].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setTopUpAmountTwd(amount)}
                  className="text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  NT${formatTwd(amount)}
                </button>
              ))}
            </div>
          </div>

          {topUpResult && topUpResult.stocks.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
                      <th className="text-left py-2 px-2">股票</th>
                      <th className="text-right py-2 px-2">分配 TWD</th>
                      <th className="text-right py-2 px-2">可買股數</th>
                      <th className="text-right py-2 px-2">手續費</th>
                      <th className="text-right py-2 px-2">實際花費</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topUpResult.stocks.map((stock) => (
                      <tr key={stock.symbol} className="border-b border-slate-100">
                        <td className="py-2 px-2">
                          <div className="font-medium">{stock.name}</div>
                          <div className="text-[11px] text-slate-400">{stock.symbol}</div>
                        </td>
                        <td className="text-right py-2 px-2 font-mono">NT${formatTwd(stock.allocatedTwd)}</td>
                        <td className="text-right py-2 px-2">{stock.displayShares}</td>
                        <td className="text-right py-2 px-2 font-mono">
                          USD {formatUsd(stock.buyFeeUsd)}
                          <div className="text-[11px] text-slate-400">NT${formatTwd(stock.buyFeeTwd)}</div>
                        </td>
                        <td className="text-right py-2 px-2 font-mono">
                          USD {formatUsd(stock.actualCostUsd)}
                          <div className="text-[11px] text-slate-400">NT${formatTwd(stock.actualCostTwd)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <SummaryCard label="加碼金額" value={`NT$${formatTwd(topUpResult.topUpAmountTwd)}`} sub={`USD ${formatUsd(topUpResult.topUpAmountTwd / fxRate)}`} />
                <SummaryCard label="實際投入" value={`NT$${formatTwd(topUpResult.totalCostTwd)}`} sub={`USD ${formatUsd(topUpResult.totalCostUsd)}`} />
                <SummaryCard label="剩餘現金" value={`NT$${formatTwd(topUpResult.remainingCashTwd)}`} sub={`USD ${formatUsd(topUpResult.remainingCashUsd)}`} />
              </div>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

function FeeField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <label className="text-[11px] text-slate-400 block mb-1.5">{label}</label>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
      />
    </div>
  )
}

function Section({
  title,
  right,
  children,
}: {
  title: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 bg-[#2C5F8A] rounded-full" />
          <h2 className="text-xs font-bold text-[#2C5F8A] uppercase tracking-widest">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[11px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold font-mono text-[#1A1A2E] mt-1">{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{sub}</div>
    </div>
  )
}

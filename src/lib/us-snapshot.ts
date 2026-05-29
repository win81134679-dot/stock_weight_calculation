/**
 * us-snapshot.ts
 * 美股 PnL 每日快照 — 對齊台股 snapshot.ts。
 * 採 USD 為主、TWD 以當下匯率換算；記錄當下匯率以利歷史回溯。
 */

import {
  UsAccountSnapshot,
  UsPnLSnapshot,
  UsPortfolioStore,
  UsPriceCache,
  UsStockDailySnap,
} from './us-types'
import { addUsSnapshot } from './us-portfolio-store'

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100
}

function roundTwd(value: number): number {
  return Math.round(value)
}

/**
 * 由目前持倉與報價建立一張美股 PnL 快照。
 * 使用者開啟總覽時自動呼叫。
 */
export function takeUsSnapshot(
  store: UsPortfolioStore,
  prices: Record<string, UsPriceCache>,
  fxRate: number,
): UsPnLSnapshot {
  const { accounts, holdings } = store

  const accountSnapshots: UsAccountSnapshot[] = accounts.map((account) => {
    const accountHoldings = holdings.filter((holding) => holding.accountId === account.id)
    const totalValueUsd = accountHoldings.reduce(
      (sum, holding) => sum + holding.shares * (prices[holding.symbol]?.priceUsd ?? 0),
      0,
    )
    const totalCostUsd = accountHoldings.reduce(
      (sum, holding) => sum + holding.shares * holding.avgCostUsd,
      0,
    )
    const totalPnlUsd = totalValueUsd - totalCostUsd
    return {
      accountId: account.id,
      totalCostUsd: roundUsd(totalCostUsd),
      totalValueUsd: roundUsd(totalValueUsd),
      totalPnlUsd: roundUsd(totalPnlUsd),
      totalCostTwd: roundTwd(totalCostUsd * fxRate),
      totalValueTwd: roundTwd(totalValueUsd * fxRate),
      totalPnlTwd: roundTwd(totalPnlUsd * fxRate),
      pnlPct: totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0,
    }
  })

  const combinedCostUsd = accountSnapshots.reduce((sum, item) => sum + item.totalCostUsd, 0)
  const combinedValueUsd = accountSnapshots.reduce((sum, item) => sum + item.totalValueUsd, 0)
  const combinedPnlUsd = combinedValueUsd - combinedCostUsd

  // 逐股明細（合併跨帳戶同代碼）
  const stockMap = new Map<string, UsStockDailySnap>()
  for (const holding of holdings) {
    const price = prices[holding.symbol]
    if (!price || holding.shares <= 0) continue
    const valueUsd = holding.shares * price.priceUsd
    const costUsd = holding.shares * holding.avgCostUsd
    const todayDeltaUsd = price.prevCloseUsd > 0 ? (price.priceUsd - price.prevCloseUsd) * holding.shares : 0
    const todayDeltaPct = price.prevCloseUsd > 0 ? ((price.priceUsd - price.prevCloseUsd) / price.prevCloseUsd) * 100 : 0
    const existing = stockMap.get(holding.symbol)
    if (existing) {
      existing.shares += holding.shares
      existing.valueUsd += valueUsd
      existing.valueTwd += valueUsd * fxRate
      existing.costUsd += costUsd
      existing.pnlUsd += valueUsd - costUsd
      existing.pnlTwd += (valueUsd - costUsd) * fxRate
      existing.todayDeltaUsd += todayDeltaUsd
    } else {
      stockMap.set(holding.symbol, {
        symbol: holding.symbol,
        name: holding.name,
        shares: holding.shares,
        valueUsd: roundUsd(valueUsd),
        valueTwd: roundTwd(valueUsd * fxRate),
        costUsd: roundUsd(costUsd),
        pnlUsd: roundUsd(valueUsd - costUsd),
        pnlTwd: roundTwd((valueUsd - costUsd) * fxRate),
        todayDeltaUsd: roundUsd(todayDeltaUsd),
        todayDeltaPct,
      })
    }
  }

  return {
    date: new Date().toISOString(),
    fxRate,
    accounts: accountSnapshots,
    combinedCostUsd: roundUsd(combinedCostUsd),
    combinedValueUsd: roundUsd(combinedValueUsd),
    combinedPnlUsd: roundUsd(combinedPnlUsd),
    combinedCostTwd: roundTwd(combinedCostUsd * fxRate),
    combinedValueTwd: roundTwd(combinedValueUsd * fxRate),
    combinedPnlTwd: roundTwd(combinedPnlUsd * fxRate),
    combinedPnlPct: combinedCostUsd > 0 ? (combinedPnlUsd / combinedCostUsd) * 100 : 0,
    stocks: Array.from(stockMap.values()).map((item) => ({
      ...item,
      valueUsd: roundUsd(item.valueUsd),
      valueTwd: roundTwd(item.valueTwd),
      costUsd: roundUsd(item.costUsd),
      pnlUsd: roundUsd(item.pnlUsd),
      pnlTwd: roundTwd(item.pnlTwd),
      todayDeltaUsd: roundUsd(item.todayDeltaUsd),
    })),
  }
}

/**
 * 建立快照並寫入 store（每日去重）。
 */
export function takeAndSaveUsSnapshot(
  store: UsPortfolioStore,
  prices: Record<string, UsPriceCache>,
  fxRate: number,
): UsPortfolioStore {
  if (store.accounts.length === 0 || !(fxRate > 0)) return store
  const snapshot = takeUsSnapshot(store, prices, fxRate)
  return addUsSnapshot(store, snapshot)
}

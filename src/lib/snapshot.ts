/**
 * snapshot.ts
 * PNL snapshot management — take & persist point-in-time portfolio snapshots.
 */

import { PnLSnapshot, PortfolioStore, PriceCache } from './types'
import { addSnapshot } from './portfolio-store'

/**
 * Build a PnL snapshot from current holdings and prices.
 * Called automatically when the user views the portfolio overview.
 */
export function takeSnapshot(
  store: PortfolioStore,
  prices: Record<string, PriceCache>
): PnLSnapshot {
  const { accounts, holdings } = store

  const accountSnapshots = accounts.map((acc) => {
    const acctHoldings = holdings.filter((h) => h.accountId === acc.id)
    const totalValue = acctHoldings.reduce(
      (sum, h) => sum + h.shares * (prices[h.code]?.price ?? 0),
      0
    )
    const totalCost = acctHoldings.reduce(
      (sum, h) => sum + h.shares * h.avgCost,
      0
    )
    const totalPnl = totalValue - totalCost
    return {
      accountId: acc.id,
      totalCost,
      totalValue,
      totalPnl,
      pnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
    }
  })

  const combinedCost = accountSnapshots.reduce((s, a) => s + a.totalCost, 0)
  const combinedValue = accountSnapshots.reduce((s, a) => s + a.totalValue, 0)
  const combinedPnl = combinedValue - combinedCost

  return {
    date: new Date().toISOString(),
    accounts: accountSnapshots,
    combinedCost,
    combinedValue,
    combinedPnl,
    combinedPnlPct: combinedCost > 0 ? (combinedPnl / combinedCost) * 100 : 0,
  }
}

/**
 * Take snapshot and persist to store.
 * Deduplicates by date (one per day).
 */
export function takeAndSaveSnapshot(
  store: PortfolioStore,
  prices: Record<string, PriceCache>
): PortfolioStore {
  if (store.accounts.length === 0) return store
  const snapshot = takeSnapshot(store, prices)
  return addSnapshot(store, snapshot)
}

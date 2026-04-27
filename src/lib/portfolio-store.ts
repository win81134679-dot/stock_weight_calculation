/**
 * portfolio-store.ts
 * localStorage CRUD for the rebalance management feature.
 * All mutations return new immutable objects — never mutate in place.
 */

import {
  Account,
  Holding,
  Transaction,
  PnLSnapshot,
  RebalanceSettings,
  PortfolioStore,
  TargetWeight,
} from './types'

const STORAGE_KEY = 'portfolio-store-v1'

// ============================================================
// Default values
// ============================================================

const DEFAULT_TARGET_WEIGHTS: TargetWeight[] = [
  { code: '00927',  name: '群益半導體收益',    exchange: 'tse', isETF: true, weight: 60 },
  { code: '00988A', name: '主動統一全球創新',  exchange: 'tse', isETF: true, weight: 20 },
  { code: '00997A', name: '主動群益美國增長',  exchange: 'tse', isETF: true, weight: 20 },
]

const DEFAULT_SETTINGS: RebalanceSettings = {
  targetWeights: DEFAULT_TARGET_WEIGHTS,
  rebalanceIntervalMonths: 3,
  rebalanceDayOfMonth: 1,
  nextRebalanceDate: calcNextRebalanceDate(3, 1),
  discordWebhookUrl: '',
  discordNotifyDaysBefore: 7,
  discount: 6,
}

function calcNextRebalanceDate(intervalMonths: number, dayOfMonth: number): string {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth() + intervalMonths, dayOfMonth)
  return next.toISOString().split('T')[0]
}

function buildDefaultStore(): PortfolioStore {
  return {
    accounts: [],
    holdings: [],
    transactions: [],
    snapshots: [],
    settings: DEFAULT_SETTINGS,
    lastUpdated: new Date().toISOString(),
  }
}

// ============================================================
// Persistence
// ============================================================

export function loadStore(): PortfolioStore {
  if (typeof window === 'undefined') return buildDefaultStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildDefaultStore()
    const parsed = JSON.parse(raw) as PortfolioStore
    // Migrate: ensure new settings fields exist
    const merged: PortfolioStore = {
      ...buildDefaultStore(),
      ...parsed,
      settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
    }
    return merged
  } catch {
    return buildDefaultStore()
  }
}

export function saveStore(store: PortfolioStore): void {
  if (typeof window === 'undefined') return
  try {
    const updated: PortfolioStore = { ...store, lastUpdated: new Date().toISOString() }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // localStorage full or unavailable — silently fail
  }
}

// ============================================================
// Account CRUD
// ============================================================

const ACCOUNT_COLORS = ['blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'teal'] as const

export function addAccount(store: PortfolioStore, name: string, broker?: string): PortfolioStore {
  const usedColors = store.accounts.map((a) => a.color)
  const color = ACCOUNT_COLORS.find((c) => !usedColors.includes(c)) ?? ACCOUNT_COLORS[0]
  const newAccount: Account = {
    id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    color,
    broker,
  }
  return { ...store, accounts: [...store.accounts, newAccount] }
}

export function updateAccount(store: PortfolioStore, id: string, patch: Partial<Omit<Account, 'id'>>): PortfolioStore {
  return {
    ...store,
    accounts: store.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  }
}

export function deleteAccount(store: PortfolioStore, id: string): PortfolioStore {
  return {
    ...store,
    accounts: store.accounts.filter((a) => a.id !== id),
    holdings: store.holdings.filter((h) => h.accountId !== id),
    transactions: store.transactions.filter((t) => t.accountId !== id),
  }
}

// ============================================================
// Holding CRUD (快速模式)
// ============================================================

export function upsertHolding(store: PortfolioStore, holding: Holding): PortfolioStore {
  const exists = store.holdings.findIndex(
    (h) => h.accountId === holding.accountId && h.code === holding.code
  )
  const next = exists >= 0
    ? store.holdings.map((h, i) => (i === exists ? { ...h, ...holding } : h))
    : [...store.holdings, holding]
  return { ...store, holdings: next }
}

export function deleteHolding(store: PortfolioStore, accountId: string, code: string): PortfolioStore {
  return {
    ...store,
    holdings: store.holdings.filter(
      (h) => !(h.accountId === accountId && h.code === code)
    ),
    transactions: store.transactions.filter(
      (t) => !(t.accountId === accountId && t.code === code)
    ),
  }
}

// ============================================================
// Transaction CRUD (詳細模式)
// ============================================================

export function addTransaction(store: PortfolioStore, tx: Omit<Transaction, 'id'>): PortfolioStore {
  const newTx: Transaction = {
    ...tx,
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  }
  const updatedStore = { ...store, transactions: [...store.transactions, newTx] }
  // Auto-recalculate holding from transactions
  return recalcHoldingFromTransactions(updatedStore, tx.accountId, tx.code)
}

export function deleteTransaction(store: PortfolioStore, txId: string): PortfolioStore {
  const tx = store.transactions.find((t) => t.id === txId)
  const updatedStore = {
    ...store,
    transactions: store.transactions.filter((t) => t.id !== txId),
  }
  if (!tx) return updatedStore
  return recalcHoldingFromTransactions(updatedStore, tx.accountId, tx.code)
}

/**
 * 從交易記錄重新計算持倉均價與股數（加權平均成本法）
 * 賣出時不改變均價。
 */
export function recalcHoldingFromTransactions(
  store: PortfolioStore,
  accountId: string,
  code: string
): PortfolioStore {
  const txs = store.transactions
    .filter((t) => t.accountId === accountId && t.code === code)
    .sort((a, b) => a.date.localeCompare(b.date))

  let totalShares = 0
  let totalCost = 0

  for (const tx of txs) {
    if (tx.type === 'buy') {
      totalCost += tx.shares * tx.price + tx.fee
      totalShares += tx.shares
    } else {
      // 賣出只減股數，均價不變
      totalShares = Math.max(0, totalShares - tx.shares)
    }
  }

  const avgCost = totalShares > 0 ? totalCost / totalShares : 0

  // Find existing holding metadata
  const existing = store.holdings.find(
    (h) => h.accountId === accountId && h.code === code
  )

  if (totalShares === 0 && !existing) return store

  const holding: Holding = {
    accountId,
    code,
    name: existing?.name ?? code,
    exchange: existing?.exchange ?? 'tse',
    isETF: existing?.isETF ?? true,
    shares: totalShares,
    avgCost,
  }

  return upsertHolding(store, holding)
}

// ============================================================
// Settings
// ============================================================

export function updateSettings(
  store: PortfolioStore,
  patch: Partial<RebalanceSettings>
): PortfolioStore {
  const newSettings = { ...store.settings, ...patch }
  // Recalculate nextRebalanceDate if interval or day changes
  if (patch.rebalanceIntervalMonths !== undefined || patch.rebalanceDayOfMonth !== undefined) {
    newSettings.nextRebalanceDate = calcNextRebalanceDate(
      newSettings.rebalanceIntervalMonths,
      newSettings.rebalanceDayOfMonth
    )
  }
  return { ...store, settings: newSettings }
}

export function addTargetWeight(store: PortfolioStore, tw: TargetWeight): PortfolioStore {
  const exists = store.settings.targetWeights.some((t) => t.code === tw.code)
  if (exists) {
    return {
      ...store,
      settings: {
        ...store.settings,
        targetWeights: store.settings.targetWeights.map((t) =>
          t.code === tw.code ? { ...t, ...tw } : t
        ),
      },
    }
  }
  return {
    ...store,
    settings: {
      ...store.settings,
      targetWeights: [...store.settings.targetWeights, tw],
    },
  }
}

export function removeTargetWeight(store: PortfolioStore, code: string): PortfolioStore {
  return {
    ...store,
    settings: {
      ...store.settings,
      targetWeights: store.settings.targetWeights.filter((t) => t.code !== code),
    },
  }
}

// ============================================================
// Snapshots
// ============================================================

export function addSnapshot(store: PortfolioStore, snapshot: PnLSnapshot): PortfolioStore {
  // Keep at most 365 snapshots (one per day dedup)
  const dateKey = snapshot.date.split('T')[0]
  const filtered = store.snapshots.filter((s) => s.date.split('T')[0] !== dateKey)
  const snapshots = [...filtered, snapshot].slice(-365)
  return { ...store, snapshots }
}

export function exportStoreAsJSON(store: PortfolioStore): string {
  return JSON.stringify(store, null, 2)
}

export function importStoreFromJSON(json: string): PortfolioStore | null {
  try {
    const parsed = JSON.parse(json) as PortfolioStore
    if (!parsed.accounts || !parsed.settings) return null
    return { ...buildDefaultStore(), ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } }
  } catch {
    return null
  }
}

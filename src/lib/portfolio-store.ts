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
  DividendRecord,
  AllocationConfig,
} from './types'

const STORAGE_KEY = 'portfolio-store-v1'

// ============================================================
// Default values
// ============================================================

const DEFAULT_TARGET_WEIGHTS: TargetWeight[] = [
  { code: '0050',   name: '元大台灣50',          exchange: 'tse', isETF: true, weight: 40 },
  { code: '00927',  name: '群益半導體收益',    exchange: 'tse', isETF: true, weight: 20 },
  { code: '00988A', name: '主動統一全球創新',  exchange: 'tse', isETF: true, weight: 40 },
]

export const DEFAULT_ALLOCATION_CONFIG: AllocationConfig = {
  id: 'default',
  name: '預設配置',
  targetWeights: DEFAULT_TARGET_WEIGHTS,
  rebalanceIntervalMonths: 3,
  rebalanceDayOfMonth: 1,
  nextRebalanceDate: calcNextRebalanceDate(3, 1),
}

const DEFAULT_SETTINGS: RebalanceSettings = {
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
    dividends: [],
    allocationConfigs: [{ ...DEFAULT_ALLOCATION_CONFIG, nextRebalanceDate: calcNextRebalanceDate(3, 1) }],
    settings: DEFAULT_SETTINGS,
    lastUpdated: new Date().toISOString(),
  }
}

// ============================================================
// Persistence
// ============================================================

function migrateStore(parsed: Record<string, unknown>): PortfolioStore {
  const base = buildDefaultStore()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = parsed as any

  // Migrate allocationConfigs: if missing, build from old settings.targetWeights
  let allocationConfigs: AllocationConfig[] = p.allocationConfigs ?? []
  if (allocationConfigs.length === 0) {
    const oldSettings = p.settings ?? {}
    const oldTW: TargetWeight[] = oldSettings.targetWeights ?? DEFAULT_TARGET_WEIGHTS
    const oldInterval: number = oldSettings.rebalanceIntervalMonths ?? 3
    const oldDay: number = oldSettings.rebalanceDayOfMonth ?? 1
    const oldNext: string = oldSettings.nextRebalanceDate ?? calcNextRebalanceDate(oldInterval, oldDay)
    allocationConfigs = [{
      id: 'default',
      name: '預設配置',
      targetWeights: oldTW,
      rebalanceIntervalMonths: oldInterval,
      rebalanceDayOfMonth: oldDay,
      nextRebalanceDate: oldNext,
    }]
  }

  // Build new settings (only global fields)
  const oldSettings = p.settings ?? {}
  const newSettings: RebalanceSettings = {
    discordWebhookUrl: oldSettings.discordWebhookUrl ?? '',
    discordNotifyDaysBefore: oldSettings.discordNotifyDaysBefore ?? 7,
    discount: oldSettings.discount ?? 6,
  }

  return {
    ...base,
    accounts: p.accounts ?? [],
    holdings: p.holdings ?? [],
    transactions: p.transactions ?? [],
    snapshots: p.snapshots ?? [],
    dividends: p.dividends ?? [],
    allocationConfigs,
    settings: newSettings,
    lastUpdated: p.lastUpdated ?? new Date().toISOString(),
  }
}

export function loadStore(): PortfolioStore {
  if (typeof window === 'undefined') return buildDefaultStore()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildDefaultStore()
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return migrateStore(parsed)
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
  return { ...store, settings: { ...store.settings, ...patch } }
}

// ============================================================
// AllocationConfig CRUD
// ============================================================

/** 取得帳戶使用的 AllocationConfig（fallback 到第一個配置） */
export function resolveAccountConfig(
  account: Account | undefined,
  allocationConfigs: AllocationConfig[]
): AllocationConfig {
  const fallback = allocationConfigs[0] ?? { ...DEFAULT_ALLOCATION_CONFIG, nextRebalanceDate: calcNextRebalanceDate(3, 1) }
  if (!account?.allocationConfigId) return fallback
  return allocationConfigs.find((c) => c.id === account.allocationConfigId) ?? fallback
}

export function addAllocationConfig(
  store: PortfolioStore,
  config: Omit<AllocationConfig, 'id'>
): PortfolioStore {
  const newConfig: AllocationConfig = {
    ...config,
    id: `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  }
  return { ...store, allocationConfigs: [...store.allocationConfigs, newConfig] }
}

export function updateAllocationConfig(
  store: PortfolioStore,
  id: string,
  patch: Partial<Omit<AllocationConfig, 'id'>>
): PortfolioStore {
  return {
    ...store,
    allocationConfigs: store.allocationConfigs.map((c) =>
      c.id === id ? { ...c, ...patch } : c
    ),
  }
}

/**
 * 刪除 AllocationConfig。
 * Returns false if it's the last config or any account is using it.
 */
export function deleteAllocationConfig(
  store: PortfolioStore,
  id: string
): PortfolioStore | false {
  if (store.allocationConfigs.length <= 1) return false
  const inUse = store.accounts.some((a) => a.allocationConfigId === id)
  if (inUse) return false
  return {
    ...store,
    allocationConfigs: store.allocationConfigs.filter((c) => c.id !== id),
  }
}

export function duplicateAllocationConfig(
  store: PortfolioStore,
  id: string
): PortfolioStore {
  const original = store.allocationConfigs.find((c) => c.id === id)
  if (!original) return store
  const copy: AllocationConfig = {
    ...original,
    id: `cfg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: `${original.name}（複製）`,
    nextRebalanceDate: calcNextRebalanceDate(original.rebalanceIntervalMonths, original.rebalanceDayOfMonth),
  }
  return { ...store, allocationConfigs: [...store.allocationConfigs, copy] }
}

export function setAccountAllocationConfig(
  store: PortfolioStore,
  accountId: string,
  configId: string | null
): PortfolioStore {
  return {
    ...store,
    accounts: store.accounts.map((a) =>
      a.id === accountId
        ? { ...a, allocationConfigId: configId ?? undefined }
        : a
    ),
  }
}

// Legacy stubs kept for compatibility (no-op)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function addTargetWeight(store: PortfolioStore, _tw: TargetWeight): PortfolioStore {
  return store
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function removeTargetWeight(store: PortfolioStore, _code: string): PortfolioStore {
  return store
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
    const parsed = JSON.parse(json) as Record<string, unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = parsed as any
    if (!p.accounts || !p.settings) return null
    return migrateStore(parsed)
  } catch {
    return null
  }
}

// ============================================================
// Dividends
// ============================================================

export function addDividend(
  store: PortfolioStore,
  record: Omit<DividendRecord, 'id'>
): PortfolioStore {
  const newRecord: DividendRecord = {
    ...record,
    id: `div_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  }
  // Deduplicate: same accountId + code + exDate of same source -> overwrite
  const filtered = store.dividends.filter(
    (d) => !(d.accountId === record.accountId && d.code === record.code && d.exDate === record.exDate && d.source === record.source)
  )
  return { ...store, dividends: [...filtered, newRecord] }
}

export function deleteDividend(store: PortfolioStore, id: string): PortfolioStore {
  return { ...store, dividends: store.dividends.filter((d) => d.id !== id) }
}

export function bulkUpsertDividends(
  store: PortfolioStore,
  records: Omit<DividendRecord, 'id'>[]
): PortfolioStore {
  let s = store
  for (const r of records) {
    s = addDividend(s, r)
  }
  return s
}

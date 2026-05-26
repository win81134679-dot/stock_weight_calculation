import {
  UsAccount,
  UsAllocationConfig,
  UsCustomFeeSettings,
  UsDividendRecord,
  UsHolding,
  UsPortfolioStore,
  UsSettings,
  UsTargetWeight,
  UsTransaction,
} from './us-types'
import { calcUsNextRebalanceDate } from './us-rebalance-calculator'

const STORAGE_KEY = 'us-portfolio-store-v1'

const DEFAULT_CUSTOM_FEES: UsCustomFeeSettings = {
  buyRate: 0.001,
  buyMinUsd: 0,
  sellRate: 0.001,
  sellMinUsd: 0,
}

const DEFAULT_TARGET_WEIGHTS: UsTargetWeight[] = [
  { symbol: 'VOO', name: 'Vanguard S&P 500 ETF', exchange: 'arca', isETF: true, weight: 50 },
  { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'nasdaq', isETF: false, weight: 25 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'nasdaq', isETF: false, weight: 25 },
]

const DEFAULT_CONFIG: UsAllocationConfig = {
  id: 'default',
  name: '美股預設配置',
  targetWeights: DEFAULT_TARGET_WEIGHTS,
  rebalanceIntervalMonths: 3,
  rebalanceDayOfMonth: 1,
  nextRebalanceDate: calcUsNextRebalanceDate(3, 1),
}

const DEFAULT_SETTINGS: UsSettings = {
  profileId: 'standard',
  customFees: DEFAULT_CUSTOM_FEES,
  lastFxRate: 32,
}

function buildDefaultStore(): UsPortfolioStore {
  return {
    accounts: [],
    holdings: [],
    transactions: [],
    dividends: [],
    dividendEntryDates: {},
    allocationConfigs: [{ ...DEFAULT_CONFIG, nextRebalanceDate: calcUsNextRebalanceDate(3, 1) }],
    settings: DEFAULT_SETTINGS,
    lastUpdated: new Date().toISOString(),
  }
}

function migrateStore(parsed: Record<string, unknown>): UsPortfolioStore {
  const base = buildDefaultStore()
  const input = parsed as Partial<UsPortfolioStore>
  return {
    ...base,
    accounts: Array.isArray(input.accounts) ? input.accounts : [],
    holdings: Array.isArray(input.holdings) ? input.holdings : [],
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    dividends: Array.isArray(input.dividends) ? input.dividends : [],
    dividendEntryDates: input.dividendEntryDates ?? {},
    allocationConfigs: Array.isArray(input.allocationConfigs) && input.allocationConfigs.length > 0
      ? input.allocationConfigs
      : base.allocationConfigs,
    settings: {
      profileId: input.settings?.profileId ?? DEFAULT_SETTINGS.profileId,
      customFees: {
        buyRate: input.settings?.customFees?.buyRate ?? DEFAULT_CUSTOM_FEES.buyRate,
        buyMinUsd: input.settings?.customFees?.buyMinUsd ?? DEFAULT_CUSTOM_FEES.buyMinUsd,
        sellRate: input.settings?.customFees?.sellRate ?? DEFAULT_CUSTOM_FEES.sellRate,
        sellMinUsd: input.settings?.customFees?.sellMinUsd ?? DEFAULT_CUSTOM_FEES.sellMinUsd,
      },
      lastFxRate: input.settings?.lastFxRate ?? DEFAULT_SETTINGS.lastFxRate,
    },
    lastUpdated: input.lastUpdated ?? new Date().toISOString(),
  }
}

export function loadUsStore(): UsPortfolioStore {
  if (typeof window === 'undefined') return buildDefaultStore()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return buildDefaultStore()
    return migrateStore(JSON.parse(raw) as Record<string, unknown>)
  } catch {
    return buildDefaultStore()
  }
}

export function saveUsStore(store: UsPortfolioStore): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...store,
      lastUpdated: new Date().toISOString(),
    }))
  } catch {
    // ignore localStorage failures
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function addUsAccount(store: UsPortfolioStore, name: string, broker?: string): UsPortfolioStore {
  const account: UsAccount = { id: makeId('us_acc'), name, broker }
  return { ...store, accounts: [...store.accounts, account] }
}

export function updateUsAccount(store: UsPortfolioStore, id: string, patch: Partial<Omit<UsAccount, 'id'>>): UsPortfolioStore {
  return {
    ...store,
    accounts: store.accounts.map((account) => (account.id === id ? { ...account, ...patch } : account)),
  }
}

export function deleteUsAccount(store: UsPortfolioStore, id: string): UsPortfolioStore {
  return {
    ...store,
    accounts: store.accounts.filter((account) => account.id !== id),
    holdings: store.holdings.filter((holding) => holding.accountId !== id),
    transactions: store.transactions.filter((tx) => tx.accountId !== id),
    dividends: store.dividends.filter((dividend) => dividend.accountId !== id),
  }
}

export function upsertUsHolding(store: UsPortfolioStore, holding: UsHolding): UsPortfolioStore {
  const exists = store.holdings.findIndex((item) => item.accountId === holding.accountId && item.symbol === holding.symbol)
  const holdings = exists >= 0
    ? store.holdings.map((item, index) => (index === exists ? { ...item, ...holding } : item))
    : [...store.holdings, holding]
  return { ...store, holdings }
}

export function deleteUsHolding(store: UsPortfolioStore, accountId: string, symbol: string): UsPortfolioStore {
  return {
    ...store,
    holdings: store.holdings.filter((holding) => !(holding.accountId === accountId && holding.symbol === symbol)),
    transactions: store.transactions.filter((tx) => !(tx.accountId === accountId && tx.symbol === symbol)),
    dividends: store.dividends.filter((dividend) => !(dividend.accountId === accountId && dividend.symbol === symbol)),
  }
}

export function recalcUsHoldingFromTransactions(
  store: UsPortfolioStore,
  accountId: string,
  symbol: string,
): UsPortfolioStore {
  const transactions = store.transactions
    .filter((tx) => tx.accountId === accountId && tx.symbol === symbol)
    .sort((a, b) => a.date.localeCompare(b.date))

  let totalShares = 0
  let totalCostUsd = 0

  for (const tx of transactions) {
    if (tx.type === 'buy') {
      totalShares += tx.shares
      totalCostUsd += tx.shares * tx.priceUsd + tx.feeUsd
      continue
    }

    if (totalShares <= 0) continue
    const avgCostUsd = totalCostUsd / totalShares
    const sharesToRemove = Math.min(totalShares, tx.shares)
    totalShares -= sharesToRemove
    totalCostUsd -= avgCostUsd * sharesToRemove
  }

  if (totalShares <= 0) {
    return {
      ...store,
      holdings: store.holdings.filter((holding) => !(holding.accountId === accountId && holding.symbol === symbol)),
    }
  }

  const existing = store.holdings.find((holding) => holding.accountId === accountId && holding.symbol === symbol)
  const fallbackTarget = store.allocationConfigs.flatMap((config) => config.targetWeights).find((target) => target.symbol === symbol)
  const holding: UsHolding = {
    accountId,
    symbol,
    name: existing?.name ?? fallbackTarget?.name ?? symbol,
    exchange: existing?.exchange ?? fallbackTarget?.exchange ?? 'unknown',
    isETF: existing?.isETF ?? fallbackTarget?.isETF ?? false,
    shares: totalShares,
    avgCostUsd: totalCostUsd / totalShares,
  }

  return upsertUsHolding(store, holding)
}

export function addUsTransaction(store: UsPortfolioStore, tx: Omit<UsTransaction, 'id'>): UsPortfolioStore {
  const nextStore = {
    ...store,
    transactions: [...store.transactions, { ...tx, id: makeId('us_tx') }],
  }
  return recalcUsHoldingFromTransactions(nextStore, tx.accountId, tx.symbol)
}

export function deleteUsTransaction(store: UsPortfolioStore, txId: string): UsPortfolioStore {
  const tx = store.transactions.find((item) => item.id === txId)
  const nextStore = {
    ...store,
    transactions: store.transactions.filter((item) => item.id !== txId),
  }
  if (!tx) return nextStore
  return recalcUsHoldingFromTransactions(nextStore, tx.accountId, tx.symbol)
}

export function updateUsSettings(store: UsPortfolioStore, patch: Partial<UsSettings>): UsPortfolioStore {
  return {
    ...store,
    settings: {
      ...store.settings,
      ...patch,
      customFees: {
        ...store.settings.customFees,
        ...(patch.customFees ?? {}),
      },
    },
  }
}

export function addUsAllocationConfig(store: UsPortfolioStore, config: Omit<UsAllocationConfig, 'id'>): UsPortfolioStore {
  return {
    ...store,
    allocationConfigs: [...store.allocationConfigs, { ...config, id: makeId('us_cfg') }],
  }
}

export function updateUsAllocationConfig(store: UsPortfolioStore, id: string, patch: Partial<Omit<UsAllocationConfig, 'id'>>): UsPortfolioStore {
  return {
    ...store,
    allocationConfigs: store.allocationConfigs.map((config) => (config.id === id ? { ...config, ...patch } : config)),
  }
}

export function deleteUsAllocationConfig(store: UsPortfolioStore, id: string): UsPortfolioStore | false {
  if (store.allocationConfigs.length <= 1) return false
  if (store.accounts.some((account) => account.allocationConfigId === id)) return false
  return {
    ...store,
    allocationConfigs: store.allocationConfigs.filter((config) => config.id !== id),
  }
}

export function duplicateUsAllocationConfig(store: UsPortfolioStore, id: string): UsPortfolioStore {
  const config = store.allocationConfigs.find((item) => item.id === id)
  if (!config) return store
  return {
    ...store,
    allocationConfigs: [
      ...store.allocationConfigs,
      {
        ...config,
        id: makeId('us_cfg'),
        name: `${config.name}（複製）`,
        nextRebalanceDate: calcUsNextRebalanceDate(config.rebalanceIntervalMonths, config.rebalanceDayOfMonth),
      },
    ],
  }
}

export function setUsAccountAllocationConfig(store: UsPortfolioStore, accountId: string, configId: string | null): UsPortfolioStore {
  return {
    ...store,
    accounts: store.accounts.map((account) =>
      account.id === accountId ? { ...account, allocationConfigId: configId ?? undefined } : account,
    ),
  }
}

export function addUsDividend(store: UsPortfolioStore, record: Omit<UsDividendRecord, 'id'>): UsPortfolioStore {
  const exists = store.dividends.some((item) =>
    item.accountId === record.accountId && item.symbol === record.symbol && item.exDate === record.exDate,
  )
  if (exists) return store
  return {
    ...store,
    dividends: [...store.dividends, { ...record, id: makeId('us_div') }],
  }
}

export function bulkUpsertUsDividends(store: UsPortfolioStore, records: Omit<UsDividendRecord, 'id'>[]): UsPortfolioStore {
  return records.reduce((nextStore, record) => addUsDividend(nextStore, record), store)
}

export function deleteUsDividend(store: UsPortfolioStore, id: string): UsPortfolioStore {
  return { ...store, dividends: store.dividends.filter((item) => item.id !== id) }
}

export function setUsDividendEntryDate(store: UsPortfolioStore, accountId: string, symbol: string, date: string): UsPortfolioStore {
  const key = `${accountId}_${symbol}`
  const nextEntryDates = { ...store.dividendEntryDates }
  if (!date) {
    delete nextEntryDates[key]
  } else {
    nextEntryDates[key] = date
  }
  return { ...store, dividendEntryDates: nextEntryDates }
}

export function exportUsStoreAsJSON(store: UsPortfolioStore): string {
  return JSON.stringify(store, null, 2)
}

export function importUsStoreFromJSON(json: string): UsPortfolioStore | null {
  try {
    return migrateStore(JSON.parse(json) as Record<string, unknown>)
  } catch {
    return null
  }
}

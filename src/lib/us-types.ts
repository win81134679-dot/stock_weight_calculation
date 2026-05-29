export type UsExchange = 'nasdaq' | 'nyse' | 'arca' | 'bats' | 'unknown'
export type UsFeeProfileId = 'standard' | 'promo_no_min' | 'dca' | 'custom'

export interface UsCustomFeeSettings {
  buyRate: number
  buyMinUsd: number
  sellRate: number
  sellMinUsd: number
}

/** 美股法定規費（台灣複委託賣出時實際會收，金額極小） */
export interface UsRegulatoryFees {
  /** 是否計入 SEC 規費 + FINRA TAF（預設開啟，符合台灣複委託） */
  enabled: boolean
  /** SEC 規費費率（賣出金額 × 此率，2024 起約 0.0000278） */
  secFeeRate: number
  /** FINRA TAF（每股 USD，約 0.000166，單筆有上限 8.30） */
  finraTafPerShare: number
  /** FINRA TAF 單筆上限 USD */
  finraTafMaxUsd: number
}

export interface UsSettings {
  profileId: UsFeeProfileId
  customFees: UsCustomFeeSettings
  lastFxRate: number
  /** 股利預扣稅率（美國對外國人預設 0.30） */
  dividendWithholdingRate: number
  /** 美股法定規費設定 */
  regulatoryFees: UsRegulatoryFees
  /** Discord 通知 webhook（與台股各自獨立） */
  discordWebhookUrl: string
  /** 提前幾天通知再平衡 */
  discordNotifyDaysBefore: number
}

export interface UsStockEntry {
  symbol: string
  name: string
  exchange: UsExchange
  priceUsd: number
  weight: number
  isETF: boolean
  hold: boolean
}

export interface UsStockResult {
  symbol: string
  name: string
  exchange: UsExchange
  priceUsd: number
  priceTwd: number
  weight: number
  isETF: boolean
  allocatedTwd: number
  allocatedUsd: number
  buyableShares: number
  actualCostUsd: number
  actualCostTwd: number
  buyFeeUsd: number
  buyFeeTwd: number
  sellFeeUsd: number
  sellFeeTwd: number
  displayShares: string
  minRequiredTwd: number
  insufficientFund: boolean
  hold: boolean
}

export interface UsPortfolioResult {
  totalFundTwd: number
  fxRate: number
  totalInvestedTwd: number
  totalInvestedUsd: number
  totalBuyFeeTwd: number
  totalBuyFeeUsd: number
  totalSellCostTwd: number
  totalSellCostUsd: number
  remainingCashTwd: number
  remainingCashUsd: number
  stocks: UsStockResult[]
}

export interface UsTopUpStockResult {
  symbol: string
  name: string
  exchange: UsExchange
  priceUsd: number
  priceTwd: number
  weight: number
  ratio: number
  isETF: boolean
  allocatedTwd: number
  allocatedUsd: number
  buyableShares: number
  actualCostUsd: number
  actualCostTwd: number
  buyFeeUsd: number
  buyFeeTwd: number
  displayShares: string
}

export interface UsTopUpResult {
  topUpAmountTwd: number
  fxRate: number
  totalWeight: number
  totalCostTwd: number
  totalCostUsd: number
  remainingCashTwd: number
  remainingCashUsd: number
  stocks: UsTopUpStockResult[]
}

export interface UsYahooQuote {
  symbol: string
  name: string
  exchange: UsExchange
  priceUsd: number
  prevCloseUsd: number
  currency: 'USD'
  isMarketOpen: boolean
  marketState: string
  isETF: boolean
}

export interface UsPriceCache {
  symbol: string
  name: string
  exchange: UsExchange
  priceUsd: number
  prevCloseUsd: number
  priceTwd: number
  prevCloseTwd: number
  currency: 'USD'
  isETF: boolean
  fetchedAt: number
  isMarketOpen: boolean
  marketState: string
  high52wUsd?: number
  low52wUsd?: number
}

export interface UsStockPriceResponse {
  stocks: UsYahooQuote[]
  fxRate: number
  fxSymbol: string
  fetchedAt: number
}

export interface UsAccount {
  id: string
  name: string
  broker?: string
  allocationConfigId?: string
}

export interface UsHolding {
  accountId: string
  symbol: string
  name: string
  exchange: UsExchange
  isETF: boolean
  shares: number
  avgCostUsd: number
}

export interface UsTransaction {
  id: string
  accountId: string
  symbol: string
  date: string
  type: 'buy' | 'sell'
  shares: number
  priceUsd: number
  feeUsd: number
  note?: string
}

export interface UsTargetWeight {
  symbol: string
  name: string
  exchange: UsExchange
  isETF: boolean
  weight: number
}

export interface UsAllocationConfig {
  id: string
  name: string
  description?: string
  targetWeights: UsTargetWeight[]
  rebalanceIntervalMonths: number
  rebalanceDayOfMonth: number
  nextRebalanceDate: string
}

export interface UsDividendRecord {
  id: string
  accountId: string
  symbol: string
  exDate: string
  cashPerShareUsd: number
  shares: number
  /** 稅前總配息 = cashPerShareUsd × shares */
  totalCashUsd: number
  /** 預扣稅率（記錄當下的稅率，預設 0.30） */
  withholdingRate: number
  /** 稅後實領 = totalCashUsd × (1 - withholdingRate) */
  netCashUsd: number
  source: 'auto' | 'manual'
  note?: string
}

/** 單帳戶 PnL 快照（USD/TWD 雙幣別） */
export interface UsAccountSnapshot {
  accountId: string
  totalCostUsd: number
  totalValueUsd: number
  totalPnlUsd: number
  totalCostTwd: number
  totalValueTwd: number
  totalPnlTwd: number
  pnlPct: number
}

/** 每日個股明細（附加於 UsPnLSnapshot） */
export interface UsStockDailySnap {
  symbol: string
  name: string
  shares: number
  valueUsd: number
  valueTwd: number
  costUsd: number
  pnlUsd: number
  pnlTwd: number
  /** 當日 Δ（vs 昨收）× 股數，USD */
  todayDeltaUsd: number
  /** 當日漲跌 %（prevClose-based） */
  todayDeltaPct: number
}

/** PnL 快照（所有帳戶 + 合併，含當下匯率） */
export interface UsPnLSnapshot {
  date: string                        // ISO datetime
  fxRate: number                      // 當下 USD/TWD 匯率
  accounts: UsAccountSnapshot[]
  combinedCostUsd: number
  combinedValueUsd: number
  combinedPnlUsd: number
  combinedCostTwd: number
  combinedValueTwd: number
  combinedPnlTwd: number
  combinedPnlPct: number
  stocks?: UsStockDailySnap[]
}

export interface UsPortfolioStore {
  accounts: UsAccount[]
  holdings: UsHolding[]
  transactions: UsTransaction[]
  dividends: UsDividendRecord[]
  dividendEntryDates: Record<string, string>
  allocationConfigs: UsAllocationConfig[]
  snapshots: UsPnLSnapshot[]
  settings: UsSettings
  lastUpdated: string
}

export interface UsDeviationInvestResult {
  symbol: string
  name: string
  priceUsd: number
  priceTwd: number
  currentValueTwd: number
  currentWeight: number
  targetWeight: number
  deviation: number
  suggestedAmountTwd: number
  suggestedAmountUsd: number
  buyableShares: number
  actualCostUsd: number
  actualCostTwd: number
  buyFeeUsd: number
  buyFeeTwd: number
  displayShares: string
  newWeight: number
}

export interface UsDeviationInvestSummary {
  accountId: string
  investAmountTwd: number
  investAmountUsd: number
  totalAllocatedTwd: number
  totalAllocatedUsd: number
  remainingCashTwd: number
  remainingCashUsd: number
  results: UsDeviationInvestResult[]
}

export interface UsRebalanceAction {
  symbol: string
  name: string
  priceUsd: number
  priceTwd: number
  currentShares: number
  currentValueTwd: number
  currentWeight: number
  targetWeight: number
  action: 'buy' | 'sell' | 'hold'
  sharesChange: number
  estimatedAmountUsd: number
  estimatedAmountTwd: number
  feeUsd: number
  feeTwd: number
  newShares: number
  newWeight: number
}

export interface UsRebalancePlan {
  accountId: string
  totalCurrentValueTwd: number
  totalCurrentValueUsd: number
  actions: UsRebalanceAction[]
  totalBuyCostTwd: number
  totalBuyCostUsd: number
  totalSellReturnTwd: number
  totalSellReturnUsd: number
  netCashFlowTwd: number
  netCashFlowUsd: number
}

/** 單一持倉的損益明細（含目標/現行權重與偏差） */
export interface UsHoldingPnLRow {
  symbol: string
  name: string
  shares: number
  avgCostUsd: number
  priceUsd: number
  valueUsd: number
  valueTwd: number
  costUsd: number
  costTwd: number
  pnlUsd: number
  pnlTwd: number
  pnlPct: number
  currentWeight: number
  targetWeight: number
  deviation: number
}

/** 單帳戶損益（含稅後已領股利） */
export interface UsAccountPnL {
  accountId: string
  totalCostUsd: number
  totalValueUsd: number
  totalCostTwd: number
  totalValueTwd: number
  totalPnlUsd: number
  totalPnlTwd: number
  pnlPct: number
  /** 該帳戶稅後已領股利合計 USD */
  dividendsNetUsd: number
  holdings: UsHoldingPnLRow[]
}

/** 跨帳戶合併損益 */
export interface UsCombinedPnL {
  totalCostUsd: number
  totalValueUsd: number
  totalCostTwd: number
  totalValueTwd: number
  totalPnlUsd: number
  totalPnlTwd: number
  pnlPct: number
  dividendsNetUsd: number
  byAccount: UsAccountPnL[]
}

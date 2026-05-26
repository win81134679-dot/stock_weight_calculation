export type UsExchange = 'nasdaq' | 'nyse' | 'arca' | 'bats' | 'unknown'
export type UsFeeProfileId = 'standard' | 'promo_no_min' | 'dca' | 'custom'

export interface UsCustomFeeSettings {
  buyRate: number
  buyMinUsd: number
  sellRate: number
  sellMinUsd: number
}

export interface UsSettings {
  profileId: UsFeeProfileId
  customFees: UsCustomFeeSettings
  lastFxRate: number
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
  totalCashUsd: number
  source: 'auto' | 'manual'
  note?: string
}

export interface UsPortfolioStore {
  accounts: UsAccount[]
  holdings: UsHolding[]
  transactions: UsTransaction[]
  dividends: UsDividendRecord[]
  dividendEntryDates: Record<string, string>
  allocationConfigs: UsAllocationConfig[]
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

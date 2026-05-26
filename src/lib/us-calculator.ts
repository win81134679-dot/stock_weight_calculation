import {
  UsCustomFeeSettings,
  UsFeeProfileId,
  UsPortfolioResult,
  UsStockEntry,
  UsStockResult,
  UsTopUpResult,
  UsTopUpStockResult,
} from './us-types'

const PROFILE_PRESETS: Record<Exclude<UsFeeProfileId, 'custom'>, UsCustomFeeSettings> = {
  standard: {
    buyRate: 0.01,
    buyMinUsd: 39.9,
    sellRate: 0.01,
    sellMinUsd: 39.9,
  },
  promo_no_min: {
    buyRate: 0.001,
    buyMinUsd: 0,
    sellRate: 0.001,
    sellMinUsd: 0,
  },
  dca: {
    buyRate: 0.003,
    buyMinUsd: 0,
    sellRate: 0.005,
    sellMinUsd: 10,
  },
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100
}

function roundTwd(value: number): number {
  return Math.round(value)
}

function buildDisplayShares(shares: number): string {
  return `${shares.toLocaleString()} 股`
}

export function resolveUsFeeSettings(
  profileId: UsFeeProfileId,
  customFees: UsCustomFeeSettings,
): UsCustomFeeSettings {
  if (profileId === 'custom') return customFees
  return PROFILE_PRESETS[profileId]
}

export function calcUsFee(amountUsd: number, rate: number, minUsd: number): number {
  if (amountUsd <= 0) return 0
  return roundUsd(Math.max(amountUsd * rate, minUsd))
}

function calcBuyPlan(
  priceUsd: number,
  budgetUsd: number,
  feeRate: number,
  feeMinUsd: number,
): { shares: number; feeUsd: number; costUsd: number } {
  if (priceUsd <= 0 || budgetUsd <= 0) {
    return { shares: 0, feeUsd: 0, costUsd: 0 }
  }

  let shares = Math.floor(budgetUsd / priceUsd)
  while (shares > 0) {
    const amountUsd = shares * priceUsd
    const feeUsd = calcUsFee(amountUsd, feeRate, feeMinUsd)
    const costUsd = roundUsd(amountUsd + feeUsd)
    if (costUsd <= budgetUsd + 1e-8) {
      return { shares, feeUsd, costUsd }
    }
    shares -= 1
  }

  return { shares: 0, feeUsd: 0, costUsd: 0 }
}

function calcSingleStock(
  stock: UsStockEntry,
  totalFundTwd: number,
  fxRate: number,
  feeSettings: UsCustomFeeSettings,
): UsStockResult {
  const allocatedTwd = roundTwd(totalFundTwd * (stock.weight / 100))
  const allocatedUsd = fxRate > 0 ? roundUsd(allocatedTwd / fxRate) : 0
  const priceUsd = stock.priceUsd
  const priceTwd = roundTwd(priceUsd * fxRate)
  const minRequiredUsd = roundUsd(priceUsd + calcUsFee(priceUsd, feeSettings.buyRate, feeSettings.buyMinUsd))
  const minRequiredTwd = roundTwd(minRequiredUsd * fxRate)

  if (fxRate <= 0 || priceUsd <= 0 || allocatedUsd < minRequiredUsd) {
    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      priceUsd,
      priceTwd,
      weight: stock.weight,
      isETF: stock.isETF,
      allocatedTwd,
      allocatedUsd,
      buyableShares: 0,
      actualCostUsd: 0,
      actualCostTwd: 0,
      buyFeeUsd: 0,
      buyFeeTwd: 0,
      sellFeeUsd: 0,
      sellFeeTwd: 0,
      displayShares: '0 股',
      minRequiredTwd,
      insufficientFund: priceUsd > 0 && fxRate > 0,
      hold: stock.hold,
    }
  }

  const { shares, feeUsd, costUsd } = calcBuyPlan(priceUsd, allocatedUsd, feeSettings.buyRate, feeSettings.buyMinUsd)
  const amountUsd = roundUsd(shares * priceUsd)
  const sellFeeUsd = stock.hold ? 0 : calcUsFee(amountUsd, feeSettings.sellRate, feeSettings.sellMinUsd)

  return {
    symbol: stock.symbol,
    name: stock.name,
    exchange: stock.exchange,
    priceUsd,
    priceTwd,
    weight: stock.weight,
    isETF: stock.isETF,
    allocatedTwd,
    allocatedUsd,
    buyableShares: shares,
    actualCostUsd: costUsd,
    actualCostTwd: roundTwd(costUsd * fxRate),
    buyFeeUsd: feeUsd,
    buyFeeTwd: roundTwd(feeUsd * fxRate),
    sellFeeUsd,
    sellFeeTwd: roundTwd(sellFeeUsd * fxRate),
    displayShares: buildDisplayShares(shares),
    minRequiredTwd,
    insufficientFund: false,
    hold: stock.hold,
  }
}

export function calculateUsPortfolio(
  stocks: UsStockEntry[],
  totalFundTwd: number,
  fxRate: number,
  profileId: UsFeeProfileId,
  customFees: UsCustomFeeSettings,
): UsPortfolioResult {
  const feeSettings = resolveUsFeeSettings(profileId, customFees)
  const results = stocks.map((stock) => calcSingleStock(stock, totalFundTwd, fxRate, feeSettings))
  const totalInvestedUsd = roundUsd(results.reduce((sum, item) => sum + item.actualCostUsd, 0))
  const totalInvestedTwd = roundTwd(results.reduce((sum, item) => sum + item.actualCostTwd, 0))
  const totalBuyFeeUsd = roundUsd(results.reduce((sum, item) => sum + item.buyFeeUsd, 0))
  const totalBuyFeeTwd = roundTwd(results.reduce((sum, item) => sum + item.buyFeeTwd, 0))
  const totalSellCostUsd = roundUsd(results.reduce((sum, item) => sum + item.sellFeeUsd, 0))
  const totalSellCostTwd = roundTwd(results.reduce((sum, item) => sum + item.sellFeeTwd, 0))

  return {
    totalFundTwd,
    fxRate,
    totalInvestedTwd,
    totalInvestedUsd,
    totalBuyFeeTwd,
    totalBuyFeeUsd,
    totalSellCostTwd,
    totalSellCostUsd,
    remainingCashTwd: roundTwd(totalFundTwd - totalInvestedTwd),
    remainingCashUsd: roundUsd(fxRate > 0 ? (totalFundTwd - totalInvestedTwd) / fxRate : 0),
    stocks: results,
  }
}

export function calcUsMinFundTwd(
  stocks: Pick<UsStockEntry, 'priceUsd' | 'weight'>[],
  fxRate: number,
  profileId: UsFeeProfileId,
  customFees: UsCustomFeeSettings,
): number {
  if (fxRate <= 0) return 0
  const feeSettings = resolveUsFeeSettings(profileId, customFees)
  let maxRequired = 0
  for (const stock of stocks) {
    if (stock.priceUsd <= 0 || stock.weight <= 0) continue
    const oneShareUsd = roundUsd(stock.priceUsd + calcUsFee(stock.priceUsd, feeSettings.buyRate, feeSettings.buyMinUsd))
    const totalRequired = roundTwd((oneShareUsd * fxRate) / (stock.weight / 100))
    if (totalRequired > maxRequired) {
      maxRequired = totalRequired
    }
  }
  return maxRequired
}

export function calcUsTopUp(
  stocks: Omit<UsStockEntry, 'hold'>[],
  topUpAmountTwd: number,
  fxRate: number,
  profileId: UsFeeProfileId,
  customFees: UsCustomFeeSettings,
): UsTopUpResult {
  const validStocks = stocks.filter((stock) => stock.priceUsd > 0 && stock.weight > 0)
  const totalWeight = validStocks.reduce((sum, stock) => sum + stock.weight, 0)
  if (validStocks.length === 0 || totalWeight <= 0 || topUpAmountTwd <= 0 || fxRate <= 0) {
    return {
      topUpAmountTwd,
      fxRate,
      totalWeight,
      totalCostTwd: 0,
      totalCostUsd: 0,
      remainingCashTwd: topUpAmountTwd,
      remainingCashUsd: roundUsd(fxRate > 0 ? topUpAmountTwd / fxRate : 0),
      stocks: [],
    }
  }

  const feeSettings = resolveUsFeeSettings(profileId, customFees)

  const results: UsTopUpStockResult[] = validStocks.map((stock) => {
    const ratio = stock.weight / totalWeight
    const allocatedTwd = roundTwd(topUpAmountTwd * ratio)
    const allocatedUsd = roundUsd(allocatedTwd / fxRate)
    const { shares, feeUsd, costUsd } = calcBuyPlan(
      stock.priceUsd,
      allocatedUsd,
      feeSettings.buyRate,
      feeSettings.buyMinUsd,
    )

    return {
      symbol: stock.symbol,
      name: stock.name,
      exchange: stock.exchange,
      priceUsd: stock.priceUsd,
      priceTwd: roundTwd(stock.priceUsd * fxRate),
      weight: stock.weight,
      ratio,
      isETF: stock.isETF,
      allocatedTwd,
      allocatedUsd,
      buyableShares: shares,
      actualCostUsd: costUsd,
      actualCostTwd: roundTwd(costUsd * fxRate),
      buyFeeUsd: feeUsd,
      buyFeeTwd: roundTwd(feeUsd * fxRate),
      displayShares: buildDisplayShares(shares),
    }
  })

  const totalCostUsd = roundUsd(results.reduce((sum, item) => sum + item.actualCostUsd, 0))
  const totalCostTwd = roundTwd(results.reduce((sum, item) => sum + item.actualCostTwd, 0))

  return {
    topUpAmountTwd,
    fxRate,
    totalWeight,
    totalCostTwd,
    totalCostUsd,
    remainingCashTwd: roundTwd(topUpAmountTwd - totalCostTwd),
    remainingCashUsd: roundUsd((topUpAmountTwd - totalCostTwd) / fxRate),
    stocks: results,
  }
}

export function formatUsd(amount: number): string {
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatTwd(amount: number): string {
  return Math.round(amount).toLocaleString('zh-TW')
}

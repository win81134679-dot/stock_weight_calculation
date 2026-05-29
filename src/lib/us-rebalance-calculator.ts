import {
  UsAccountPnL,
  UsAllocationConfig,
  UsCombinedPnL,
  UsCustomFeeSettings,
  UsDeviationInvestResult,
  UsDeviationInvestSummary,
  UsDividendRecord,
  UsFeeProfileId,
  UsHolding,
  UsHoldingPnLRow,
  UsPortfolioStore,
  UsPriceCache,
  UsRebalanceAction,
  UsRebalancePlan,
  UsRegulatoryFees,
  UsTargetWeight,
  UsTransaction,
} from './us-types'
import {
  calcUsFee,
  calcUsRegulatorySellFee,
  DEFAULT_US_REGULATORY_FEES,
  resolveUsFeeSettings,
} from './us-calculator'

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100
}

function roundTwd(value: number): number {
  return Math.round(value)
}

function safePct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}

function buildDisplayShares(shares: number): string {
  return `${shares.toLocaleString()} 股`
}

export interface UsHoldingSummaryRow {
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
  /** 今日漲跌 %（現價 vs 昨收） */
  todayChangePct: number
  /** 今日該檔持倉資產變化 USD（(現價-昨收) × 股數） */
  todayDeltaUsd: number
}

export interface UsAccountSummary {
  accountId: string
  accountName: string
  totalValueUsd: number
  totalValueTwd: number
  totalCostUsd: number
  totalCostTwd: number
  totalPnlUsd: number
  totalPnlTwd: number
  totalPnlPct: number
  holdings: UsHoldingSummaryRow[]
}

function getHoldingPrice(prices: Record<string, UsPriceCache>, symbol: string) {
  return prices[symbol]
}

export function calcUsAccountSummary(
  accountId: string,
  accountName: string,
  holdings: UsHolding[],
  prices: Record<string, UsPriceCache>,
  targetWeights: UsTargetWeight[],
): UsAccountSummary {
  const accountHoldings = holdings.filter((holding) => holding.accountId === accountId)
  const rows = accountHoldings.map((holding) => {
    const price = getHoldingPrice(prices, holding.symbol)
    const priceUsd = price?.priceUsd ?? 0
    const valueUsd = roundUsd(holding.shares * priceUsd)
    const valueTwd = roundTwd(price?.priceTwd ? holding.shares * price.priceTwd : 0)
    const costUsd = roundUsd(holding.shares * holding.avgCostUsd)
    const costTwd = roundTwd(price ? holding.shares * holding.avgCostUsd * (price.priceTwd / Math.max(price.priceUsd, 0.0001)) : 0)
    const targetWeight = targetWeights.find((target) => target.symbol === holding.symbol)?.weight ?? 0
    const prevCloseUsd = price?.prevCloseUsd ?? 0
    const todayChangePct = prevCloseUsd > 0 ? ((priceUsd - prevCloseUsd) / prevCloseUsd) * 100 : 0
    const todayDeltaUsd = prevCloseUsd > 0 ? roundUsd((priceUsd - prevCloseUsd) * holding.shares) : 0
    return {
      symbol: holding.symbol,
      name: holding.name,
      shares: holding.shares,
      avgCostUsd: holding.avgCostUsd,
      priceUsd,
      valueUsd,
      valueTwd,
      costUsd,
      costTwd,
      pnlUsd: roundUsd(valueUsd - costUsd),
      pnlTwd: roundTwd(valueTwd - costTwd),
      pnlPct: costUsd > 0 ? ((valueUsd - costUsd) / costUsd) * 100 : 0,
      currentWeight: 0,
      targetWeight,
      todayChangePct,
      todayDeltaUsd,
    }
  })

  const totalValueUsd = roundUsd(rows.reduce((sum, row) => sum + row.valueUsd, 0))
  const totalValueTwd = roundTwd(rows.reduce((sum, row) => sum + row.valueTwd, 0))
  const totalCostUsd = roundUsd(rows.reduce((sum, row) => sum + row.costUsd, 0))
  const totalCostTwd = roundTwd(rows.reduce((sum, row) => sum + row.costTwd, 0))

  const normalized = rows.map((row) => ({
    ...row,
    currentWeight: safePct(row.valueTwd, totalValueTwd),
  }))

  return {
    accountId,
    accountName,
    totalValueUsd,
    totalValueTwd,
    totalCostUsd,
    totalCostTwd,
    totalPnlUsd: roundUsd(totalValueUsd - totalCostUsd),
    totalPnlTwd: roundTwd(totalValueTwd - totalCostTwd),
    totalPnlPct: totalCostUsd > 0 ? ((totalValueUsd - totalCostUsd) / totalCostUsd) * 100 : 0,
    holdings: normalized,
  }
}

export function calcUsCombinedSummary(
  store: UsPortfolioStore,
  prices: Record<string, UsPriceCache>,
): UsAccountSummary[] {
  return store.accounts.map((account) => {
    const config = resolveUsAccountConfig(account.id, store.allocationConfigs, store.accounts)
    return calcUsAccountSummary(account.id, account.name, store.holdings, prices, config.targetWeights)
  })
}

export function calcUsDeviationInvestment(
  accountId: string,
  holdings: UsHolding[],
  prices: Record<string, UsPriceCache>,
  targetWeights: UsTargetWeight[],
  investAmountTwd: number,
  fxRate: number,
  profileId: UsFeeProfileId,
  customFees: UsCustomFeeSettings,
): UsDeviationInvestSummary {
  const feeSettings = resolveUsFeeSettings(profileId, customFees)
  const accountHoldings = holdings.filter((holding) => holding.accountId === accountId)
  const currentTotalValueTwd = accountHoldings.reduce((sum, holding) => {
    const price = prices[holding.symbol]?.priceTwd ?? 0
    return sum + holding.shares * price
  }, 0)

  const futureTotalTwd = currentTotalValueTwd + investAmountTwd
  const totalGap = targetWeights.reduce((sum, target) => {
    const holding = accountHoldings.find((item) => item.symbol === target.symbol)
    const priceTwd = prices[target.symbol]?.priceTwd ?? 0
    const currentValueTwd = (holding?.shares ?? 0) * priceTwd
    const targetValueTwd = futureTotalTwd * (target.weight / 100)
    return sum + Math.max(0, targetValueTwd - currentValueTwd)
  }, 0)

  const results: UsDeviationInvestResult[] = targetWeights.map((target) => {
    const holding = accountHoldings.find((item) => item.symbol === target.symbol)
    const price = prices[target.symbol]
    const priceUsd = price?.priceUsd ?? 0
    const priceTwd = price?.priceTwd ?? 0
    const currentShares = holding?.shares ?? 0
    const currentValueTwd = currentShares * priceTwd
    const currentWeight = safePct(currentValueTwd, currentTotalValueTwd)

    if (priceUsd <= 0 || priceTwd <= 0 || fxRate <= 0 || investAmountTwd <= 0) {
      return {
        symbol: target.symbol,
        name: target.name,
        priceUsd,
        priceTwd,
        currentValueTwd,
        currentWeight,
        targetWeight: target.weight,
        deviation: currentWeight - target.weight,
        suggestedAmountTwd: 0,
        suggestedAmountUsd: 0,
        buyableShares: 0,
        actualCostUsd: 0,
        actualCostTwd: 0,
        buyFeeUsd: 0,
        buyFeeTwd: 0,
        displayShares: '0 股',
        newWeight: currentWeight,
      }
    }

    const targetValueTwd = futureTotalTwd * (target.weight / 100)
    const gapTwd = Math.max(0, targetValueTwd - currentValueTwd)
    const suggestedAmountTwd = totalGap > 0 ? roundTwd(investAmountTwd * (gapTwd / totalGap)) : roundTwd(investAmountTwd / Math.max(targetWeights.length, 1))
    const suggestedAmountUsd = roundUsd(suggestedAmountTwd / fxRate)

    let shares = Math.floor(suggestedAmountUsd / Math.max(priceUsd, 0.0001))
    while (shares > 0) {
      const amountUsd = shares * priceUsd
      const feeUsd = calcUsFee(amountUsd, feeSettings.buyRate, feeSettings.buyMinUsd)
      const costUsd = roundUsd(amountUsd + feeUsd)
      if (costUsd <= suggestedAmountUsd + 1e-8) {
        break
      }
      shares -= 1
    }

    const amountUsd = roundUsd(shares * priceUsd)
    const buyFeeUsd = calcUsFee(amountUsd, feeSettings.buyRate, feeSettings.buyMinUsd)
    const actualCostUsd = shares > 0 ? roundUsd(amountUsd + buyFeeUsd) : 0
    const actualCostTwd = roundTwd(actualCostUsd * fxRate)
    const newWeight = safePct((currentShares + shares) * priceTwd, futureTotalTwd)

    return {
      symbol: target.symbol,
      name: target.name,
      priceUsd,
      priceTwd,
      currentValueTwd,
      currentWeight,
      targetWeight: target.weight,
      deviation: currentWeight - target.weight,
      suggestedAmountTwd,
      suggestedAmountUsd,
      buyableShares: shares,
      actualCostUsd,
      actualCostTwd,
      buyFeeUsd,
      buyFeeTwd: roundTwd(buyFeeUsd * fxRate),
      displayShares: buildDisplayShares(shares),
      newWeight,
    }
  })

  const totalAllocatedUsd = roundUsd(results.reduce((sum, result) => sum + result.actualCostUsd, 0))
  const totalAllocatedTwd = roundTwd(results.reduce((sum, result) => sum + result.actualCostTwd, 0))

  return {
    accountId,
    investAmountTwd,
    investAmountUsd: roundUsd(fxRate > 0 ? investAmountTwd / fxRate : 0),
    totalAllocatedTwd,
    totalAllocatedUsd,
    remainingCashTwd: roundTwd(investAmountTwd - totalAllocatedTwd),
    remainingCashUsd: roundUsd(fxRate > 0 ? (investAmountTwd - totalAllocatedTwd) / fxRate : 0),
    results,
  }
}

export function calcUsQuarterlyRebalance(
  accountId: string,
  holdings: UsHolding[],
  prices: Record<string, UsPriceCache>,
  targetWeights: UsTargetWeight[],
  fxRate: number,
  profileId: UsFeeProfileId,
  customFees: UsCustomFeeSettings,
  regulatoryFees: UsRegulatoryFees = DEFAULT_US_REGULATORY_FEES,
): UsRebalancePlan {
  const feeSettings = resolveUsFeeSettings(profileId, customFees)
  const accountHoldings = holdings.filter((holding) => holding.accountId === accountId)
  const totalCurrentValueTwd = accountHoldings.reduce((sum, holding) => {
    const priceTwd = prices[holding.symbol]?.priceTwd ?? 0
    return sum + holding.shares * priceTwd
  }, 0)

  const actions: UsRebalanceAction[] = targetWeights.map((target) => {
    const holding = accountHoldings.find((item) => item.symbol === target.symbol)
    const price = prices[target.symbol]
    const priceUsd = price?.priceUsd ?? 0
    const priceTwd = price?.priceTwd ?? 0
    const currentShares = holding?.shares ?? 0
    const currentValueTwd = currentShares * priceTwd
    const currentWeight = safePct(currentValueTwd, totalCurrentValueTwd)

    if (priceUsd <= 0 || priceTwd <= 0) {
      return {
        symbol: target.symbol,
        name: target.name,
        priceUsd,
        priceTwd,
        currentShares,
        currentValueTwd,
        currentWeight,
        targetWeight: target.weight,
        action: 'hold',
        sharesChange: 0,
        estimatedAmountUsd: 0,
        estimatedAmountTwd: 0,
        feeUsd: 0,
        feeTwd: 0,
        newShares: currentShares,
        newWeight: currentWeight,
      }
    }

    const targetValueTwd = totalCurrentValueTwd * (target.weight / 100)
    const diffTwd = targetValueTwd - currentValueTwd
    const diffShares = Math.round(diffTwd / priceTwd)

    if (diffShares === 0) {
      return {
        symbol: target.symbol,
        name: target.name,
        priceUsd,
        priceTwd,
        currentShares,
        currentValueTwd,
        currentWeight,
        targetWeight: target.weight,
        action: 'hold',
        sharesChange: 0,
        estimatedAmountUsd: 0,
        estimatedAmountTwd: 0,
        feeUsd: 0,
        feeTwd: 0,
        newShares: currentShares,
        newWeight: currentWeight,
      }
    }

    if (diffShares > 0) {
      const estimatedAmountUsd = roundUsd(diffShares * priceUsd)
      const feeUsd = calcUsFee(estimatedAmountUsd, feeSettings.buyRate, feeSettings.buyMinUsd)
      const estimatedAmountTwd = roundTwd(estimatedAmountUsd * fxRate)
      return {
        symbol: target.symbol,
        name: target.name,
        priceUsd,
        priceTwd,
        currentShares,
        currentValueTwd,
        currentWeight,
        targetWeight: target.weight,
        action: 'buy',
        sharesChange: diffShares,
        estimatedAmountUsd,
        estimatedAmountTwd,
        feeUsd,
        feeTwd: roundTwd(feeUsd * fxRate),
        newShares: currentShares + diffShares,
        newWeight: safePct((currentShares + diffShares) * priceTwd, totalCurrentValueTwd),
      }
    }

    const sellShares = Math.abs(diffShares)
    const estimatedAmountUsd = roundUsd(sellShares * priceUsd)
    const brokerFeeUsd = calcUsFee(estimatedAmountUsd, feeSettings.sellRate, feeSettings.sellMinUsd)
    const regFeeUsd = calcUsRegulatorySellFee(estimatedAmountUsd, sellShares, regulatoryFees)
    const feeUsd = roundUsd(brokerFeeUsd + regFeeUsd)
    const estimatedAmountTwd = roundTwd(estimatedAmountUsd * fxRate)
    return {
      symbol: target.symbol,
      name: target.name,
      priceUsd,
      priceTwd,
      currentShares,
      currentValueTwd,
      currentWeight,
      targetWeight: target.weight,
      action: 'sell',
      sharesChange: -sellShares,
      estimatedAmountUsd,
      estimatedAmountTwd,
      feeUsd,
      feeTwd: roundTwd(feeUsd * fxRate),
      newShares: currentShares - sellShares,
      newWeight: safePct((currentShares - sellShares) * priceTwd, totalCurrentValueTwd),
    }
  })

  const totalBuyCostUsd = roundUsd(actions.filter((action) => action.action === 'buy').reduce((sum, action) => sum + action.estimatedAmountUsd + action.feeUsd, 0))
  const totalSellReturnUsd = roundUsd(actions.filter((action) => action.action === 'sell').reduce((sum, action) => sum + Math.max(0, action.estimatedAmountUsd - action.feeUsd), 0))
  const totalBuyCostTwd = roundTwd(actions.filter((action) => action.action === 'buy').reduce((sum, action) => sum + action.estimatedAmountTwd + action.feeTwd, 0))
  const totalSellReturnTwd = roundTwd(actions.filter((action) => action.action === 'sell').reduce((sum, action) => sum + Math.max(0, action.estimatedAmountTwd - action.feeTwd), 0))

  return {
    accountId,
    totalCurrentValueTwd,
    totalCurrentValueUsd: roundUsd(fxRate > 0 ? totalCurrentValueTwd / fxRate : 0),
    actions,
    totalBuyCostTwd,
    totalBuyCostUsd,
    totalSellReturnTwd,
    totalSellReturnUsd,
    netCashFlowTwd: roundTwd(totalBuyCostTwd - totalSellReturnTwd),
    netCashFlowUsd: roundUsd(totalBuyCostUsd - totalSellReturnUsd),
  }
}

export function calcUsNextRebalanceDate(intervalMonths: number, dayOfMonth: number): string {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + intervalMonths, dayOfMonth).toISOString().split('T')[0]
}

export function resolveUsAccountConfig(
  accountId: string,
  allocationConfigs: UsAllocationConfig[],
  accounts: Array<{ id: string; allocationConfigId?: string }>,
): UsAllocationConfig {
  const fallback = allocationConfigs[0] ?? {
    id: 'default',
    name: '預設配置',
    description: undefined,
    rebalanceIntervalMonths: 3,
    rebalanceDayOfMonth: 1,
    nextRebalanceDate: calcUsNextRebalanceDate(3, 1),
    targetWeights: [],
  }
  const account = accounts.find((item) => item.id === accountId)
  if (!account?.allocationConfigId) return fallback
  return allocationConfigs.find((config) => config.id === account.allocationConfigId) ?? fallback
}

export function findEarliestBuyDate(
  accountId: string,
  symbol: string,
  transactions: UsTransaction[],
): string {
  const dates = transactions
    .filter((tx) => tx.accountId === accountId && tx.symbol === symbol && tx.type === 'buy')
    .map((tx) => tx.date)
    .sort()
  return dates[0] ?? new Date().toISOString().split('T')[0]
}

// ============================================================
// 損益計算（對齊台股 calcAccountPnL / calcCombinedPnL）
// 採 USD 為主，TWD 以當前匯率換算；含稅後已領股利。
// ============================================================

export function calcUsAccountPnL(
  accountId: string,
  accountName: string,
  holdings: UsHolding[],
  prices: Record<string, UsPriceCache>,
  targetWeights: UsTargetWeight[],
  fxRate: number,
  dividends: UsDividendRecord[] = [],
): UsAccountPnL {
  const summary = calcUsAccountSummary(accountId, accountName, holdings, prices, targetWeights)

  const rows: UsHoldingPnLRow[] = summary.holdings.map((row) => {
    const targetWeight = targetWeights.find((target) => target.symbol === row.symbol)?.weight ?? 0
    return {
      symbol: row.symbol,
      name: row.name,
      shares: row.shares,
      avgCostUsd: row.avgCostUsd,
      priceUsd: row.priceUsd,
      valueUsd: row.valueUsd,
      valueTwd: row.valueTwd,
      costUsd: row.costUsd,
      costTwd: row.costTwd,
      pnlUsd: row.pnlUsd,
      pnlTwd: row.pnlTwd,
      pnlPct: row.pnlPct,
      currentWeight: row.currentWeight,
      targetWeight,
      deviation: row.currentWeight - targetWeight,
    }
  })

  const dividendsNetUsd = roundUsd(
    dividends
      .filter((dividend) => dividend.accountId === accountId)
      .reduce((sum, dividend) => sum + (dividend.netCashUsd ?? 0), 0),
  )

  return {
    accountId,
    totalCostUsd: summary.totalCostUsd,
    totalValueUsd: summary.totalValueUsd,
    totalCostTwd: summary.totalCostTwd,
    totalValueTwd: summary.totalValueTwd,
    totalPnlUsd: summary.totalPnlUsd,
    totalPnlTwd: summary.totalPnlTwd,
    pnlPct: summary.totalPnlPct,
    dividendsNetUsd,
    holdings: rows,
  }
}

export function calcUsCombinedPnL(
  store: UsPortfolioStore,
  prices: Record<string, UsPriceCache>,
  fxRate: number,
): UsCombinedPnL {
  const byAccount = store.accounts.map((account) => {
    const config = resolveUsAccountConfig(account.id, store.allocationConfigs, store.accounts)
    return calcUsAccountPnL(
      account.id,
      account.name,
      store.holdings,
      prices,
      config.targetWeights,
      fxRate,
      store.dividends,
    )
  })

  const totalCostUsd = roundUsd(byAccount.reduce((sum, account) => sum + account.totalCostUsd, 0))
  const totalValueUsd = roundUsd(byAccount.reduce((sum, account) => sum + account.totalValueUsd, 0))
  const totalCostTwd = roundTwd(byAccount.reduce((sum, account) => sum + account.totalCostTwd, 0))
  const totalValueTwd = roundTwd(byAccount.reduce((sum, account) => sum + account.totalValueTwd, 0))
  const totalPnlUsd = roundUsd(totalValueUsd - totalCostUsd)
  const totalPnlTwd = roundTwd(totalValueTwd - totalCostTwd)
  const dividendsNetUsd = roundUsd(byAccount.reduce((sum, account) => sum + account.dividendsNetUsd, 0))

  return {
    totalCostUsd,
    totalValueUsd,
    totalCostTwd,
    totalValueTwd,
    totalPnlUsd,
    totalPnlTwd,
    pnlPct: totalCostUsd > 0 ? (totalPnlUsd / totalCostUsd) * 100 : 0,
    dividendsNetUsd,
    byAccount,
  }
}

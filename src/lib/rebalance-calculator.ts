/**
 * rebalance-calculator.ts
 * Core math for deviation-correction investment and quarterly rebalancing.
 */

import {
  Holding,
  TargetWeight,
  Transaction,
  DeviationInvestResult,
  DeviationInvestSummary,
  RebalanceAction,
  RebalancePlan,
  PriceCache,
} from './types'
import { calcFee, getActualFeeRate } from './calculator'

const MIN_FEE = 20
const ETF_TAX_RATE = 0.001
const STOCK_TAX_RATE = 0.003

// ============================================================
// Shared helpers
// ============================================================

function buildDisplayShares(lots: number, remaining: number): string {
  if (lots === 0 && remaining === 0) return '0股'
  if (lots === 0) return `${remaining}股`
  if (remaining === 0) return `${lots}張`
  return `${lots}張${remaining}股`
}

function safePct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}

// ============================================================
// 偏差修正投入試算
// ============================================================

/**
 * 偏差修正法：將本次投入金額優先分配給「偏離目標最多的標的」
 *
 * 演算法：
 * 1. 計算各標的「目標市值」= (現有總資產 + 投入額) × 目標比重
 * 2. 各標的缺口 = max(0, 目標市值 - 目前市值)
 * 3. 按缺口比例分配投入額
 * 4. 計算可買股數（含手續費）
 */
export function calcDeviationInvestment(
  accountId: string,
  holdings: Holding[],
  prices: Record<string, PriceCache>,
  targetWeights: TargetWeight[],
  investAmount: number,
  discount: number
): DeviationInvestSummary {
  const acctHoldings = holdings.filter((h) => h.accountId === accountId)

  // Current total value (only for holdings matching target codes)
  const currentTotalValue = acctHoldings.reduce((sum, h) => {
    const p = prices[h.code]?.price ?? 0
    return sum + h.shares * p
  }, 0)

  const futureTotal = currentTotalValue + investAmount
  const feeRate = getActualFeeRate(discount)

  // Calculate gaps
  const gaps = targetWeights.map((tw) => {
    const holding = acctHoldings.find((h) => h.code === tw.code)
    const price = prices[tw.code]?.price ?? 0
    const currentValue = (holding?.shares ?? 0) * price
    const targetValue = futureTotal * (tw.weight / 100)
    const gap = Math.max(0, targetValue - currentValue)
    return { tw, holding, price, currentValue, gap }
  })

  const totalGap = gaps.reduce((s, g) => s + g.gap, 0)

  let totalAllocated = 0

  const results: DeviationInvestResult[] = gaps.map(({ tw, holding, price, currentValue, gap }) => {
    const currentShares = holding?.shares ?? 0

    if (price <= 0 || investAmount <= 0) {
      const currentWeight = safePct(currentValue, currentTotalValue)
      return {
        code: tw.code,
        name: tw.name,
        price,
        currentValue,
        currentWeight,
        targetWeight: tw.weight,
        deviation: currentWeight - tw.weight,
        suggestedAmount: 0,
        buyableShares: 0,
        lots: 0,
        remainingShares: 0,
        actualCost: 0,
        buyFee: 0,
        displayShares: '0股',
        newWeight: currentWeight,
      }
    }

    // Suggested allocation — proportional to gap
    const suggestedAmount = totalGap > 0 ? investAmount * (gap / totalGap) : investAmount / targetWeights.length

    // Calculate max buyable shares (fee-aware iteration)
    let shares = Math.floor(suggestedAmount / (price * (1 + feeRate)))
    if (shares < 0) shares = 0

    // Adjust down if over budget
    while (shares > 0) {
      const fee = Math.max(shares * price * feeRate, MIN_FEE)
      if (Math.round(shares * price) + Math.round(fee) <= suggestedAmount) break
      shares--
    }

    // Try one more share
    {
      const tryShares = shares + 1
      const fee = Math.max(tryShares * price * feeRate, MIN_FEE)
      if (Math.round(tryShares * price) + Math.round(fee) <= suggestedAmount) {
        shares = tryShares
      }
    }

    const buyFee = shares > 0 ? Math.max(Math.round(shares * price * feeRate), MIN_FEE) : 0
    const actualCost = shares > 0 ? Math.round(shares * price) + buyFee : 0
    const lots = Math.floor(shares / 1000)
    const remainingShares = shares % 1000

    totalAllocated += actualCost

    const newShares = currentShares + shares
    const newValue = newShares * price
    const newWeight = safePct(newValue, futureTotal)
    const currentWeight = safePct(currentValue, currentTotalValue)

    return {
      code: tw.code,
      name: tw.name,
      price,
      currentValue,
      currentWeight,
      targetWeight: tw.weight,
      deviation: currentWeight - tw.weight,
      suggestedAmount: Math.round(suggestedAmount),
      buyableShares: shares,
      lots,
      remainingShares,
      actualCost,
      buyFee,
      displayShares: buildDisplayShares(lots, remainingShares),
      newWeight,
    }
  })

  return {
    accountId,
    investAmount,
    totalAllocated,
    remainingCash: investAmount - totalAllocated,
    results,
  }
}

// ============================================================
// 季再平衡試算
// ============================================================

/**
 * 計算帳戶季再平衡所需買賣清單。
 * 目標：讓各標的比重回到 targetWeights。
 * 策略：先賣超重，再買欠重，盡量用賣出資金補買入。
 */
export function calcQuarterlyRebalance(
  accountId: string,
  holdings: Holding[],
  prices: Record<string, PriceCache>,
  targetWeights: TargetWeight[],
  discount: number
): RebalancePlan {
  const acctHoldings = holdings.filter((h) => h.accountId === accountId)

  const totalValue = acctHoldings.reduce((sum, h) => {
    const p = prices[h.code]?.price ?? 0
    return sum + h.shares * p
  }, 0)

  let totalBuyCost = 0
  let totalSellReturn = 0

  const actions: RebalanceAction[] = targetWeights.map((tw) => {
    const holding = acctHoldings.find((h) => h.code === tw.code)
    const price = prices[tw.code]?.price ?? 0
    const currentShares = holding?.shares ?? 0
    const currentValue = currentShares * price
    const targetValue = totalValue * (tw.weight / 100)
    const currentWeight = safePct(currentValue, totalValue)

    if (price <= 0) {
      return {
        code: tw.code,
        name: tw.name,
        price,
        currentShares,
        currentValue,
        currentWeight,
        targetWeight: tw.weight,
        action: 'hold' as const,
        sharesChange: 0,
        estimatedAmount: 0,
        fee: 0,
        tax: 0,
        totalCost: 0,
        newShares: currentShares,
        newWeight: currentWeight,
      }
    }

    const diffValue = targetValue - currentValue
    const diffShares = Math.round(diffValue / price)

    if (Math.abs(diffShares) === 0) {
      return {
        code: tw.code, name: tw.name, price,
        currentShares, currentValue, currentWeight,
        targetWeight: tw.weight,
        action: 'hold' as const,
        sharesChange: 0, estimatedAmount: 0,
        fee: 0, tax: 0, totalCost: 0,
        newShares: currentShares,
        newWeight: currentWeight,
      }
    }

    const taxRate = tw.isETF ? ETF_TAX_RATE : STOCK_TAX_RATE

    if (diffShares > 0) {
      // Buy
      const fee = calcFee(diffShares * price, discount)
      const estimatedAmount = Math.round(diffShares * price)
      totalBuyCost += estimatedAmount + fee
      return {
        code: tw.code, name: tw.name, price,
        currentShares, currentValue, currentWeight,
        targetWeight: tw.weight,
        action: 'buy' as const,
        sharesChange: diffShares,
        estimatedAmount,
        fee,
        tax: 0,
        totalCost: estimatedAmount + fee,
        newShares: currentShares + diffShares,
        newWeight: safePct((currentShares + diffShares) * price, totalValue),
      }
    } else {
      // Sell
      const sellShares = Math.abs(diffShares)
      const estimatedAmount = Math.round(sellShares * price)
      const fee = calcFee(estimatedAmount, discount)
      const tax = Math.round(estimatedAmount * taxRate)
      const netReturn = estimatedAmount - fee - tax
      totalSellReturn += netReturn
      return {
        code: tw.code, name: tw.name, price,
        currentShares, currentValue, currentWeight,
        targetWeight: tw.weight,
        action: 'sell' as const,
        sharesChange: -sellShares,
        estimatedAmount,
        fee,
        tax,
        totalCost: -(netReturn),
        newShares: currentShares - sellShares,
        newWeight: safePct((currentShares - sellShares) * price, totalValue),
      }
    }
  })

  return {
    accountId,
    totalCurrentValue: totalValue,
    actions,
    totalBuyCost,
    totalSellReturn,
    netCashFlow: totalBuyCost - totalSellReturn,
  }
}

// ============================================================
// PNL 計算
// ============================================================

export interface AccountPnL {
  accountId: string
  totalCost: number
  totalValue: number
  totalFees: number
  totalPnl: number
  pnlPct: number
  holdings: {
    code: string
    name: string
    shares: number
    avgCost: number
    price: number
    value: number
    cost: number
    pnl: number
    pnlPct: number
    currentWeight: number
    targetWeight: number
    deviation: number
  }[]
}

/** 預估賣出費用 = 手續費（floor）+ 交易稅（floor）
 *  ETF 交易稅 0.1%；一般股票 0.3%
 *  手續費率固定 0.1425%（不套用折扣，與券商預估口徑一致）
 */
function estimateSellFee(value: number, isETF: boolean): number {
  const brokerage = Math.floor(value * 0.001425)
  const tax = Math.floor(value * (isETF ? 0.001 : 0.003))
  return brokerage + tax
}

export function calcAccountPnL(
  accountId: string,
  holdings: Holding[],
  prices: Record<string, PriceCache>,
  targetWeights: TargetWeight[],
  transactions: Transaction[] = []
): AccountPnL {
  const acctHoldings = holdings.filter((h) => h.accountId === accountId)

  const totalValue = acctHoldings.reduce((sum, h) => {
    return sum + h.shares * (prices[h.code]?.price ?? 0)
  }, 0)

  const totalCost = acctHoldings.reduce((sum, h) => {
    return sum + h.shares * h.avgCost
  }, 0)

  const holdingDetails = acctHoldings.map((h) => {
    const price = prices[h.code]?.price ?? 0
    const value = h.shares * price
    const cost = h.shares * h.avgCost
    const sellFee = price > 0 ? estimateSellFee(value, h.isETF) : 0
    const pnl = value - sellFee - cost
    const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
    const currentWeight = safePct(value, totalValue)
    const tw = targetWeights.find((t) => t.code === h.code)
    const targetWeight = tw?.weight ?? 0
    return {
      code: h.code,
      name: h.name,
      shares: h.shares,
      avgCost: h.avgCost,
      price,
      value,
      cost,
      pnl,
      pnlPct,
      currentWeight,
      targetWeight,
      deviation: currentWeight - targetWeight,
    }
  })

  const totalFees = transactions
    .filter((t) => t.accountId === accountId && t.type === 'buy')
    .reduce((s, t) => s + t.fee, 0)

  const totalPnl = holdingDetails.reduce((s, d) => s + d.pnl, 0)

  return {
    accountId,
    totalCost,
    totalValue,
    totalFees,
    totalPnl,
    pnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
    holdings: holdingDetails,
  }
}

export interface CombinedPnL {
  totalCost: number
  totalValue: number
  totalFees: number
  totalPnl: number
  pnlPct: number
  byAccount: AccountPnL[]
}

export function calcCombinedPnL(
  accountIds: string[],
  holdings: Holding[],
  prices: Record<string, PriceCache>,
  targetWeights: TargetWeight[],
  transactions: Transaction[] = []
): CombinedPnL {
  const byAccount = accountIds.map((id) =>
    calcAccountPnL(id, holdings, prices, targetWeights, transactions)
  )
  const totalCost = byAccount.reduce((s, a) => s + a.totalCost, 0)
  const totalValue = byAccount.reduce((s, a) => s + a.totalValue, 0)
  const totalFees = byAccount.reduce((s, a) => s + a.totalFees, 0)
  const totalPnl = byAccount.reduce((s, a) => s + a.totalPnl, 0)
  return {
    totalCost,
    totalValue,
    totalFees,
    totalPnl,
    pnlPct: totalCost > 0 ? (totalPnl / totalCost) * 100 : 0,
    byAccount,
  }
}

// ============================================================
// Rebalance date helpers
// ============================================================

export function calcNextRebalanceDateFrom(
  lastDate: string,
  intervalMonths: number,
  dayOfMonth: number
): string {
  const last = new Date(lastDate)
  const next = new Date(last.getFullYear(), last.getMonth() + intervalMonths, dayOfMonth)
  return next.toISOString().split('T')[0]
}

export function daysUntilRebalance(nextDateStr: string): number {
  const now = new Date()
  const next = new Date(nextDateStr)
  const diff = next.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

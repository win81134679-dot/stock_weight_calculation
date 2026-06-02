/**
 * target-value-rebalance.ts
 * 目標總市值配置演算法（含滑價保護）
 */

import {
  Holding,
  TargetWeight,
  HybridRebalanceAction,
  TargetValueRebalancePlan,
  SellEntry,
  HoldingComparison,
  PriceCache,
} from './types'
import { calcFee, getActualFeeRate, formatMoney } from './calculator'

const ETF_TAX_RATE = 0.001
const STOCK_TAX_RATE = 0.003

function safePct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0
}

/**
 * 計算賣出預估收入（供參考）
 */
export function calcEstimatedSellProceeds(
  shares: number,
  price: number,
  discount: number,
  isETF: boolean
): number {
  if (shares <= 0 || price <= 0) return 0
  const estimatedAmount = Math.round(shares * price)
  const fee = calcFee(estimatedAmount, discount)
  const taxRate = isETF ? ETF_TAX_RATE : STOCK_TAX_RATE
  const tax = Math.round(estimatedAmount * taxRate)
  return estimatedAmount - fee - tax
}

/**
 * 計算賣出建議（顯示所有配置標的，標註哪些需要減碼）
 */
export function calcSellSuggestions(
  accountId: string,
  holdings: Holding[],
  prices: Record<string, PriceCache>,
  targetWeights: TargetWeight[],
  targetTotalValue: number,
  discount: number
): SellEntry[] {
  const acctHoldings = holdings.filter((h) => h.accountId === accountId)

  // 計算目前總市值
  const currentTotalValue = acctHoldings.reduce((sum, h) => {
    const p = prices[h.code]?.price ?? 0
    return sum + h.shares * p
  }, 0)

  const suggestions: SellEntry[] = []

  // 遍歷所有配置標的（不只是需要賣出的）
  targetWeights.forEach((tw) => {
    const holding = acctHoldings.find((h) => h.code === tw.code)
    const price = prices[tw.code]?.price ?? 0

    const currentShares = holding?.shares ?? 0
    const currentValue = currentShares * price
    const currentWeight = safePct(currentValue, currentTotalValue)
    const targetValue = targetTotalValue * (tw.weight / 100)

    // 計算是否需要賣出
    let suggestedShares = 0
    let estimatedProceeds = 0

    if (price > 0 && currentValue > targetValue) {
      // 目前市值 > 目標市值 → 需要賣出
      const excessValue = currentValue - targetValue
      suggestedShares = Math.floor(excessValue / price)

      if (suggestedShares > 0) {
        estimatedProceeds = calcEstimatedSellProceeds(
          suggestedShares,
          price,
          discount,
          tw.isETF
        )
      }
    }

    // 加入所有標的（賣出、持有、買入都顯示）
    suggestions.push({
      code: tw.code,
      name: tw.name,
      currentShares,
      currentValue,
      currentWeight,
      targetWeight: tw.weight,
      suggestedShares,  // 0 表示不需賣出（持有或買入）
      estimatedProceeds,
      actualShares: undefined,
      actualProceeds: undefined,
    })
  })

  return suggestions
}

/**
 * 目標總市值配置：依目標總市值與目標權重計算買賣清單（含滑價保護）
 *
 * 核心邏輯：
 * 1. 計算換倉賣出總收入（使用者回填實際成交金額）
 * 2. 計算可用資金 = 實際賣出收入 + 外部投入
 * 3. 套用滑價保護（僅買入）：protectedFund = availableFund / (1 + slippageRate)
 * 4. 依目標權重分配資金，計算可買股數（在 protectedFund 限制下，避免違約交割）
 * 5. 計算持倉對比、交割款明細
 */
export function calcTargetValueRebalance(
  accountId: string,
  holdings: Holding[],
  prices: Record<string, PriceCache>,
  targetWeights: TargetWeight[],
  targetTotalValue: number,
  sellEntries: SellEntry[],
  externalFund: number,
  slippageRate: number,
  discount: number
): TargetValueRebalancePlan {
  const acctHoldings = holdings.filter((h) => h.accountId === accountId)

  // 1. 計算換倉賣出總收入（僅計算有實際回填的）
  const totalSellProceeds = sellEntries
    .filter(e => e.actualProceeds !== undefined && e.actualShares !== undefined)
    .reduce((sum, e) => sum + (e.actualProceeds || 0), 0)

  // 2. 計算目前總市值與總成本（扣除已賣出部位）
  const sellCodesMap = new Map(
    sellEntries
      .filter(e => e.actualShares !== undefined)
      .map(e => [e.code, e.actualShares || 0])
  )

  const remainingHoldings: Holding[] = acctHoldings.map(h => {
    const sellShares = sellCodesMap.get(h.code) || 0
    const remainingShares = h.shares - sellShares
    return {
      ...h,
      shares: Math.max(0, remainingShares)
    }
  }).filter(h => h.shares > 0)

  const currentTotalValue = remainingHoldings.reduce((sum, h) => {
    const p = prices[h.code]?.price ?? 0
    return sum + h.shares * p
  }, 0)

  const currentTotalCost = remainingHoldings.reduce((sum, h) => {
    return sum + Math.floor(h.shares * h.avgCost)
  }, 0)

  // 3. 計算可用資金
  const availableFund = totalSellProceeds + externalFund
  const protectedFund = slippageRate > 0 ? availableFund / (1 + slippageRate) : availableFund

  // 4. 依目標權重計算買入（在 protectedFund 限制下）
  let totalBuyCost = 0

  const actions: HybridRebalanceAction[] = targetWeights.map((tw) => {
    const holding = remainingHoldings.find((h) => h.code === tw.code)
    const price = prices[tw.code]?.price ?? 0
    const currentShares = holding?.shares ?? 0
    const currentValue = currentShares * price

    const targetValue = targetTotalValue * (tw.weight / 100)
    const currentWeight = safePct(currentValue, currentTotalValue)

    // 無報價或目標總市值為零
    if (price <= 0 || targetTotalValue <= 0) {
      return {
        code: tw.code,
        name: tw.name,
        price,
        currentShares,
        currentValue,
        currentWeight,
        targetWeight: tw.weight,
        targetValue: 0,
        action: 'hold' as const,
        sharesChange: 0,
        estimatedAmount: 0,
        fee: 0,
        tax: 0,
        totalCost: 0,
        newShares: currentShares,
        newValue: currentValue,
        newWeight: currentWeight,
        weightDeviation: currentWeight - tw.weight,
      }
    }

    const diffValue = targetValue - currentValue

    // 只處理買入（賣出已在 sellEntries 處理）
    if (diffValue <= 0) {
      // HOLD
      const newWeight = safePct(currentValue, targetTotalValue)
      return {
        code: tw.code,
        name: tw.name,
        price,
        currentShares,
        currentValue,
        currentWeight,
        targetWeight: tw.weight,
        targetValue,
        action: 'hold' as const,
        sharesChange: 0,
        estimatedAmount: 0,
        fee: 0,
        tax: 0,
        totalCost: 0,
        newShares: currentShares,
        newValue: currentValue,
        newWeight,
        weightDeviation: newWeight - tw.weight,
      }
    }

    // 套用滑價保護計算可買股數
    const maxBuyValue = protectedFund * (tw.weight / 100)  // 按權重分配保護後資金

    // 迭代法計算可買股數（確保含手續費後不超過預算）
    let buyShares = Math.floor(maxBuyValue / (price * (1 + getActualFeeRate(discount))))

    while (buyShares > 0) {
      const estimatedAmount = Math.round(buyShares * price)
      const fee = calcFee(estimatedAmount, discount)
      if (estimatedAmount + fee <= maxBuyValue) break
      buyShares--
    }

    if (buyShares <= 0) {
      // 資金不足，無法買入
      const newWeight = safePct(currentValue, targetTotalValue)
      return {
        code: tw.code,
        name: tw.name,
        price,
        currentShares,
        currentValue,
        currentWeight,
        targetWeight: tw.weight,
        targetValue,
        action: 'hold' as const,
        sharesChange: 0,
        estimatedAmount: 0,
        fee: 0,
        tax: 0,
        totalCost: 0,
        newShares: currentShares,
        newValue: currentValue,
        newWeight,
        weightDeviation: newWeight - tw.weight,
      }
    }

    // BUY
    const estimatedAmount = Math.round(buyShares * price)
    const fee = calcFee(estimatedAmount, discount)
    const totalCost = estimatedAmount + fee
    totalBuyCost += totalCost

    const newShares = currentShares + buyShares
    const newValue = newShares * price
    const newWeight = safePct(newValue, targetTotalValue)

    return {
      code: tw.code,
      name: tw.name,
      price,
      currentShares,
      currentValue,
      currentWeight,
      targetWeight: tw.weight,
      targetValue,
      action: 'buy' as const,
      sharesChange: buyShares,
      estimatedAmount,
      fee,
      tax: 0,
      totalCost,
      newShares,
      newValue,
      newWeight,
      weightDeviation: newWeight - tw.weight,
    }
  })

  // 5. 計算持倉對比
  const holdingComparisons: HoldingComparison[] = targetWeights.map(tw => {
    const beforeHolding = acctHoldings.find(h => h.code === tw.code)
    const beforeShares = beforeHolding?.shares ?? 0
    const beforeValue = beforeShares * (prices[tw.code]?.price ?? 0)
    const beforeWeight = safePct(beforeValue, acctHoldings.reduce((s, h) => s + h.shares * (prices[h.code]?.price ?? 0), 0))

    const action = actions.find(a => a.code === tw.code)
    const afterShares = action?.newShares ?? 0
    const afterValue = action?.newValue ?? 0
    const afterWeight = action?.newWeight ?? 0

    return {
      code: tw.code,
      name: tw.name,
      beforeShares,
      beforeValue,
      beforeWeight,
      afterShares,
      afterValue,
      afterWeight,
      sharesChange: afterShares - beforeShares,
      valueChange: afterValue - beforeValue,
      weightChange: afterWeight - beforeWeight,
    }
  })

  // 6. 彙總現金流
  const netCashFlow = totalBuyCost - totalSellProceeds
  const afterTotalCost = currentTotalCost + netCashFlow
  const afterTotalValue = actions.reduce((s, a) => s + a.newValue, 0)
  const afterUnrealizedPnL = afterTotalValue - afterTotalCost

  // 7. 警示檢查
  const warnings: string[] = []

  if (netCashFlow > availableFund) {
    warnings.push(
      `資金不足！買入需 $${formatMoney(totalBuyCost)}，但可用資金僅 $${formatMoney(availableFund)}，還需投入 $${formatMoney(netCashFlow - availableFund)}`
    )
  }

  if (Math.abs(afterTotalValue - targetTotalValue) > targetTotalValue * 0.05) {
    warnings.push(
      `調整後總市值 $${formatMoney(afterTotalValue)} 與目標 $${formatMoney(targetTotalValue)} 差距較大（超過 5%），可能因滑價保護或資金不足`
    )
  }

  return {
    accountId,
    currentTotalValue,
    currentTotalCost,
    currentHoldings: acctHoldings,
    targetTotalValue,
    externalFund,
    slippageRate,
    sellEntries,
    totalSellProceeds,
    availableFund,
    protectedFund,
    actions,
    totalBuyCost,
    totalSellReturn: totalSellProceeds,
    netCashFlow,
    holdingComparisons,
    afterTotalCost,
    afterTotalValue,
    afterUnrealizedPnL,
    warnings,
  }
}

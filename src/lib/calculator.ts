import { StockEntry, StockResult, PortfolioResult } from './types'

/** 台股手續費率 0.1425% */
const BASE_FEE_RATE = 0.001425

/** 最低手續費 20 元 */
const MIN_FEE = 20

/** 一般股票證交稅 0.3% */
const STOCK_TAX_RATE = 0.003

/** ETF 證交稅 0.1% */
const ETF_TAX_RATE = 0.001

/**
 * 計算實際手續費率
 * @param discount 折扣數（1~10），例如 6 = 6折 = 實際收 60%
 */
export function getActualFeeRate(discount: number): number {
  const d = Math.max(1, Math.min(10, discount))
  return BASE_FEE_RATE * (d / 10)
}

/**
 * 計算手續費（含最低 20 元限制）
 */
export function calcFee(amount: number, discount: number): number {
  const fee = amount * getActualFeeRate(discount)
  return fee < MIN_FEE ? MIN_FEE : Math.round(fee)
}

/**
 * 計算單一股票的買入結果
 */
function calcSingleStock(
  stock: StockEntry,
  totalFund: number,
  discount: number
): StockResult {
  const allocatedAmount = Math.floor(totalFund * (stock.weight / 100))
  const price = stock.price
  const feeRate = getActualFeeRate(discount)
  const taxRate = stock.isETF ? ETF_TAX_RATE : STOCK_TAX_RATE

  // 最低資金需求：1 股的價格 + 手續費（最低20元）
  const oneSharCost = price + Math.max(price * feeRate, MIN_FEE)
  const minRequired = Math.ceil(oneSharCost)

  // 資金不足判斷
  if (price <= 0 || allocatedAmount < minRequired) {
    return {
      code: stock.code,
      name: stock.name,
      price,
      weight: stock.weight,
      isETF: stock.isETF,
      allocatedAmount,
      buyableShares: 0,
      lots: 0,
      remainingShares: 0,
      actualCost: 0,
      buyFee: 0,
      sellFee: 0,
      sellTax: 0,
      sellTotalCost: 0,
      displayShares: '0 股',
      minRequired,
      insufficientFund: price > 0,
    }
  }

  // 計算可買股數：分配金額 / (股價 + 股價×手續費率)
  // 但手續費有最低 20 元限制，所以用迭代法
  let shares = Math.floor(allocatedAmount / (price * (1 + feeRate)))
  let fee = calcFee(shares * price, discount)
  let cost = shares * price + fee

  // 如果超過分配金額，減少股數
  while (cost > allocatedAmount && shares > 0) {
    shares--
    fee = calcFee(shares * price, discount)
    cost = shares * price + fee
  }

  // 嘗試再買一股看看是否還夠
  while (true) {
    const nextShares = shares + 1
    const nextFee = calcFee(nextShares * price, discount)
    const nextCost = nextShares * price + nextFee
    if (nextCost <= allocatedAmount) {
      shares = nextShares
      fee = nextFee
      cost = nextCost
    } else {
      break
    }
  }

  const lots = Math.floor(shares / 1000)
  const remainingShares = shares % 1000

  // 張股顯示
  let displayShares = ''
  if (lots > 0 && remainingShares > 0) {
    displayShares = `${lots} 張 ${remainingShares} 股`
  } else if (lots > 0) {
    displayShares = `${lots} 張`
  } else {
    displayShares = `${remainingShares} 股`
  }

  // 預估賣出成本
  const sellAmount = shares * price
  const sellFee = calcFee(sellAmount, discount)
  const sellTax = Math.round(sellAmount * taxRate)
  const sellTotalCost = sellFee + sellTax

  return {
    code: stock.code,
    name: stock.name,
    price,
    weight: stock.weight,
    isETF: stock.isETF,
    allocatedAmount,
    buyableShares: shares,
    lots,
    remainingShares,
    actualCost: cost,
    buyFee: fee,
    sellFee,
    sellTax,
    sellTotalCost,
    displayShares,
    minRequired,
    insufficientFund: false,
  }
}

/**
 * 計算完整投資組合
 */
export function calculatePortfolio(
  stocks: StockEntry[],
  totalFund: number,
  discount: number
): PortfolioResult {
  const results = stocks.map((s) => calcSingleStock(s, totalFund, discount))

  const totalInvested = results.reduce((sum, r) => sum + r.actualCost, 0)
  const totalBuyFee = results.reduce((sum, r) => sum + r.buyFee, 0)
  const totalSellCost = results.reduce((sum, r) => sum + r.sellTotalCost, 0)

  return {
    totalFund,
    totalInvested,
    totalBuyFee,
    totalSellCost,
    remainingCash: totalFund - totalInvested,
    stocks: results,
  }
}

/**
 * 計算投資組合最低所需資金
 * 對每檔有效股票，算出「以該權重至少買 1 股所需的總資金」，取最大值
 */
export function calcMinFund(
  stocks: { price: number; weight: number; isETF: boolean }[],
  discount: number
): number {
  const feeRate = getActualFeeRate(discount)
  let maxRequired = 0

  for (const s of stocks) {
    if (s.price <= 0 || s.weight <= 0) continue
    const oneShareCost = s.price + Math.max(s.price * feeRate, MIN_FEE)
    const totalRequired = Math.ceil(oneShareCost / (s.weight / 100))
    if (totalRequired > maxRequired) maxRequired = totalRequired
  }

  return maxRequired
}

/**
 * 格式化金額（加入千分位逗號）
 */
export function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('zh-TW')
}

/**
 * 格式化百分比
 */
export function formatPercent(rate: number, decimals = 4): string {
  return (rate * 100).toFixed(decimals) + '%'
}

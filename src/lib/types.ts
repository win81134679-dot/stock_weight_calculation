/** 單一股票輸入 */
export interface StockEntry {
  code: string
  name: string
  price: number
  weight: number // 0-100
  isETF: boolean
  exchange: 'tse' | 'otc'
  hold: boolean  // 繼續持倉（不計算賣出成本）
}

/** 單一股票計算結果 */
export interface StockResult {
  code: string
  name: string
  price: number
  weight: number
  isETF: boolean
  allocatedAmount: number   // 分配金額
  buyableShares: number     // 可買股數
  lots: number              // 張數（1000股=1張）
  remainingShares: number   // 零股
  actualCost: number        // 實際花費（含手續費）
  buyFee: number            // 買入手續費
  sellFee: number           // 預估賣出手續費
  sellTax: number           // 預估賣出證交稅
  sellTotalCost: number     // 預估賣出總成本
  displayShares: string     // 顯示用：如「2張300股」
  minRequired: number       // 最低資金需求（買1股+手續費）
  insufficientFund: boolean // 資金不足
  hold: boolean             // 繼續持倉
}

/** 整體計算結果 */
export interface PortfolioResult {
  totalFund: number
  totalInvested: number
  totalBuyFee: number
  totalSellCost: number
  remainingCash: number
  stocks: StockResult[]
}

/** 加碼計算 — 單一股票結果 */
export interface TopUpStockResult {
  code: string
  name: string
  price: number
  weight: number
  ratio: number           // 實際佔比 = weight / totalWeight
  isETF: boolean
  allocatedAmount: number
  buyableShares: number
  lots: number
  remainingShares: number
  actualCost: number
  buyFee: number
  displayShares: string
}

/** 加碼計算 — 整體結果 */
export interface TopUpResult {
  topUpAmount: number
  totalWeight: number
  totalCost: number
  remainingCash: number
  stocks: TopUpStockResult[]
}

/** Yahoo Finance 標準化後的單支股票報價（/api/stock-price 回傳格式） */
export interface YahooStockQuote {
  code: string          // 股票代碼（純數字或含字母，如 00988A）
  name: string          // 股票名稱
  price: number         // 最新成交價
  prevClose: number     // 昨收價
  exchange: 'tse' | 'otc'  // 上市 / 上櫃
  isMarketOpen: boolean // 盤中（marketState === 'REGULAR'）
}

// ============================================================
// 季再平衡管理 — 資料結構
// ============================================================

/** 券商帳戶 */
export interface Account {
  id: string
  name: string          // 例：「台新證券」
  color: string         // tailwind color key: 'blue'|'green'|'yellow'|'purple'|'pink'
  broker?: string       // 券商名稱（選填）
  allocationConfigId?: string  // 使用的目標配置 ID（undefined 表示使用第一個配置）
}

/** 持倉摘要（快速模式，每帳戶每 ETF 一筆） */
export interface Holding {
  accountId: string
  code: string
  name: string
  exchange: 'tse' | 'otc'
  isETF: boolean
  shares: number        // 總持股數
  avgCost: number       // 均價
}

/** 交易紀錄（詳細模式，逐筆） */
export interface Transaction {
  id: string
  accountId: string
  code: string
  date: string          // 'YYYY-MM-DD'
  type: 'buy' | 'sell'
  shares: number
  price: number
  fee: number
  note?: string
}

/** 目標配置權重（單一標的） */
export interface TargetWeight {
  code: string
  name: string
  exchange: 'tse' | 'otc'
  isETF: boolean
  weight: number        // 0-100，加總需等於 100
}

/** 一個目標配置，包含標的清單與專屬再平衡排程 */
export interface AllocationConfig {
  id: string
  name: string
  description?: string
  targetWeights: TargetWeight[]
  rebalanceIntervalMonths: number     // 每幾個月再平衡一次
  rebalanceDayOfMonth: number         // 每月幾號執行
  nextRebalanceDate: string           // 'YYYY-MM-DD'
}

/** 全域設定（不含目標配置，已移至 AllocationConfig） */
export interface RebalanceSettings {
  discordWebhookUrl: string
  discordNotifyDaysBefore: number     // 提前幾天通知
  discount: number                    // 手續費折扣
}

/** 單帳戶 PNL 快照 */
export interface AccountSnapshot {
  accountId: string
  totalCost: number
  totalValue: number
  totalPnl: number
  pnlPct: number
}

/** 每日個股明細（由 takeSnapshot 計算並附加於 PnLSnapshot） */
export interface StockDailySnap {
  code: string
  name: string
  shares: number
  value: number           // 持倉市值
  cost: number            // 持倉成本
  pnl: number             // 未實現損益（vs 均價）
  todayDelta: number      // 當日 Δ（vs prevClose）× shares
  todayDeltaPct: number   // 當日漲跌% (prevClose-based)
}

/** PNL 快照（所有帳戶 + 合併） */
export interface PnLSnapshot {
  date: string                        // ISO datetime
  accounts: AccountSnapshot[]
  combinedCost: number
  combinedValue: number
  combinedPnl: number
  combinedPnlPct: number
  stocks?: StockDailySnap[]           // 個股明細（新版快照才有）
}

/** 全域 Portfolio 儲存結構 */
export interface PortfolioStore {
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  snapshots: PnLSnapshot[]
  dividends: DividendRecord[]         // ETF 配息紀錄
  dividendEntryDates: Record<string, string>  // key: `${accountId}_${code}`, value: YYYY-MM-DD
  allocationConfigs: AllocationConfig[]  // 目標配置清單
  settings: RebalanceSettings
  lastUpdated: string                 // ISO datetime
}

/** 即時股價快取 */
export interface PriceCache {
  code: string
  name: string
  price: number
  prevClose: number                   // 昨收價 (y 欄位)
  exchange: 'tse' | 'otc'
  isETF: boolean
  fetchedAt: number                   // Date.now()
  isMarketOpen: boolean               // z 欄位有效時為 true（盤中），否則為 false（盤後/未開盤）
  high52w?: number                    // 近 52 週最高價（背景載入）
  low52w?: number                     // 近 52 週最低價（背景載入）
}

/** ETF 配息紀錄 */
export interface DividendRecord {
  id: string
  accountId: string
  code: string
  exDate: string                      // 除息日 'YYYY-MM-DD'
  cashPerShare: number                // 每股配息金額
  shares: number                      // 除息時持股數（用於計算總領息）
  totalCash: number                   // 總領息 = cashPerShare × shares
  source: 'auto' | 'manual'          // 自動抓取或手動輸入
  note?: string
}

/** 偏差修正投入試算 — 單標的結果 */
export interface DeviationInvestResult {
  code: string
  name: string
  price: number
  currentValue: number        // 目前市值
  currentWeight: number       // 目前實際比重 %
  targetWeight: number        // 目標比重 %
  deviation: number           // 偏差 = 目前比重 - 目標比重（負 = 欠買）
  suggestedAmount: number     // 建議投入金額
  buyableShares: number       // 可買股數
  lots: number
  remainingShares: number
  actualCost: number
  buyFee: number
  displayShares: string
  newWeight: number           // 買入後預測比重 %
}

/** 偏差修正投入試算 — 整體結果 */
export interface DeviationInvestSummary {
  accountId: string
  investAmount: number
  totalAllocated: number
  remainingCash: number
  results: DeviationInvestResult[]
}

/** 季再平衡建議 — 單標的 */
export interface RebalanceAction {
  code: string
  name: string
  price: number
  currentShares: number
  currentValue: number
  currentWeight: number
  targetWeight: number
  action: 'buy' | 'sell' | 'hold'
  sharesChange: number        // 正 = 買, 負 = 賣
  estimatedAmount: number     // 正 = 花費, 負 = 回收
  fee: number
  tax: number
  totalCost: number           // 含稅費
  newShares: number
  newWeight: number
}

/** 季再平衡建議 — 整體 */
export interface RebalancePlan {
  accountId: string
  totalCurrentValue: number
  actions: RebalanceAction[]
  totalBuyCost: number
  totalSellReturn: number
  netCashFlow: number         // 正 = 需補充現金
}

/** 混合再平衡（加減碼 + 調倉）— 單標的 */
export interface HybridRebalanceAction {
  code: string
  name: string
  price: number

  // 現況
  currentShares: number
  currentValue: number
  currentWeight: number

  // 目標
  targetWeight: number
  targetValue: number

  // 操作
  action: 'buy' | 'sell' | 'hold'
  sharesChange: number        // 正 = 買, 負 = 賣

  // 費用明細
  estimatedAmount: number     // 買入總額 or 賣出總額
  fee: number
  tax: number
  totalCost: number           // buy: 總花費；sell: -淨收入

  // 買賣後
  newShares: number
  newValue: number
  newWeight: number
  weightDeviation: number     // 與目標的偏差
}

/** 混合再平衡（加減碼 + 調倉）— 整體 */
export interface HybridRebalancePlan {
  accountId: string

  // 市值計算
  currentTotalValue: number
  additionalFund: number
  targetTotalValue: number

  // 操作摘要
  actions: HybridRebalanceAction[]

  // 現金流
  totalBuyCost: number
  totalSellReturn: number
  netCashFlow: number         // 應投入現金（buy - sell）
  remainingCash: number       // additionalFund - netCashFlow

  // 警示
  warnings: string[]
}

/** 目標總市值配置 — 整體計畫 */
export interface TargetValueRebalancePlan {
  accountId: string

  // 現況
  currentTotalValue: number
  currentTotalCost: number

  // 目標
  targetTotalValue: number
  realizedPnL: number         // 已實現損益（本次換倉賣出）

  // 需投入金額
  requiredFund: number        // targetTotalValue - currentTotalValue - realizedPnL

  // 操作摘要
  actions: HybridRebalanceAction[]

  // 現金流
  totalBuyCost: number
  totalSellReturn: number
  netCashFlow: number

  // 調整後預估
  afterTotalCost: number      // 調整後總成本
  afterTotalValue: number     // 調整後總市值（應等於 targetTotalValue）
  afterUnrealizedPnL: number  // 調整後未實現損益

  // 警示
  warnings: string[]
}

/** /api/stock-price 批次回傳格式 */
export interface StockPriceResponse {
  stocks: YahooStockQuote[]
}

/** 通知訊息 */
export interface Notification {
  id: string
  type: 'warning' | 'error' | 'info'
  message: string
}

/** 單一股票輸入 */
export interface StockEntry {
  code: string
  name: string
  price: number
  weight: number // 0-100
  isETF: boolean
  exchange: 'tse' | 'otc'
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

/** TWSE API 回傳的單支股票資料 */
export interface TWSEStockInfo {
  c: string   // 股票代碼
  n: string   // 股票名稱
  z: string   // 最新成交價（「-」表示未成交）
  y: string   // 昨收價
  o: string   // 開盤價
  h: string   // 最高價
  l: string   // 最低價
  ex_ch: string // 交易所前綴 (tse_2330.tw)
}

/** TWSE API 回傳格式 */
export interface TWSEResponse {
  msgArray: TWSEStockInfo[]
  rtcode: string
  rtmessage: string
}

/** 通知訊息 */
export interface Notification {
  id: string
  type: 'warning' | 'error' | 'info'
  message: string
}

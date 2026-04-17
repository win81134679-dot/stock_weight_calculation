/**
 * 投資組合預設配置
 * 修改此檔案 → git push → Vercel 自動重新部署
 */

export interface StockConfig {
  code: string
  weight: number
}

/** 預設股票配置 */
export const DEFAULT_STOCKS: StockConfig[] = [
  { code: '2313', weight: 19.3 },
  { code: '3443', weight: 5.7 },
  { code: '4958', weight: 6.0 },
  { code: '6515', weight: 29.1 },
]

/** 手續費折扣（10 = 不打折 = 原價, 6 = 6折） */
export const DEFAULT_DISCOUNT = 10

/** 預計換股日期（留空表示不設定） */
export const DEFAULT_REBALANCE_DATE = '2026-04-01'

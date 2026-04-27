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
  { code: '00878',  weight: 40 },
  { code: '00927',  weight: 20 },
  { code: '00988A', weight: 40 },
]

/** 手續費折扣（10 = 不打折 = 原價, 6 = 6折） */
export const DEFAULT_DISCOUNT = 6

/** 預計換股日期（留空表示不設定） */
export const DEFAULT_REBALANCE_DATE = '2026-07-01'

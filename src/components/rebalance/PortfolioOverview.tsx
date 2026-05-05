'use client'

/**
 * PortfolioOverview.tsx
 * Bento-grid dashboard for portfolio overview.
 * v2: Hero card, Treemap, RadialBar, AreaChart, StockPerfCard, Bento layout.
 */

import React, { useMemo, useState, useEffect } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Account, Holding, PriceCache, AllocationConfig, PnLSnapshot, Transaction, DividendRecord } from '@/lib/types'
import { calcAccountPnL, calcCombinedPnL, calcQuarterlyRebalance, daysUntilRebalance } from '@/lib/rebalance-calculator'
import { formatMoney } from '@/lib/calculator'
import { accountColorStyle } from './AccountManager'
import ScenarioChart from './ScenarioChart'
import PnLHistoryChart from './PnLHistoryChart'
import TreemapChart from './TreemapChart'
import RadialWeightChart from './RadialWeightChart'
import StockPerfCard from './StockPerfCard'
import LivePriceStatus from './LivePriceStatus'
import TaiexCard from './TaiexCard'
import HoldingTickerBoard, { TickerItem } from './HoldingTickerBoard'
import TodayDashboard from './TodayDashboard'
import { resolveAccountConfig } from '@/lib/portfolio-store'
import PortfolioKpiCards from './PortfolioKpiCards'
import MonthlyPnlChart from './MonthlyPnlChart'
import HoldingRankChart from './HoldingRankChart'
import DrawdownChart from './DrawdownChart'
import StockContributionChart from './StockContributionChart'
import ReturnHistogram from './ReturnHistogram'

const PIE_COLORS = ['#2C5F8A', '#4A90C4', '#60A5FA', '#34D399', '#F59E0B', '#F87171', '#A78BFA', '#FB923C']

interface Props {
  accounts: Account[]
  holdings: Holding[]
  transactions: Transaction[]
  prices: Record<string, PriceCache>
  allocationConfigs: AllocationConfig[]
  snapshots: PnLSnapshot[]
  dividends?: DividendRecord[]
  loading: boolean
  secondsUntilRefresh: number
  isMarketHours: boolean
  onRefreshPrices: () => void
  onDeleteSnapshot?: (dateKey: string) => void
}

function StatCard({
  label, value, sub, subColor, accent,
}: {
  label: string
  value: string
  sub?: string
  subColor?: string
  accent?: boolean
}) {
  return (
    <div className={`glass-card p-4 animate-fade-up ${accent ? 'ring-1 ring-[#2C5F8A]/20' : ''}`}>
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</p>
      <p className="text-lg font-mono font-black text-[#1A1A2E] leading-tight">{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor ?? 'text-slate-400'}`}>{sub}</p>}
    </div>
  )
}

function DeviationRow({ code, name, current, target }: { code: string; name: string; current: number; target: number }) {
  const diff = current - target
  const clamp = Math.min(Math.abs(diff), 20) / 20
  const isOver = diff > 0
  const needsTopUp = diff < -5  // 欠重超過 5% 建議加碼
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs font-semibold text-[#1A1A2E]">{code}</span>
          <span className="text-[11px] text-slate-400 hidden sm:inline">{name}</span>
          {needsTopUp && (
            <span className="text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1 py-0.5">建議加碼 ▲</span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-right text-xs font-mono text-slate-500">{target.toFixed(0)}%</td>
      <td className="px-3 py-2 text-right text-xs font-mono font-semibold text-[#1A1A2E]">{current.toFixed(1)}%</td>
      <td className="px-3 py-2 min-w-[100px]">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                Math.abs(diff) < 1 ? 'bg-slate-300' : isOver ? 'bg-blue-500' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.max(clamp * 100, 4)}%` }}
            />
          </div>
          <span className={`text-[11px] font-mono w-12 text-right ${
            Math.abs(diff) < 1 ? 'text-slate-400' : isOver ? 'text-blue-600' : 'text-amber-500'
          }`}>
            {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
          </span>
        </div>
      </td>
    </tr>
  )
}

export default function PortfolioOverview({
  accounts,
  holdings,
  transactions,
  prices,
  allocationConfigs,
  snapshots,
  dividends = [],
  loading,
  secondsUntilRefresh,
  isMarketHours,
  onRefreshPrices,
  onDeleteSnapshot,
}: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('__all__')
  const [mounted, setMounted] = useState(false)
  const [showFeeAnalysis, setShowFeeAnalysis] = useState(false)
  const [showRebalancePlan, setShowRebalancePlan] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  // Resolve target weights and next rebalance date based on selection
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId)
  const resolvedConfig = selectedAccount
    ? resolveAccountConfig(selectedAccount, allocationConfigs)
    : allocationConfigs[0]
  const targetWeights = resolvedConfig?.targetWeights ?? []
  const nextRebalanceDate = resolvedConfig?.nextRebalanceDate

  const combined = useMemo(
    () => calcCombinedPnL(accounts.map((a) => a.id), holdings, prices, targetWeights, transactions),
    [accounts, holdings, prices, targetWeights, transactions]
  )

  const accountPnLs = useMemo(
    () => accounts.map((a) => ({ account: a, pnl: calcAccountPnL(a.id, holdings, prices, targetWeights, transactions) })),
    [accounts, holdings, prices, targetWeights, transactions]
  )

  const displayPnL = useMemo(() => {
    if (selectedAccountId === '__all__') {
      return {
        totalValue: combined.totalValue,
        totalCost: combined.totalCost,
        totalFees: combined.totalFees,
        totalPnl: combined.totalPnl,
        pnlPct: combined.pnlPct,
        holdings: combined.byAccount.flatMap((a) => a.holdings),
      }
    }
    return accountPnLs.find((a) => a.account.id === selectedAccountId)?.pnl
  }, [selectedAccountId, combined, accountPnLs])

  const todayChange = useMemo(() => {
    if (!displayPnL || displayPnL.holdings.length === 0) return null
    let prevTotal = 0
    let curTotal = 0
    const acctIds = selectedAccountId === '__all__'
      ? accounts.map((a) => a.id)
      : [selectedAccountId]
    const acctHoldings = holdings.filter((h) => acctIds.includes(h.accountId))
    for (const h of acctHoldings) {
      const pc = prices[h.code]
      if (!pc || h.shares <= 0) continue
      prevTotal += h.shares * pc.prevClose
      curTotal += h.shares * pc.price
    }
    if (prevTotal === 0) return null
    return { change: curTotal - prevTotal, pct: ((curTotal - prevTotal) / prevTotal) * 100 }
  }, [displayPnL, holdings, prices, accounts, selectedAccountId])

  const daysToRebalance = useMemo(() => {
    if (!nextRebalanceDate) return null
    return daysUntilRebalance(nextRebalanceDate)
  }, [nextRebalanceDate])

  const holdingRows = useMemo(() => {
    if (!displayPnL) return []
    return displayPnL.holdings.filter((h) => h.value > 0)
  }, [displayPnL])

  const perfCardHoldings = useMemo(() => {
    const acctIds = selectedAccountId === '__all__'
      ? accounts.map((a) => a.id)
      : [selectedAccountId]
    return holdings
      .filter((h) => acctIds.includes(h.accountId))
      .map((h) => {
        const buyTxns = transactions.filter(
          (t) => t.accountId === h.accountId && t.code === h.code && t.type === 'buy'
        )
        const firstBuyDate = buyTxns.length > 0
          ? buyTxns.reduce((min, t) => t.date < min ? t.date : min, buyTxns[0].date)
          : undefined
        // 此帳戶+此標的的配息加總
        const acctDivs = dividends
          .filter((d) => d.accountId === h.accountId && d.code === h.code)
          .reduce((s, d) => s + d.totalCash, 0)
        return {
          ...h,
          price: prices[h.code]?.price ?? 0,
          prevClose: prices[h.code]?.prevClose ?? 0,
          high52w: prices[h.code]?.high52w,
          low52w: prices[h.code]?.low52w,
          accountColor: accounts.find((a) => a.id === h.accountId)?.color ?? 'blue',
          firstBuyDate,
          totalDividends: acctDivs > 0 ? acctDivs : undefined,
        }
      })
  }, [holdings, accounts, prices, selectedAccountId, transactions, dividends])

  const radialWeights = useMemo(() => {
    if (!displayPnL) return []
    return targetWeights.map((tw) => {
      const h = displayPnL.holdings.find((h) => h.code === tw.code)
      return {
        code: tw.code,
        name: tw.name,
        targetWeight: tw.weight,
        currentWeight: h?.currentWeight ?? 0,
      }
    })
  }, [displayPnL, targetWeights])

  // 累積配息 per code (跨帳戶加總)
  const dividendsByCode = useMemo(() => {
    const acctIds = selectedAccountId === '__all__'
      ? accounts.map((a) => a.id)
      : [selectedAccountId]
    const result: Record<string, number> = {}
    for (const d of dividends) {
      if (!acctIds.includes(d.accountId)) continue
      result[d.code] = (result[d.code] ?? 0) + d.totalCash
    }
    return result
  }, [dividends, accounts, selectedAccountId])

  const totalDividendsCash = useMemo(
    () => Object.values(dividendsByCode).reduce((s, v) => s + v, 0),
    [dividendsByCode]
  )

  // 偏差超過 5% 的加碼提醒
  const topUpAlerts = useMemo(() => {
    if (!displayPnL) return []
    return holdingRows.filter((h) => {
      const diff = h.currentWeight - h.targetWeight
      return diff < -5
    })
  }, [displayPnL, holdingRows])

  // 個股票板資料
  const tickerItems = useMemo((): TickerItem[] => {
    if (!displayPnL) return []
    const acctIds =
      selectedAccountId === '__all__' ? accounts.map((a) => a.id) : [selectedAccountId]
    const rawHoldings = holdings.filter((h) => acctIds.includes(h.accountId))

    return rawHoldings.map((h) => {
      const pc = prices[h.code]
      const price = pc?.price ?? 0
      const prevClose = pc?.prevClose ?? 0
      const pnlHolding = displayPnL.holdings.find((ph) => ph.code === h.code)
      const pnl = pnlHolding?.pnl ?? 0
      const pnlPct = pnlHolding?.pnlPct ?? 0
      const value = price > 0 ? Math.round(h.shares * price) : 0
      const todayChange = prevClose > 0 ? (price - prevClose) * h.shares : 0
      const todayChangePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
      return {
        code: h.code,
        name: pnlHolding?.name ?? h.name ?? h.code,
        price,
        prevClose,
        shares: h.shares,
        value,
        pnl,
        pnlPct,
        todayChange,
        todayChangePct,
      }
    })
  }, [displayPnL, holdings, prices, accounts, selectedAccountId])

  // 加權指數資料
  const taiexPrice = prices['tse_t00.tw']

  // 手續費分析
  const feeAnalysis = useMemo(() => {
    const acctIds = selectedAccountId === '__all__'
      ? accounts.map((a) => a.id)
      : [selectedAccountId]
    const acctTxns = transactions.filter((t) => acctIds.includes(t.accountId))
    let fullFee = 0
    let paidFee = 0
    for (const t of acctTxns) {
      const price = prices[t.code]?.price ?? t.price
      fullFee += Math.round(t.shares * price * 0.001425)
      paidFee += t.fee ?? 0
    }
    const savings = Math.max(0, fullFee - paidFee)
    return { fullFee, paidFee, savings, txnCount: acctTxns.length }
  }, [transactions, accounts, selectedAccountId, prices])

  // 再平衡試算 (僅限單帳戶或預設第一個)
  const rebalancePlan = useMemo(() => {
    const planAccountId = selectedAccountId === '__all__'
      ? (accounts[0]?.id ?? null)
      : selectedAccountId
    if (!planAccountId) return null
    return calcQuarterlyRebalance(planAccountId, holdings, prices, targetWeights, 0.28)
  }, [selectedAccountId, accounts, holdings, prices, targetWeights])

  if (!mounted || accounts.length === 0) {
    return (
      <div className="text-center py-14 text-slate-400">
        <div className="text-5xl mb-3">📊</div>
        <p className="text-sm font-medium">尚未建立帳戶</p>
        <p className="text-xs mt-1">請至「持倉管理」→「帳戶管理」新增帳戶</p>
      </div>
    )
  }

  const isProfit = (displayPnL?.totalPnl ?? 0) >= 0
  const isTodayUp = (todayChange?.change ?? 0) >= 0

  return (
    <div className="space-y-3">

      {/* 帳戶切換 Pills + 即時股價狀態 */}
      <div className="flex gap-2 flex-wrap items-center">
        <button
          onClick={() => setSelectedAccountId('__all__')}
          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
            selectedAccountId === '__all__'
              ? 'bg-[#2C5F8A] text-white border-[#2C5F8A] shadow-sm'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          全部合併
        </button>
        {accounts.map((acc) => {
          const s = accountColorStyle(acc.color)
          const active = acc.id === selectedAccountId
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                active
                  ? `${s.bg} ${s.border} ${s.text} shadow-sm`
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              {acc.name}
              {acc.broker && <span className="text-[10px] opacity-60">({acc.broker})</span>}
            </button>
          )
        })}
        <div className="ml-auto">
          <LivePriceStatus
            loading={loading}
            secondsUntilRefresh={secondsUntilRefresh}
            isMarketHours={isMarketHours}
            onRefresh={onRefreshPrices}
          />
        </div>
      </div>

      {/* TAIEX 加權指數卡 */}
      {taiexPrice && (
        <TaiexCard
          price={taiexPrice.price}
          prevClose={taiexPrice.prevClose}
          isMarketHours={isMarketHours}
          loading={loading}
        />
      )}

      {/* Hero Banner */}
      {displayPnL && (
        <div
          className="relative rounded-2xl overflow-hidden shadow-md animate-fade-up"
          style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #2C5F8A 55%, #4A90C4 100%)' }}
        >
          <div
            className="absolute inset-0 opacity-5"
            style={{
              backgroundImage: 'radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <p className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-1">
                  {selectedAccountId === '__all__'
                    ? '全部帳戶合併'
                    : accounts.find((a) => a.id === selectedAccountId)?.name ?? ''}
                  &nbsp;·&nbsp;總市值
                </p>
                <p className="text-3xl sm:text-4xl font-black font-mono text-white leading-none">
                  ${formatMoney(displayPnL.totalValue)}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <div className={`flex items-center gap-1.5 text-sm font-mono font-bold ${
                    isProfit ? 'text-emerald-300' : 'text-red-300'
                  }`}>
                    <span>{isProfit ? '▲' : '▼'}</span>
                    <span>${formatMoney(Math.abs(displayPnL.totalPnl))}</span>
                    <span className="text-xs font-normal opacity-80">
                      ({isProfit ? '+' : ''}{displayPnL.pnlPct.toFixed(2)}%)
                    </span>
                    <span className="text-white/40 text-xs font-normal">未實現</span>
                  </div>
                  {todayChange && (
                    <div className={`flex items-center gap-1 text-xs font-mono ${
                      isTodayUp ? 'text-emerald-300/80' : 'text-red-300/80'
                    }`}>
                      <span>{isTodayUp ? '▲' : '▼'}</span>
                      <span>${formatMoney(Math.abs(todayChange.change))}</span>
                      <span>({isTodayUp ? '+' : ''}{todayChange.pct.toFixed(2)}%)</span>
                      <span className="text-white/40">今日</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-row sm:flex-col gap-3 sm:gap-2 sm:items-end text-right">
                <div>
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">成本</p>
                  <p className="text-white/90 text-sm font-mono font-bold">${formatMoney(displayPnL.totalCost)}</p>
                </div>                {totalDividendsCash > 0 && (
                  <div>
                    <p className="text-white/50 text-[10px] uppercase tracking-wider">已領配息</p>
                    <p className="text-emerald-300 text-sm font-mono font-bold">+${formatMoney(totalDividendsCash)}</p>
                  </div>
                )}                <div>
                  <p className="text-white/50 text-[10px] uppercase tracking-wider">已付費用</p>
                  <p className="text-white/90 text-sm font-mono font-bold">${formatMoney(displayPnL.totalFees)}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bento Row 1: 4 stat cards */}
      {displayPnL && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="總成本"
            value={`$${formatMoney(displayPnL.totalCost)}`}
            sub={displayPnL.totalFees > 0 ? `含手續費 $${formatMoney(displayPnL.totalFees)}` : undefined}
          />
          <StatCard
            label="未實現損益"
            value={`${displayPnL.totalPnl >= 0 ? '+' : ''}$${formatMoney(Math.abs(displayPnL.totalPnl))}`}
            sub={`${displayPnL.pnlPct >= 0 ? '+' : ''}${displayPnL.pnlPct.toFixed(2)}%`}
            subColor={displayPnL.totalPnl >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}
            accent
          />
          {todayChange ? (
            <StatCard
              label="今日損益"
              value={`${isTodayUp ? '+' : ''}$${formatMoney(Math.abs(todayChange.change))}`}
              sub={`${isTodayUp ? '+' : ''}${todayChange.pct.toFixed(2)}%`}
              subColor={isTodayUp ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}
            />
          ) : (
            <StatCard label="已付手續費" value={`$${formatMoney(displayPnL.totalFees)}`} />
          )}
          {daysToRebalance !== null ? (
            <div className="glass-card p-4 animate-fade-up">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">下次再平衡</p>
              <p className="text-lg font-mono font-black text-[#1A1A2E] leading-tight">
                {daysToRebalance <= 0 ? '今天!' : `${daysToRebalance} 天`}
              </p>
              <p className="text-xs mt-1 text-slate-400">{nextRebalanceDate}</p>
              {daysToRebalance <= 7 && daysToRebalance >= 0 && (
                <span className="inline-block mt-1 text-[10px] font-semibold bg-amber-50 text-amber-600 border border-amber-200 rounded px-1.5 py-0.5">
                  ⚠ 即將到期
                </span>
              )}
            </div>
          ) : (
            <StatCard
              label="報酬率"
              value={`${displayPnL.pnlPct >= 0 ? '+' : ''}${displayPnL.pnlPct.toFixed(2)}%`}
            />
          )}
        </div>
      )}

      {/* KPI 摘要卡片列 */}
      {(snapshots.length >= 1 || tickerItems.length > 0) && (
        <PortfolioKpiCards
          snapshots={snapshots}
          tickerItems={tickerItems}
          accountId={selectedAccountId === '__all__' ? null : selectedAccountId}
        />
      )}

      {/* 個股即時看板 */}
      {tickerItems.length > 0 && (
        <HoldingTickerBoard items={tickerItems} isMarketHours={isMarketHours} />
      )}

      {/* ─── 今日即時儀表板（盤中追蹤、個股貢獻、勝負分布、泡泡圖）─── */}
      <TodayDashboard
        tickerItems={tickerItems}
        prices={prices}
        isMarketHours={isMarketHours}
      />

      {/* Bento Row 2: Treemap (2/3) + Pie (1/3) */}
      {holdingRows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 glass-card p-4 animate-fade-up">
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">持倉市值分布</p>
              <p className="text-[11px] text-slate-400 mt-0.5">磚塊大小＝市值；深藍=獲利，橙紅=虧損</p>
            </div>
            <div className="h-52">
              <TreemapChart
                holdings={holdingRows.map((h) => ({
                  code: h.code,
                  name: h.name,
                  value: h.value,
                  pnl: h.pnl,
                  pnlPct: h.pnlPct,
                  currentWeight: h.currentWeight,
                  targetWeight: h.targetWeight,
                }))}
              />
            </div>
          </div>

          <div className="glass-card p-4 animate-fade-up">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">持倉比例</p>
            <p className="text-[11px] text-slate-400 mb-3">各標的市值佔比</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={holdingRows.map((h) => ({ name: h.code, value: h.value }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius="36%"
                    outerRadius="64%"
                    paddingAngle={2}
                    label={false}
                    labelLine={false}
                  >
                    {holdingRows.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip
                    formatter={(value, name) => [`$${formatMoney(Number(value))}`, name]}
                    contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-1 justify-center">
              {holdingRows.map((h, idx) => (
                <li key={h.code} className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span className="w-2 h-2 rounded-sm" style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }} />
                  <span className="font-mono">{h.code}</span>
                  <span className="text-slate-400">({h.currentWeight.toFixed(1)}%)</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 加碼提醒 Banner */}
      {topUpAlerts.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl animate-fade-up">
          <span className="text-amber-500 text-base">⚠</span>
          <p className="text-xs font-semibold text-amber-700">
            {topUpAlerts.length} 檔標的偏離目標 &gt;5%（{topUpAlerts.map((h) => h.code).join('、')}），建議加碼調整
          </p>
        </div>
      )}

      {/* 損益歷史 Area Chart（含「今日」盤中 tab） */}
      {(snapshots.length >= 2 || tickerItems.some((i) => i.shares > 0)) && (
        <div className="glass-card p-4 animate-fade-up">
          <div className="mb-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">損益歷史</p>
            <p className="text-[11px] text-slate-400 mt-0.5">每日快照趨勢 · 今日盤中小時走勢</p>
          </div>
          <PnLHistoryChart
            snapshots={snapshots}
            accountId={selectedAccountId === '__all__' ? null : selectedAccountId}
            accounts={accounts}
            onDeleteSnapshot={onDeleteSnapshot}
            tickerItems={tickerItems}
          />
        </div>
      )}

      {/* 進階分析圖表區（月度損益 / 個股排行 / 回撤 / 貢獻 / 直方圖） */}
      {snapshots.length >= 2 && (
        <div className="space-y-3">

          {/* 月度損益 + 個股持倉排行 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="glass-card p-4 animate-fade-up">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">月度損益</p>
              <p className="text-[11px] text-slate-400 mb-3">本月末 vs 上月末 市值 Δ</p>
              <MonthlyPnlChart
                snapshots={snapshots}
                accountId={selectedAccountId === '__all__' ? null : selectedAccountId}
              />
            </div>
            <div className="glass-card p-4 animate-fade-up">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">個股持倉排行</p>
              <p className="text-[11px] text-slate-400 mb-3">依市值降序 · 含今日漲跌</p>
              <HoldingRankChart tickerItems={tickerItems} />
            </div>
          </div>

          {/* 回撤水位圖 + 日報酬率直方圖 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="glass-card p-4 animate-fade-up">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">回撤水位圖</p>
              <p className="text-[11px] text-slate-400 mb-3">持續追蹤每日回撤幅度</p>
              <DrawdownChart
                snapshots={snapshots}
                accountId={selectedAccountId === '__all__' ? null : selectedAccountId}
              />
            </div>
            <div className="glass-card p-4 animate-fade-up">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">日報酬率分布</p>
              <p className="text-[11px] text-slate-400 mb-3">常態分布曲線疊加</p>
              <ReturnHistogram
                snapshots={snapshots}
                accountId={selectedAccountId === '__all__' ? null : selectedAccountId}
              />
            </div>
          </div>

          {/* 每日個股貢獻% 堆疊面積圖 */}
          <div className="glass-card p-4 animate-fade-up">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">每日個股貢獻</p>
            <p className="text-[11px] text-slate-400 mb-3">各股當日 Δ 堆疊面積 · 正負分開（stackOffset sign）</p>
            <StockContributionChart
              snapshots={snapshots}
              tickerItems={tickerItems}
              topN={10}
            />
          </div>

        </div>
      )}

      {/* 個股績效卡 */}
      {perfCardHoldings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1 mb-2">個股績效</p>
          <div className="flex flex-wrap gap-3">
            {perfCardHoldings.map((h, i) => (
              <div key={`${h.accountId}-${h.code}-${i}`} style={{ flex: '1 1 148px', maxWidth: 220 }}>
                <StockPerfCard
                  code={h.code}
                  name={h.name}
                  price={h.price}
                  prevClose={h.prevClose}
                  shares={h.shares}
                  avgCost={h.avgCost}
                  accountColor={h.accountColor}
                  firstBuyDate={h.firstBuyDate}
                  high52w={h.high52w}
                  low52w={h.low52w}
                  totalDividends={h.totalDividends}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Multi-config banner when viewing all accounts */}
      {selectedAccountId === '__all__' && allocationConfigs.length > 1 && accounts.some((a) => a.allocationConfigId) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          ⚠️ 各帳戶使用不同目標配置，以下偏差分析基於第一個配置（{allocationConfigs[0]?.name}）。請切換至個別帳戶查看各自偏差。
        </div>
      )}

      {/* Bento Row: RadialBar + 偏差表 */}
      {holdingRows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="glass-card p-4 animate-fade-up">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">目標 vs 實際比重</p>
            <p className="text-[11px] text-slate-400 mb-2">圓弧長度 = 實際%; 背景 = 目標範圍</p>
            <div className="h-52">
              <RadialWeightChart weights={radialWeights} />
            </div>
          </div>

          <div className="glass-card overflow-hidden animate-fade-up">
            <div className="p-4 pb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">比重偏差</p>
              <p className="text-[11px] text-slate-400 mt-0.5">藍=超重，琥珀=欠重</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] text-slate-400 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left">代碼</th>
                    <th className="px-3 py-2 text-right">目標</th>
                    <th className="px-3 py-2 text-right">現在</th>
                    <th className="px-3 py-2 min-w-[110px]">偏差</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingRows.map((h) => (
                    <DeviationRow
                      key={h.code}
                      code={h.code}
                      name={h.name}
                      current={h.currentWeight}
                      target={h.targetWeight}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 pt-2 border-t border-slate-100 mt-2">
              <p className="text-[11px] text-slate-400 mb-2">持倉損益明細</p>
              <div className="space-y-2">
                {holdingRows.map((h) => (
                  <div key={h.code} className="flex justify-between items-center">
                    <div>
                      <span className="font-mono text-xs font-semibold text-[#1A1A2E]">{h.code}</span>
                      {h.price > 0 && (
                        <span className="text-[11px] text-slate-400 ml-1.5">${h.price.toFixed(2)}</span>
                      )}
                    </div>
                    {h.price > 0 && (
                      <div className={`text-xs font-mono font-bold ${h.pnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {h.pnl >= 0 ? '+' : '-'}${formatMoney(Math.abs(h.pnl))}
                        <span className="text-[10px] font-normal ml-1 opacity-70">
                          ({h.pnl >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%)
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 手續費分析 折疊卡 */}
      {displayPnL && feeAnalysis.txnCount > 0 && (
        <div className="glass-card animate-fade-up overflow-hidden">
          <button
            onClick={() => setShowFeeAnalysis((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">💸</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-[#1A1A2E]">手續費分析</p>
                <p className="text-[11px] text-slate-400">折扣省了多少手續費</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {feeAnalysis.savings > 0 && (
                <span className="text-xs font-mono font-bold text-emerald-600">省 ${formatMoney(feeAnalysis.savings)}</span>
              )}
              <span className="text-slate-300 text-sm">{showFeeAnalysis ? '▲' : '▼'}</span>
            </div>
          </button>
          {showFeeAnalysis && (
            <div className="px-4 pb-4 border-t border-slate-100">
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">原始手續費</p>
                  <p className="font-mono font-bold text-sm text-[#1A1A2E]">${formatMoney(feeAnalysis.fullFee)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">0.1425%</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">實際支付</p>
                  <p className="font-mono font-bold text-sm text-[#1A1A2E]">${formatMoney(feeAnalysis.paidFee)}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">{feeAnalysis.txnCount} 筆交易</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wider mb-1">折扣節省</p>
                  <p className="font-mono font-bold text-sm text-emerald-600">+${formatMoney(feeAnalysis.savings)}</p>
                  <p className="text-[10px] text-emerald-500 mt-0.5">
                    {feeAnalysis.fullFee > 0 ? `${((feeAnalysis.savings / feeAnalysis.fullFee) * 100).toFixed(1)}% off` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 再平衡試算 折疊卡 */}
      {rebalancePlan && rebalancePlan.actions.length > 0 && (
        <div className="glass-card animate-fade-up overflow-hidden">
          <button
            onClick={() => setShowRebalancePlan((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50/60 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">⚖️</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-[#1A1A2E]">再平衡試算</p>
                <p className="text-[11px] text-slate-400">
                  {selectedAccountId === '__all__' ? `${accounts[0]?.name ?? ''} 帳戶` : accounts.find((a) => a.id === selectedAccountId)?.name ?? ''}
                  &nbsp;·&nbsp;概估調整方案
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {rebalancePlan.totalBuyCost > 0 && (
                <span className="text-xs font-mono font-bold text-blue-600">需 ${formatMoney(rebalancePlan.totalBuyCost)}</span>
              )}
              <span className="text-slate-300 text-sm">{showRebalancePlan ? '▲' : '▼'}</span>
            </div>
          </button>
          {showRebalancePlan && (
            <div className="border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-[11px] text-slate-400 uppercase tracking-wide">
                    <th className="px-4 py-2 text-left">代碼</th>
                    <th className="px-4 py-2 text-right">現價</th>
                    <th className="px-4 py-2 text-center">操作</th>
                    <th className="px-4 py-2 text-right">股數</th>
                    <th className="px-4 py-2 text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {rebalancePlan.actions.map((a) => (
                    <tr key={a.code} className="border-t border-slate-100">
                      <td className="px-4 py-2">
                        <span className="font-mono font-semibold text-xs text-[#1A1A2E]">{a.code}</span>
                        <span className="text-[10px] text-slate-400 ml-1">{a.name}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-mono text-slate-500">${a.price.toFixed(2)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                          a.action === 'buy' ? 'bg-blue-50 text-blue-600' :
                          a.action === 'sell' ? 'bg-red-50 text-red-500' :
                          'bg-slate-50 text-slate-400'
                        }`}>
                          {a.action === 'buy' ? '買入' : a.action === 'sell' ? '賣出' : '持有'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-mono">
                        {a.sharesChange !== 0 ? (
                          <span className={a.action === 'buy' ? 'text-blue-600' : 'text-red-500'}>
                            {a.action === 'buy' ? '+' : '-'}{Math.abs(a.sharesChange).toLocaleString()}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-xs font-mono">
                        {a.estimatedAmount > 0 ? (
                          <span className={a.action === 'buy' ? 'text-blue-600 font-semibold' : 'text-red-500 font-semibold'}>
                            ${formatMoney(a.estimatedAmount)}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-slate-400">需投入：</span>
                  <span className="font-mono font-bold text-blue-600 ml-1">${formatMoney(rebalancePlan.totalBuyCost)}</span>
                </div>
                {rebalancePlan.totalSellReturn > 0 && (
                  <div>
                    <span className="text-slate-400">賣回：</span>
                    <span className="font-mono font-bold text-emerald-600 ml-1">${formatMoney(rebalancePlan.totalSellReturn)}</span>
                  </div>
                )}
                <div>
                  <span className="text-slate-400">淨支出：</span>
                  <span className="font-mono font-bold text-[#1A1A2E] ml-1">${formatMoney(Math.max(0, rebalancePlan.totalBuyCost - rebalancePlan.totalSellReturn))}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 情境模擬 */}
      <ScenarioChart
        holdings={holdings.filter((h) => selectedAccountId === '__all__' || h.accountId === selectedAccountId)}
        prices={prices}
        targetWeights={targetWeights}
      />

      {/* 免責聲明 */}
      <p className="text-[11px] text-slate-400 px-1 pb-2">
        ※ 股價為 TWSE 延遲約 20 秒報價，損益數字含預估賣出手續費（0.1425% + 交易稅），僅供參考。
      </p>
    </div>
  )
}


'use client'

/**
 * RebalancePage.tsx
 * Main rebalance management page with 5 sub-tabs.
 * Orchestrates all state via usePortfolioStore + useCurrentPrices.
 */

import React, { useEffect, useCallback, useState, useMemo, useRef } from 'react'
import { usePortfolioStore } from '@/hooks/usePortfolioStore'
import { useCurrentPrices } from '@/hooks/useCurrentPrices'
import { takeAndSaveSnapshot } from '@/lib/snapshot'
import { checkAndNotifyOnLoad } from '@/lib/discord-webhook'
import { calcCombinedPnL } from '@/lib/rebalance-calculator'

import PortfolioOverview from './PortfolioOverview'
import InvestmentAdvisor from './InvestmentAdvisor'
import QuarterlyRebalancer from './QuarterlyRebalancer'
import HoldingEditor from './HoldingEditor'
import AccountManager from './AccountManager'
import RebalanceSettingsPanel from './RebalanceSettings'
import DividendManager from './DividendManager'
import AllocationConfigManager from './AllocationConfigManager'

type SubTab = 'overview' | 'invest' | 'rebalance' | 'holdings' | 'settings'

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'overview',  label: '總覽',     icon: '📊' },
  { id: 'invest',    label: '資金投入', icon: '💰' },
  { id: 'rebalance', label: '季再平衡', icon: '⚖️' },
  { id: 'holdings',  label: '持倉管理', icon: '📋' },
  { id: 'settings',  label: '設定',     icon: '⚙️' },
]

export default function RebalancePage() {
  const [activeTab, setActiveTab] = useState<SubTab>('overview')
  const [holdingsSubTab, setHoldingsSubTab] = useState<'editor' | 'accounts' | 'dividends' | 'configs'>('editor')

  const {
    store,
    mounted,
    addAccount, updateAccount, deleteAccount,
    upsertHolding, deleteHolding,
    addTransaction, deleteTransaction,
    updateSettings,
    addAllocationConfig, updateAllocationConfig, deleteAllocationConfig, duplicateAllocationConfig, setAccountAllocationConfig,
    addSnapshot,
    addDividend, deleteDividend, bulkUpsertDividends, setDividendEntryDate,
    exportJSON, importJSON,
  } = usePortfolioStore()

  const { prices, loading: pricesLoading, fetchPrices, refreshPrices, secondsUntilRefresh, isMarketHours: isMarketHoursNow, startAutoRefresh, stopAutoRefresh } = useCurrentPrices()

  // Collect all codes to track
  const uniqueCodes = useMemo(() => {
    const configCodes = store.allocationConfigs.flatMap((c) => c.targetWeights.map((t) => t.code))
    const holdingCodes = store.holdings.map((h) => h.code)
    return Array.from(new Set([...configCodes, ...holdingCodes]))
  }, [store.allocationConfigs, store.holdings])

  // Fetch prices on mount and when tracked codes change
  useEffect(() => {
    if (uniqueCodes.length > 0) {
      fetchPrices(uniqueCodes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueCodes])

  // Auto-snapshot on overview tab open (once per day)
  useEffect(() => {
    if (activeTab === 'overview' && store.accounts.length > 0 && Object.keys(prices).length > 0) {
      const updated = takeAndSaveSnapshot(store, prices)
      if (updated.snapshots.length !== store.snapshots.length) {
        addSnapshot(updated.snapshots[updated.snapshots.length - 1])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, Object.keys(prices).join(',')])

  // Discord notification check on page load
  useEffect(() => {
    if (store.settings.discordWebhookUrl && store.accounts.length > 0) {
      const firstConfig = store.allocationConfigs[0]
      if (!firstConfig) return
      const combined = calcCombinedPnL(
        store.accounts.map((a) => a.id),
        store.holdings,
        prices,
        firstConfig.targetWeights
      )
      const deviations = firstConfig.targetWeights.map((tw) => {
        const holding = store.holdings.find((h) => h.code === tw.code)
        const price = prices[tw.code]?.price ?? 0
        const totalVal = store.holdings.reduce(
          (s, h) => s + h.shares * (prices[h.code]?.price ?? 0), 0
        )
        const currentPct = totalVal > 0 && price > 0
          ? ((holding?.shares ?? 0) * price / totalVal) * 100
          : 0
        return { name: tw.name, deviation: currentPct - tw.weight }
      })
      checkAndNotifyOnLoad(store.settings, combined.pnlPct, deviations, firstConfig.nextRebalanceDate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only on mount

  const handleRefreshPrices = useCallback(() => {
    refreshPrices(uniqueCodes)
  }, [refreshPrices, uniqueCodes])

  // Auto-refresh prices when on overview tab using the hook's built-in auto-refresh
  useEffect(() => {
    if (activeTab === 'overview' && uniqueCodes.length > 0) {
      startAutoRefresh(uniqueCodes)
    }
    return () => stopAutoRefresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, uniqueCodes.join(',')])

  // Auto-refresh prices when on invest tab: immediately on enter + every 60s
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (activeTab === 'invest' && uniqueCodes.length > 0) {
      refreshPrices(uniqueCodes)
      autoRefreshRef.current = setInterval(() => {
        refreshPrices(uniqueCodes)
      }, 60_000)
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
        autoRefreshRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // SSR hydration 完成前不渲染（避免 localStorage 資料造成 mismatch）
  if (!mounted) {
    return <div className="h-32 rounded-2xl bg-slate-100 animate-pulse" />
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab navigation */}
      <div className="flex overflow-x-auto gap-1 bg-slate-100 rounded-xl p-1 no-scrollbar">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
              activeTab === tab.id
                ? 'bg-white shadow text-[#2C5F8A]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <PortfolioOverview
          accounts={store.accounts}
          holdings={store.holdings}
          transactions={store.transactions}
          prices={prices}
          allocationConfigs={store.allocationConfigs}
          snapshots={store.snapshots}
          dividends={store.dividends}
          loading={pricesLoading}
          secondsUntilRefresh={secondsUntilRefresh}
          isMarketHours={isMarketHoursNow}
          onRefreshPrices={handleRefreshPrices}
        />
      )}

      {activeTab === 'invest' && (
        <div className="space-y-2">
          {/* Refresh status bar */}
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              {pricesLoading
                ? '🔄 更新股價中…'
                : Object.keys(prices).length > 0
                  ? `✅ 股價已更新　每 60 秒自動刷新`
                  : '股價載入中…'}
            </span>
            <button
              onClick={handleRefreshPrices}
              disabled={pricesLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2C5F8A] text-white hover:bg-[#4A90C4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <span className={pricesLoading ? 'animate-spin' : ''}>🔄</span>
              <span>{pricesLoading ? '更新中…' : '刷新股價'}</span>
            </button>
          </div>
          <InvestmentAdvisor
            accounts={store.accounts}
            holdings={store.holdings}
            prices={prices}
            allocationConfigs={store.allocationConfigs}
            discount={store.settings.discount}
          />
        </div>
      )}

      {activeTab === 'rebalance' && (
        <QuarterlyRebalancer
          accounts={store.accounts}
          holdings={store.holdings}
          prices={prices}
          allocationConfigs={store.allocationConfigs}
          discount={store.settings.discount}
        />
      )}

      {activeTab === 'holdings' && (
        <div className="space-y-4">
          {/* Holdings sub-tabs */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit flex-wrap">
            <button
              onClick={() => setHoldingsSubTab('editor')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                holdingsSubTab === 'editor' ? 'bg-white shadow text-[#2C5F8A]' : 'text-slate-500'
              }`}
            >
              📋 持倉資料
            </button>
            <button
              onClick={() => setHoldingsSubTab('accounts')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                holdingsSubTab === 'accounts' ? 'bg-white shadow text-[#2C5F8A]' : 'text-slate-500'
              }`}
            >
              🏦 帳戶管理
            </button>
            <button
              onClick={() => setHoldingsSubTab('dividends')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                holdingsSubTab === 'dividends' ? 'bg-white shadow text-[#2C5F8A]' : 'text-slate-500'
              }`}
            >
              💰 配息紀錄
            </button>
            <button
              onClick={() => setHoldingsSubTab('configs')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                holdingsSubTab === 'configs' ? 'bg-white shadow text-[#2C5F8A]' : 'text-slate-500'
              }`}
            >
              🎯 配置管理
            </button>
          </div>

          {holdingsSubTab === 'editor' && (
            <HoldingEditor
              accounts={store.accounts}
              holdings={store.holdings}
              transactions={store.transactions}
              prices={prices}
              allocationConfigs={store.allocationConfigs}
              onUpsertHolding={upsertHolding}
              onDeleteHolding={deleteHolding}
              onAddTransaction={addTransaction}
              onDeleteTransaction={deleteTransaction}
            />
          )}

          {holdingsSubTab === 'accounts' && (
            <AccountManager
              accounts={store.accounts}
              allocationConfigs={store.allocationConfigs}
              onAdd={addAccount}
              onUpdate={updateAccount}
              onDelete={deleteAccount}
              onSetAllocationConfig={setAccountAllocationConfig}
            />
          )}

          {holdingsSubTab === 'dividends' && (
            <DividendManager
              accounts={store.accounts}
              holdings={store.holdings}
              transactions={store.transactions}
              dividends={store.dividends}
              dividendEntryDates={store.dividendEntryDates ?? {}}
              prices={Object.fromEntries(
                Object.entries(prices).map(([code, pc]) => [code, { price: pc.price, avgCost: undefined }])
              )}
              onAddDividend={addDividend}
              onDeleteDividend={deleteDividend}
              onBulkUpsert={bulkUpsertDividends}
              onSetDividendEntryDate={setDividendEntryDate}
            />
          )}

          {holdingsSubTab === 'configs' && (
            <AllocationConfigManager
              configs={store.allocationConfigs}
              accounts={store.accounts}
              onAdd={addAllocationConfig}
              onUpdate={updateAllocationConfig}
              onDelete={deleteAllocationConfig}
              onDuplicate={duplicateAllocationConfig}
            />
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <RebalanceSettingsPanel
          settings={store.settings}
          onUpdateSettings={updateSettings}
          onExportJSON={exportJSON}
          onImportJSON={importJSON}
        />
      )}
    </div>
  )
}

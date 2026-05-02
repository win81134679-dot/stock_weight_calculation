'use client'

/**
 * usePortfolioStore.ts
 * Global state for the rebalance management feature.
 * Persists to localStorage. All mutations are immutable.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  PortfolioStore,
  Account,
  Holding,
  Transaction,
  RebalanceSettings,
  TargetWeight,
  PnLSnapshot,
  DividendRecord,
  AllocationConfig,
} from '@/lib/types'
import {
  loadStore,
  saveStore,
  addAccount,
  updateAccount,
  deleteAccount,
  upsertHolding,
  deleteHolding,
  addTransaction,
  deleteTransaction,
  updateSettings,
  addTargetWeight,
  removeTargetWeight,
  addAllocationConfig,
  updateAllocationConfig,
  deleteAllocationConfig,
  duplicateAllocationConfig,
  setAccountAllocationConfig,
  addSnapshot,
  deleteSnapshot,
  addDividend,
  deleteDividend,
  bulkUpsertDividends,
  setDividendEntryDate,
  exportStoreAsJSON,
  importStoreFromJSON,
} from '@/lib/portfolio-store'

export function usePortfolioStore() {
  const [store, setStore] = useState<PortfolioStore>(() => loadStore())
  const [mounted, setMounted] = useState(false)

  // 第一次在 client 掛載後從 localStorage 讀取真實資料，避免 SSR hydration 不一致
  useEffect(() => {
    setStore(loadStore())
    setMounted(true)
  }, [])

  // Persist to localStorage whenever store changes (mounted 後才存)
  useEffect(() => {
    if (!mounted) return
    saveStore(store)
  }, [store, mounted])

  // ── Accounts ──────────────────────────────────────────────

  const handleAddAccount = useCallback((name: string, broker?: string) => {
    setStore((s) => addAccount(s, name, broker))
  }, [])

  const handleUpdateAccount = useCallback((id: string, patch: Partial<Omit<Account, 'id'>>) => {
    setStore((s) => updateAccount(s, id, patch))
  }, [])

  const handleDeleteAccount = useCallback((id: string) => {
    setStore((s) => deleteAccount(s, id))
  }, [])

  // ── Holdings (fast mode) ───────────────────────────────────

  const handleUpsertHolding = useCallback((holding: Holding) => {
    setStore((s) => upsertHolding(s, holding))
  }, [])

  const handleDeleteHolding = useCallback((accountId: string, code: string) => {
    setStore((s) => deleteHolding(s, accountId, code))
  }, [])

  // ── Transactions (detail mode) ─────────────────────────────

  const handleAddTransaction = useCallback((tx: Omit<Transaction, 'id'>) => {
    setStore((s) => addTransaction(s, tx))
  }, [])

  const handleDeleteTransaction = useCallback((txId: string) => {
    setStore((s) => deleteTransaction(s, txId))
  }, [])

  // ── Settings ───────────────────────────────────────────────

  const handleUpdateSettings = useCallback((patch: Partial<RebalanceSettings>) => {
    setStore((s) => updateSettings(s, patch))
  }, [])

  const handleAddTargetWeight = useCallback((tw: TargetWeight) => {
    setStore((s) => addTargetWeight(s, tw))
  }, [])

  const handleRemoveTargetWeight = useCallback((code: string) => {
    setStore((s) => removeTargetWeight(s, code))
  }, [])

  // ── Snapshots ─────────────────────────────────────────────

  const handleAddSnapshot = useCallback((snapshot: PnLSnapshot) => {
    setStore((s) => addSnapshot(s, snapshot))
  }, [])

  const handleDeleteSnapshot = useCallback((dateKey: string) => {
    setStore((s) => deleteSnapshot(s, dateKey))
  }, [])

  // ── Dividends ──────────────────────────────────────────────────

  const handleAddDividend = useCallback((record: Omit<DividendRecord, 'id'>) => {
    setStore((s) => addDividend(s, record))
  }, [])

  const handleDeleteDividend = useCallback((id: string) => {
    setStore((s) => deleteDividend(s, id))
  }, [])

  const handleBulkUpsertDividends = useCallback((records: Omit<DividendRecord, 'id'>[]) => {
    setStore((s) => bulkUpsertDividends(s, records))
  }, [])

  const handleSetDividendEntryDate = useCallback((accountId: string, code: string, date: string) => {
    setStore((s) => setDividendEntryDate(s, accountId, code, date))
  }, [])

  // ── AllocationConfig CRUD ─────────────────────────────────

  const handleAddAllocationConfig = useCallback((config: Omit<AllocationConfig, 'id'>) => {
    setStore((s) => addAllocationConfig(s, config))
  }, [])

  const handleUpdateAllocationConfig = useCallback((id: string, patch: Partial<Omit<AllocationConfig, 'id'>>) => {
    setStore((s) => updateAllocationConfig(s, id, patch))
  }, [])

  const handleDeleteAllocationConfig = useCallback((id: string): boolean => {
    let success = false
    setStore((s) => {
      const result = deleteAllocationConfig(s, id)
      if (result === false) return s
      success = true
      return result
    })
    return success
  }, [])

  const handleDuplicateAllocationConfig = useCallback((id: string) => {
    setStore((s) => duplicateAllocationConfig(s, id))
  }, [])

  const handleSetAccountAllocationConfig = useCallback((accountId: string, configId: string | null) => {
    setStore((s) => setAccountAllocationConfig(s, accountId, configId))
  }, [])

  // ── Import / Export ───────────────────────────────────────

  const handleExport = useCallback((): string => {
    return exportStoreAsJSON(store)
  }, [store])

  const handleImport = useCallback((json: string): boolean => {
    const imported = importStoreFromJSON(json)
    if (!imported) return false
    setStore(imported)
    return true
  }, [])

  return {
    store,
    mounted,
    // Accounts
    addAccount: handleAddAccount,
    updateAccount: handleUpdateAccount,
    deleteAccount: handleDeleteAccount,
    // Holdings
    upsertHolding: handleUpsertHolding,
    deleteHolding: handleDeleteHolding,
    // Transactions
    addTransaction: handleAddTransaction,
    deleteTransaction: handleDeleteTransaction,
    // Settings
    updateSettings: handleUpdateSettings,
    addTargetWeight: handleAddTargetWeight,
    removeTargetWeight: handleRemoveTargetWeight,
    // AllocationConfig
    addAllocationConfig: handleAddAllocationConfig,
    updateAllocationConfig: handleUpdateAllocationConfig,
    deleteAllocationConfig: handleDeleteAllocationConfig,
    duplicateAllocationConfig: handleDuplicateAllocationConfig,
    setAccountAllocationConfig: handleSetAccountAllocationConfig,
    // Snapshots
    addSnapshot: handleAddSnapshot,
    deleteSnapshot: handleDeleteSnapshot,
    // Dividends
    addDividend: handleAddDividend,
    deleteDividend: handleDeleteDividend,
    bulkUpsertDividends: handleBulkUpsertDividends,
    setDividendEntryDate: handleSetDividendEntryDate,
    // I/O
    exportJSON: handleExport,
    importJSON: handleImport,
  }
}

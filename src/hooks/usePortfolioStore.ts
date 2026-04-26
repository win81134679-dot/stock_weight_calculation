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
  addSnapshot,
  exportStoreAsJSON,
  importStoreFromJSON,
} from '@/lib/portfolio-store'

export function usePortfolioStore() {
  const [store, setStore] = useState<PortfolioStore>(() => loadStore())

  // Persist to localStorage whenever store changes
  useEffect(() => {
    saveStore(store)
  }, [store])

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
    // Snapshots
    addSnapshot: handleAddSnapshot,
    // I/O
    exportJSON: handleExport,
    importJSON: handleImport,
  }
}

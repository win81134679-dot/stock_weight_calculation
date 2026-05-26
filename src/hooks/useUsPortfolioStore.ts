'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  addUsAccount,
  addUsAllocationConfig,
  addUsDividend,
  addUsTransaction,
  bulkUpsertUsDividends,
  deleteUsAccount,
  deleteUsAllocationConfig,
  deleteUsDividend,
  deleteUsHolding,
  deleteUsTransaction,
  duplicateUsAllocationConfig,
  exportUsStoreAsJSON,
  importUsStoreFromJSON,
  loadUsStore,
  saveUsStore,
  setUsAccountAllocationConfig,
  setUsDividendEntryDate,
  updateUsAccount,
  updateUsAllocationConfig,
  updateUsSettings,
  upsertUsHolding,
} from '@/lib/us-portfolio-store'
import {
  UsAccount,
  UsAllocationConfig,
  UsDividendRecord,
  UsHolding,
  UsPortfolioStore,
  UsSettings,
  UsTransaction,
} from '@/lib/us-types'

export function useUsPortfolioStore() {
  const [store, setStore] = useState<UsPortfolioStore>(() => loadUsStore())
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setStore(loadUsStore())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    saveUsStore(store)
  }, [mounted, store])

  const addAccount = useCallback((name: string, broker?: string) => {
    setStore((prev) => addUsAccount(prev, name, broker))
  }, [])

  const updateAccount = useCallback((id: string, patch: Partial<Omit<UsAccount, 'id'>>) => {
    setStore((prev) => updateUsAccount(prev, id, patch))
  }, [])

  const deleteAccount = useCallback((id: string) => {
    setStore((prev) => deleteUsAccount(prev, id))
  }, [])

  const upsertHolding = useCallback((holding: UsHolding) => {
    setStore((prev) => upsertUsHolding(prev, holding))
  }, [])

  const removeHolding = useCallback((accountId: string, symbol: string) => {
    setStore((prev) => deleteUsHolding(prev, accountId, symbol))
  }, [])

  const addTransaction = useCallback((tx: Omit<UsTransaction, 'id'>) => {
    setStore((prev) => addUsTransaction(prev, tx))
  }, [])

  const removeTransaction = useCallback((txId: string) => {
    setStore((prev) => deleteUsTransaction(prev, txId))
  }, [])

  const updateSettings = useCallback((patch: Partial<UsSettings>) => {
    setStore((prev) => updateUsSettings(prev, patch))
  }, [])

  const addAllocationConfig = useCallback((config: Omit<UsAllocationConfig, 'id'>) => {
    setStore((prev) => addUsAllocationConfig(prev, config))
  }, [])

  const updateAllocationConfig = useCallback((id: string, patch: Partial<Omit<UsAllocationConfig, 'id'>>) => {
    setStore((prev) => updateUsAllocationConfig(prev, id, patch))
  }, [])

  const removeAllocationConfig = useCallback((id: string): boolean => {
    let success = false
    setStore((prev) => {
      const result = deleteUsAllocationConfig(prev, id)
      if (result === false) return prev
      success = true
      return result
    })
    return success
  }, [])

  const duplicateAllocationConfig = useCallback((id: string) => {
    setStore((prev) => duplicateUsAllocationConfig(prev, id))
  }, [])

  const setAccountAllocationConfig = useCallback((accountId: string, configId: string | null) => {
    setStore((prev) => setUsAccountAllocationConfig(prev, accountId, configId))
  }, [])

  const addDividend = useCallback((record: Omit<UsDividendRecord, 'id'>) => {
    setStore((prev) => addUsDividend(prev, record))
  }, [])

  const removeDividend = useCallback((id: string) => {
    setStore((prev) => deleteUsDividend(prev, id))
  }, [])

  const bulkUpsertDividends = useCallback((records: Omit<UsDividendRecord, 'id'>[]) => {
    setStore((prev) => bulkUpsertUsDividends(prev, records))
  }, [])

  const setDividendEntryDate = useCallback((accountId: string, symbol: string, date: string) => {
    setStore((prev) => setUsDividendEntryDate(prev, accountId, symbol, date))
  }, [])

  const exportJSON = useCallback(() => exportUsStoreAsJSON(store), [store])

  const importJSON = useCallback((json: string): boolean => {
    const imported = importUsStoreFromJSON(json)
    if (!imported) return false
    setStore(imported)
    return true
  }, [])

  return {
    store,
    mounted,
    addAccount,
    updateAccount,
    deleteAccount,
    upsertHolding,
    deleteHolding: removeHolding,
    addTransaction,
    deleteTransaction: removeTransaction,
    updateSettings,
    addAllocationConfig,
    updateAllocationConfig,
    deleteAllocationConfig: removeAllocationConfig,
    duplicateAllocationConfig,
    setAccountAllocationConfig,
    addDividend,
    deleteDividend: removeDividend,
    bulkUpsertDividends,
    setDividendEntryDate,
    exportJSON,
    importJSON,
  }
}

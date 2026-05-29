/**
 * combined-sync.ts
 * 台股 + 美股「單一合併同步包」雲端同步。
 *
 * 同步包格式 v2：{ version: 2, tw: <台股 store>, us: <美股 store> }
 * 向後相容 v1（純台股 store，無 version / tw / us 欄位）：下載時自動辨識並只還原台股。
 *
 * 與 /api/kv-sync 配合：以使用者輸入的同步密碼為 key 上傳 / 下載整包 JSON。
 *
 * ⚠️ 美股同步 UI 目前保留接口、預設不顯示；台股設定頁的「上傳/下載」會帶上美股資料一起同步。
 */

import { loadStore, saveStore, importStoreFromJSON, exportStoreAsJSON } from './portfolio-store'
import {
  loadUsStore,
  saveUsStore,
  importUsStoreFromJSON,
  exportUsStoreAsJSON,
} from './us-portfolio-store'

export const SYNC_PACKAGE_VERSION = 2

export interface CombinedSyncPackage {
  version: number
  tw: unknown
  us: unknown
}

/** 把目前 localStorage 的台股 + 美股 store 打包成合併同步字串 */
export function buildCombinedSyncPayload(): string {
  const pkg: CombinedSyncPackage = {
    version: SYNC_PACKAGE_VERSION,
    tw: JSON.parse(exportStoreAsJSON(loadStore())),
    us: JSON.parse(exportUsStoreAsJSON(loadUsStore())),
  }
  return JSON.stringify(pkg)
}

interface ApplyResult {
  twOk: boolean
  usOk: boolean
}

/**
 * 解析雲端下載的字串並寫回 localStorage。
 * - v2 合併包：還原台股 + 美股
 * - v1 舊包（純台股 store）：只還原台股，美股維持現狀
 */
export function applyCombinedSyncPayload(raw: string): ApplyResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { twOk: false, usOk: false }
  }

  const maybePkg = parsed as Partial<CombinedSyncPackage>
  const isV2 = maybePkg && typeof maybePkg === 'object' && 'version' in maybePkg && (maybePkg.tw !== undefined || maybePkg.us !== undefined)

  if (isV2) {
    let twOk = false
    let usOk = false
    if (maybePkg.tw !== undefined) {
      const twStore = importStoreFromJSON(JSON.stringify(maybePkg.tw))
      if (twStore) {
        saveStore(twStore)
        twOk = true
      }
    }
    if (maybePkg.us !== undefined) {
      const usStore = importUsStoreFromJSON(JSON.stringify(maybePkg.us))
      if (usStore) {
        saveUsStore(usStore)
        usOk = true
      }
    }
    return { twOk, usOk }
  }

  // v1 向後相容：整包視為台股 store
  const twStore = importStoreFromJSON(raw)
  if (twStore) {
    saveStore(twStore)
    return { twOk: true, usOk: false }
  }
  return { twOk: false, usOk: false }
}

/** 上傳合併同步包到雲端（透過 /api/kv-sync） */
export async function uploadCombinedSync(passphrase: string): Promise<{ ok: boolean; error?: string }> {
  if (!passphrase.trim()) return { ok: false, error: '請輸入同步密碼' }
  try {
    const data = buildCombinedSyncPayload()
    const res = await fetch('/api/kv-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', passphrase: passphrase.trim(), data }),
    })
    const json = await res.json()
    if (res.ok) return { ok: true }
    return { ok: false, error: json.error ?? '上傳失敗' }
  } catch {
    return { ok: false, error: '網路錯誤，請稍後重試' }
  }
}

/**
 * 從雲端下載合併同步包並套用。
 * 回傳套用結果（哪些市場成功還原）。
 */
export async function downloadCombinedSync(
  passphrase: string,
): Promise<{ ok: boolean; error?: string; applied?: ApplyResult }> {
  if (!passphrase.trim()) return { ok: false, error: '請輸入同步密碼' }
  try {
    const res = await fetch('/api/kv-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'download', passphrase: passphrase.trim() }),
    })
    const json = await res.json()
    if (!res.ok || !json.data) {
      return { ok: false, error: json.error ?? '下載失敗' }
    }
    const applied = applyCombinedSyncPayload(json.data)
    if (!applied.twOk && !applied.usOk) {
      return { ok: false, error: '資料格式錯誤，可能是密碼錯誤或資料損壞' }
    }
    return { ok: true, applied }
  } catch {
    return { ok: false, error: '網路錯誤，請稍後重試' }
  }
}

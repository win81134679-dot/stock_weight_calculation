import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

interface CacheEntry<T> {
  expiresAt: number
  data: T
}

const memoryCache = new Map<string, CacheEntry<unknown>>()

function getCacheDir(): string {
  const base = process.env.TEMP || process.env.TMP || os.tmpdir()
  return path.join(base, 'stock_weight_calculation_us', 'cache')
}

function getCacheFile(key: string): string {
  const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, '_')
  return path.join(getCacheDir(), `${safeKey}.json`)
}

export async function readUsCache<T>(key: string): Promise<T | null> {
  const memoryHit = memoryCache.get(key)
  if (memoryHit && memoryHit.expiresAt > Date.now()) {
    return memoryHit.data as T
  }

  try {
    const raw = await fs.readFile(getCacheFile(key), 'utf8')
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (parsed.expiresAt <= Date.now()) return null
    memoryCache.set(key, parsed as CacheEntry<unknown>)
    return parsed.data
  } catch {
    return null
  }
}

export async function writeUsCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  const payload: CacheEntry<T> = {
    expiresAt: Date.now() + ttlMs,
    data,
  }
  memoryCache.set(key, payload as CacheEntry<unknown>)

  try {
    await fs.mkdir(getCacheDir(), { recursive: true })
    await fs.writeFile(getCacheFile(key), JSON.stringify(payload), 'utf8')
  } catch {
    // temp dir can fail on some environments; keep memory cache only
  }
}

export async function getUsCachedOrFetch<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await readUsCache<T>(key)
  if (cached !== null) return cached
  const fresh = await loader()
  await writeUsCache(key, fresh, ttlMs)
  return fresh
}

import { NextRequest, NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

// KV key prefix to avoid collisions
const KEY_PREFIX = 'portfolio_sync:'
// 1 year TTL in seconds
const TTL = 60 * 60 * 24 * 365

function getRedis() {
  // Support both Vercel KV integration naming (KV_REST_API_*) and direct Upstash naming
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    return null
  }
  return new Redis({ url, token })
}

function sanitizePassphrase(raw: string): string {
  // Allow only alphanumeric, dash, underscore, max 64 chars
  return raw.trim().replace(/[^a-zA-Z0-9\-_\u4e00-\u9fff]/g, '').slice(0, 64)
}

export async function POST(req: NextRequest) {
  const redis = getRedis()
  if (!redis) {
    return NextResponse.json(
      { error: '雲端同步未設定，請先在 Vercel 加入 Upstash Redis 整合' },
      { status: 503 }
    )
  }

  let body: { action: string; passphrase: string; data?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
  }

  const passphrase = sanitizePassphrase(body.passphrase ?? '')
  if (!passphrase) {
    return NextResponse.json({ error: '同步密碼不能為空' }, { status: 400 })
  }

  const key = KEY_PREFIX + passphrase

  if (body.action === 'upload') {
    if (!body.data || typeof body.data !== 'string') {
      return NextResponse.json({ error: '缺少資料欄位' }, { status: 400 })
    }
    // Limit payload to 1MB to prevent abuse
    if (body.data.length > 1_000_000) {
      return NextResponse.json({ error: '資料過大（最大 1MB）' }, { status: 413 })
    }
    await redis.set(key, body.data, { ex: TTL })
    return NextResponse.json({ ok: true, message: '已上傳同步成功' })
  }

  if (body.action === 'download') {
    const raw = await redis.get<string>(key)
    if (!raw) {
      return NextResponse.json(
        { error: '找不到此同步密碼的資料，請確認密碼正確或先在原裝置上傳' },
        { status: 404 }
      )
    }
    return NextResponse.json({ ok: true, data: raw })
  }

  return NextResponse.json({ error: '未知動作' }, { status: 400 })
}

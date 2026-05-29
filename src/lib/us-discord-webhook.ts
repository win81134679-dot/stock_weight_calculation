/**
 * us-discord-webhook.ts
 * 美股版 Discord 再平衡通知 — 對齊台股 discord-webhook.ts。
 * 以美東時間 (ET) 計算距再平衡天數，金額同時顯示 USD / TWD。
 */

import { UsSettings } from './us-types'
import { daysUntilUsRebalance } from './us-market'

const NOTIFIED_KEY = 'us-discord-notified-v1'

interface DiscordEmbed {
  title: string
  description: string
  color: number
  fields: { name: string; value: string; inline?: boolean }[]
  footer: { text: string }
}

interface DiscordPayload {
  username: string
  embeds: DiscordEmbed[]
}

function buildPayload(
  daysLeft: number,
  nextDate: string,
  combinedPnlPct: number,
  combinedPnlTwd: number,
  deviations: { name: string; deviation: number }[],
): DiscordPayload {
  const sign = combinedPnlPct >= 0 ? '+' : ''
  const twdSign = combinedPnlTwd >= 0 ? '+' : '-'
  const deviationText = deviations.length > 0
    ? deviations
        .map((item) => {
          const arrow = item.deviation > 1 ? '🔴↑過重' : item.deviation < -1 ? '🟢↓欠買' : '⚪持平'
          return `**${item.name}** ${arrow} ${item.deviation >= 0 ? '+' : ''}${item.deviation.toFixed(1)}%`
        })
        .join('\n')
    : '（尚無持倉資料）'

  return {
    username: '美股再平衡提醒 🔔',
    embeds: [
      {
        title: daysLeft <= 0 ? '📅 今日為再平衡日！' : `📅 再平衡倒數 ${daysLeft} 天`,
        description: `下次再平衡日期（美東）：**${nextDate}**`,
        color: daysLeft <= 3 ? 0xe74c3c : daysLeft <= 7 ? 0xf39c12 : 0x2ecc71,
        fields: [
          {
            name: '組合損益',
            value: `${sign}${combinedPnlPct.toFixed(2)}%（${twdSign}NT$${Math.abs(Math.round(combinedPnlTwd)).toLocaleString('zh-TW')}）`,
            inline: true,
          },
          {
            name: '距再平衡',
            value: daysLeft <= 0 ? '今天！' : `${daysLeft} 天`,
            inline: true,
          },
          {
            name: '配置偏差',
            value: deviationText,
          },
        ],
        footer: { text: '美股再平衡管理器 · 開啟網頁觸發' },
      },
    ],
  }
}

export async function sendUsDiscordNotification(
  webhookUrl: string,
  payload: DiscordPayload,
): Promise<boolean> {
  if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) return false
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function sendUsTestNotification(webhookUrl: string): Promise<boolean> {
  const payload: DiscordPayload = {
    username: '美股再平衡提醒 🔔',
    embeds: [
      {
        title: '✅ Webhook 連線測試成功',
        description: '美股再平衡管理器已成功連線到此頻道。',
        color: 0x2ecc71,
        fields: [],
        footer: { text: '這是一則測試訊息' },
      },
    ],
  }
  return sendUsDiscordNotification(webhookUrl, payload)
}

/**
 * 開啟網頁時檢查是否該通知。
 * 在 discordNotifyDaysBefore 天內推播，每日去重。
 */
export async function checkAndNotifyUsOnLoad(
  settings: UsSettings,
  combinedPnlPct: number,
  combinedPnlTwd: number,
  deviations: { name: string; deviation: number }[],
  nextRebalanceDate?: string,
): Promise<void> {
  const { discordWebhookUrl, discordNotifyDaysBefore } = settings
  if (!discordWebhookUrl || !nextRebalanceDate) return

  const daysLeft = daysUntilUsRebalance(nextRebalanceDate)
  if (daysLeft > discordNotifyDaysBefore) return

  const todayKey = new Date().toISOString().split('T')[0]
  try {
    if (localStorage.getItem(NOTIFIED_KEY) === todayKey) return
  } catch {
    // localStorage unavailable
  }

  const payload = buildPayload(daysLeft, nextRebalanceDate, combinedPnlPct, combinedPnlTwd, deviations)
  const ok = await sendUsDiscordNotification(discordWebhookUrl, payload)
  if (ok) {
    try {
      localStorage.setItem(NOTIFIED_KEY, todayKey)
    } catch {
      // ignore
    }
  }
}

/**
 * discord-webhook.ts
 * Send rebalance notifications to a Discord channel via Webhook.
 * Triggered on page load when approaching rebalance date.
 */

import { RebalanceSettings } from './types'
import { daysUntilRebalance } from './rebalance-calculator'

const NOTIFIED_KEY = 'discord-notified-v1'

interface DiscordEmbed {
  title: string
  description: string
  color: number       // decimal color int
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
  deviations: { name: string; deviation: number }[]
): DiscordPayload {
  const sign = combinedPnlPct >= 0 ? '+' : ''
  const deviationText = deviations.length > 0
    ? deviations
        .map((d) => {
          const arrow = d.deviation > 1 ? '🔴↑過重' : d.deviation < -1 ? '🟢↓欠買' : '⚪持平'
          return `**${d.name}** ${arrow} ${d.deviation >= 0 ? '+' : ''}${d.deviation.toFixed(1)}%`
        })
        .join('\n')
    : '（尚無持倉資料）'

  return {
    username: '再平衡提醒 🔔',
    embeds: [
      {
        title: daysLeft <= 0
          ? '📅 今日為再平衡日！'
          : `📅 再平衡倒數 ${daysLeft} 天`,
        description: `下次再平衡日期：**${nextDate}**`,
        color: daysLeft <= 3 ? 0xe74c3c : daysLeft <= 7 ? 0xf39c12 : 0x2ecc71,
        fields: [
          {
            name: '組合損益',
            value: `${sign}${combinedPnlPct.toFixed(2)}%`,
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
        footer: { text: '台股再平衡管理器 · 開啟網頁觸發' },
      },
    ],
  }
}

/**
 * Send a webhook notification.
 * Returns true on success.
 */
export async function sendDiscordNotification(
  webhookUrl: string,
  payload: DiscordPayload
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

/**
 * Send a test notification (called from Settings page).
 */
export async function sendTestNotification(webhookUrl: string): Promise<boolean> {
  const payload: DiscordPayload = {
    username: '再平衡提醒 🔔',
    embeds: [
      {
        title: '✅ Webhook 連線測試成功',
        description: '台股再平衡管理器已成功連線到此頻道。',
        color: 0x2ecc71,
        fields: [],
        footer: { text: '這是一則測試訊息' },
      },
    ],
  }
  return sendDiscordNotification(webhookUrl, payload)
}

/**
 * Check on page load whether we should notify.
 * Notifies if within `discordNotifyDaysBefore` days of nextRebalanceDate.
 * Deduplicates: only one notification per calendar day.
 */
export async function checkAndNotifyOnLoad(
  settings: RebalanceSettings,
  combinedPnlPct: number,
  deviations: { name: string; deviation: number }[],
  nextRebalanceDate?: string
): Promise<void> {
  const { discordWebhookUrl, discordNotifyDaysBefore } = settings
  if (!discordWebhookUrl || !nextRebalanceDate) return

  const daysLeft = daysUntilRebalance(nextRebalanceDate)
  if (daysLeft > discordNotifyDaysBefore) return

  // Deduplicate — only notify once per day
  const todayKey = new Date().toISOString().split('T')[0]
  try {
    const last = localStorage.getItem(NOTIFIED_KEY)
    if (last === todayKey) return
  } catch {
    // localStorage unavailable
  }

  const payload = buildPayload(daysLeft, nextRebalanceDate, combinedPnlPct, deviations)
  const ok = await sendDiscordNotification(discordWebhookUrl, payload)
  if (ok) {
    try {
      localStorage.setItem(NOTIFIED_KEY, todayKey)
    } catch {
      // ignore
    }
  }
}

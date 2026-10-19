// Send a plain-text message to Telegram. With dryRun (or no credentials) it prints instead of sending.
export async function notify(text, { dryRun = false, env = process.env, fetchImpl = fetch } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN, chat = env.TELEGRAM_CHAT_ID;
  if (dryRun || !token || !chat) { console.log(`[dry-run] would send:\n${text}`); return { sent: false }; }
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ chat_id: chat, text, disable_web_page_preview: 'true' }),
  });
  return { sent: res.ok, status: res.status };
}

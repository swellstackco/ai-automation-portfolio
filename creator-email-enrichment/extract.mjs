// Pure helpers: email extraction, de-obfuscation, junk filtering, link classification. No I/O.
export const JUNK_DOMAIN = /(^|\.)(example\.(com|org|net)|sentry(\.io|-next\.wixpress\.com)?|wixpress\.com|sentry\.wixpress\.com|domain\.com|doe\.com|email\.com|yourdomain\.com|yoursite\.com|test\.com|mysite\.com|schema\.org|w3\.org|googleusercontent\.com|ingest\.sentry\.io|youtube\.com|gstatic\.com|google\.com|linktr\.ee|godaddy\.com|squarespace\.com|shopify\.com|wix\.com|cloudflare\.com|beacons\.ai)$/i;
export const JUNK_LOCAL = /^(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse|webmaster|privacy|dmca|copyright|legal|you|your|name|user|username|email|example|test|sentry|first\.?last|support@youtube)$/i;
export const IMG_TLD = /\.(png|jpe?g|gif|webp|svg|avif|ico|css|js|json|woff2?|ttf|mp4|webm|map)$/i;
export const BIZ_CTX = /(business|b2b|inquir|enquir|management|manager|mgmt|sponsor|collab|partner|press|booking|promo|agent|advertis|submissions?|contact|e-?mail|work)/i;
export const BIZ_LOCAL = /(business|biz|inquir|enquir|manage|mgmt|sponsor|collab|partner|press|booking|promo|ads|advertis|submission|contact|hello|hi|info|team)/i;

export function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|#x27|commat|period|#64|#46);/gi, (m, e) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", '#x27': "'", commat: '@', period: '.', '#64': '@', '#46': '.' })[e.toLowerCase()])
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
}
export function normalizeText(s) {
  s = s.replace(/\\u0040/gi, '@').replace(/\\u002e/gi, '.').replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\\//g, '/').replace(/\\n/g, '\n');
  s = decodeEntities(s);
  // cloudflare email protection
  s = s.replace(/data-cfemail="([0-9a-f]+)"/gi, (m, hex) => {
    try { const k = parseInt(hex.slice(0, 2), 16); let o = ''; for (let i = 2; i < hex.length; i += 2) o += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return ' ' + o + ' '; } catch { return m; }
  });
  s = s.replace(/%40/gi, '@').replace(/mailto:/gi, ' mailto:');
  return s;
}
const EMAIL_RE = /[A-Za-z0-9][A-Za-z0-9._%+-]{0,63}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}/g;
const OBF_RE = /([A-Za-z0-9][A-Za-z0-9._%+-]{0,63})\s*[\[\(\{<]\s*(?:at|@)\s*[\]\)\}>]\s*((?:[A-Za-z0-9-]+\s*(?:[\[\(\{<]\s*(?:dot|\.)\s*[\]\)\}>]|\.)\s*)+[A-Za-z]{2,24})/gi;

// returns [{email, ctx}]
export function extractEmails(raw) {
  const text = normalizeText(raw);
  const out = [];
  for (const m of text.matchAll(EMAIL_RE)) out.push({ email: m[0], ctx: text.slice(Math.max(0, m.index - 90), m.index) });
  for (const m of text.matchAll(OBF_RE)) {
    const dom = m[2].replace(/\s*[\[\(\{<]\s*dot\s*[\]\)\}>]\s*/gi, '.').replace(/\s+/g, '');
    out.push({ email: m[1] + '@' + dom, ctx: text.slice(Math.max(0, m.index - 90), m.index) });
  }
  return out;
}
export function cleanEmail(e) {
  e = e.toLowerCase().replace(/^[._%+-]+/, '').replace(/[.]+$/, '');
  const m = e.match(/^([^@]+)@(.+)$/); if (!m) return null;
  const [, l, d] = m;
  if (IMG_TLD.test(d) || /@\d+x\./.test(e) || /^\d+x$/.test(l)) return null;
  if (JUNK_DOMAIN.test(d) || JUNK_LOCAL.test(l)) return null;
  if (/^[0-9a-f]{24,}$/.test(l)) return null; // sentry hashes
  if (l.length > 64 || !/^[a-z0-9._%+-]+$/.test(l)) return null;
  if (/\.\./.test(e)) return null;
  return e;
}
export function classify(u) {
  let h; try { h = new URL(u).hostname.replace(/^(www|m|mobile)\./, ''); } catch { return null; }
  if (/^(twitter|x)\.com$/.test(h)) return 'twitter';
  if (/^instagram\.com$/.test(h)) return 'instagram';
  if (/(^|\.)tiktok\.com$/.test(h)) return 'tiktok';
  if (/(^|\.)twitch\.tv$/.test(h)) return 'twitch';
  if (/^(discord\.gg|discord\.com|discordapp\.com)$/.test(h)) return 'discord';
  if (/^(linktr\.ee|beacons\.ai|carrd\.co|linktree\.com|lnk\.bio|bio\.link|solo\.to|allmylinks\.com|campsite\.bio|msha\.ke|hoo\.be|withkoji\.com|taplink\.cc|lnk\.to|linkin\.bio)$/.test(h) || /\.carrd\.co$/.test(h) || /\.bio\.link$/.test(h)) return 'hub';
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'youtube';
  if (/^(facebook|fb)\.com$|^(patreon|ko-fi|paypal|streamlabs|steamcommunity|store\.steampowered|amazon|amzn|reddit|spotify|apple|bit\.ly|t\.co|goo\.gl|tinyurl|snapchat|pinterest|threads|bsky|kick|linkedin|github|gofundme|streamelements|cash\.app|venmo)\b/.test(h) || /\.(spotify|apple|amazon)\.com$/.test(h)) return 'social-other';
  return 'website';
}

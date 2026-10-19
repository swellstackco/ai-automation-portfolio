#!/usr/bin/env node
// creator-emails: gather PUBLIC contact info for YouTube creators. See README.md.
// Usage: node find.mjs <in.csv> <out.csv> [--refresh] [--limit N] [--concurrency N] [--first REGEX]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import { fileURLToPath } from 'node:url';
import { decodeEntities, BIZ_CTX, BIZ_LOCAL, extractEmails, cleanEmail, normalizeText, classify } from './extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache');
const PAGES = path.join(CACHE, 'pages');
const ROWS = path.join(CACHE, 'rows');
for (const d of [PAGES, ROWS]) fs.mkdirSync(d, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const API_KEY = process.env.YOUTUBE_API_KEY || '';
const MAX_BODY = 2_500_000;
const MAX_EXT_LINKS = 8;

// ---------- args ----------
const args = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const k = args[i].slice(2);
    if (['refresh'].includes(k)) flags[k] = true; else flags[k] = args[++i];
  } else pos.push(args[i]);
}
if (pos.length < 2) { console.error('usage: node find.mjs <in.csv> <out.csv> [--refresh] [--limit N] [--concurrency N] [--first REGEX]'); process.exit(1); }
const [IN, OUT] = pos;
if (path.resolve(IN) === path.resolve(OUT)) { console.error('refusing to overwrite the input file'); process.exit(1); }
const CONC = Number(flags.concurrency || 6);
const FIRST = new RegExp(flags.first || '^$', 'i');

// ---------- csv ----------
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const csvCell = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };

// ---------- http: per-host throttle, 429 backoff, robots ----------
const hostNext = new Map(); // host -> next allowed ts
async function throttle(host) {
  const now = Date.now();
  const t = Math.max(now, hostNext.get(host) || 0);
  hostNext.set(host, t + 1000);
  if (t > now) await new Promise((r) => setTimeout(r, t - now));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hashOf = (s) => crypto.createHash('sha1').update(s).digest('hex');
const isYT = (h) => /(^|\.)(youtube\.com|youtu\.be|google\.com)$/.test(h);

const robotsCache = new Map();
async function robotsAllows(u) {
  const url = new URL(u);
  if (isYT(url.hostname)) return true;
  let rules = robotsCache.get(url.origin);
  if (!rules) {
    rules = [];
    const r = await rawFetch(url.origin + '/robots.txt', { robots: true });
    if (r.status === 200 && r.body) {
      let applies = false, seenAgent = false, star = [], mine = [];
      for (const line of r.body.split(/\r?\n/)) {
        const m = line.replace(/#.*/, '').match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*$/);
        if (!m) continue;
        const k = m[1].toLowerCase(), v = m[2];
        if (k === 'user-agent') { if (!seenAgent) applies = false; seenAgent = true; applies = applies || v === '*'; }
        else { seenAgent = false; if (applies && (k === 'disallow' || k === 'allow') && v !== '') star.push([k, v]); }
      }
      rules = star;
    }
    robotsCache.set(url.origin, rules);
  }
  const target = url.pathname + url.search;
  let best = null;
  for (const [k, v] of rules) {
    const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    if (re.test(target) && (!best || v.length >= best[1].length)) best = [k, v];
  }
  return !(best && best[0] === 'disallow');
}

async function rawFetch(url, opts = {}) {
  const host = new URL(url).hostname;
  let attempt = 0;
  for (;;) {
    await throttle(host);
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, {
        redirect: 'follow', signal: ctrl.signal,
        headers: {
          'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(isYT(host) ? { Cookie: 'SOCS=CAI; CONSENT=YES+1' } : {}),
        },
      });
      clearTimeout(to);
      if (res.status === 429 || res.status === 503) {
        if (++attempt > 4) return { status: res.status, body: '', finalUrl: res.url };
        const ra = Number(res.headers.get('retry-after'));
        const wait = (ra > 0 ? ra * 1000 : 5000 * 2 ** attempt);
        hostNext.set(host, Date.now() + wait);
        console.error(`  429/503 from ${host}, backing off ${Math.round(wait / 1000)}s`);
        continue;
      }
      const ct = res.headers.get('content-type') || '';
      let body = '';
      if (/text|json|xml|html/i.test(ct) || !ct) body = (await res.text()).slice(0, MAX_BODY);
      return { status: res.status, body, finalUrl: res.url };
    } catch (e) {
      if (++attempt > 2) return { status: 0, body: '', error: String(e.cause?.code || e.message) };
      await sleep(1500);
    }
  }
}

// Cached fetch. Never submits forms: GET only.
async function get(url, { robots = true } = {}) {
  const f = path.join(PAGES, hashOf(url) + '.json');
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} }
  if (robots && !(await robotsAllows(url))) return { status: -1, body: '', skipped: 'robots.txt' };
  const r = await rawFetch(url);
  r.url = url;
  if (r.status !== 0) fs.writeFileSync(f, JSON.stringify(r)); // don't cache network errors
  return r;
}

// ---------- email extraction ----------
const mxCache = (() => { try { return JSON.parse(fs.readFileSync(path.join(CACHE, 'mx.json'), 'utf8')); } catch { return {}; } })();
async function mxOk(domain) {
  if (domain in mxCache) return mxCache[domain];
  let ok = false;
  try { ok = (await dns.resolveMx(domain)).length > 0; } catch (e) {
    if (e.code === 'ENODATA') { try { ok = (await dns.resolve4(domain)).length > 0; } catch {} } // implicit-MX fallback (A record)
    else if (e.code === 'ETIMEOUT' || e.code === 'ECONNREFUSED' || e.code === 'ESERVFAIL') return true; // unknown: don't cache, don't reject
  }
  mxCache[domain] = ok;
  return ok;
}

// ---------- youtube parsing ----------
function balancedJson(html, marker) {
  const i = html.indexOf(marker); if (i < 0) return null;
  let s = html.indexOf('{', i); if (s < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let k = s; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { if (--depth === 0) { try { return JSON.parse(html.slice(s, k + 1)); } catch { return null; } } }
  }
  return null;
}
function walk(o, fn) { if (Array.isArray(o)) o.forEach((v) => walk(v, fn)); else if (o && typeof o === 'object') { fn(o); for (const v of Object.values(o)) walk(v, fn); } }
function unwrapRedirect(u) {
  try { const x = new URL(u); if (/youtube\.com$/.test(x.hostname) && x.pathname === '/redirect' && x.searchParams.get('q')) return x.searchParams.get('q'); } catch {}
  return u;
}
function urlsIn(text) { return [...(text || '').matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((m) => m[0].replace(/[.,;:!?]+$/, '')); }

function parseAbout(html) {
  const out = { description: '', links: [], channelId: '', manualButton: false, title: '' };
  const data = balancedJson(html, 'var ytInitialData');
  const mid = html.match(/"externalId":"(UC[\w-]{20,})"/) || html.match(/channel_id=(UC[\w-]{20,})/) || html.match(/"channelId":"(UC[\w-]{20,})"/);
  if (mid) out.channelId = mid[1];
  if (data) {
    walk(data, (o) => {
      if (o.aboutChannelViewModel) {
        const a = o.aboutChannelViewModel;
        out.description = a.description || out.description;
        out.channelId = a.channelId || out.channelId;
        if (a.signInForBusinessEmail || a.businessEmailLabel) out.manualButton = true;
        for (const l of a.links || []) {
          const v = l.channelExternalLinkViewModel; if (!v) continue;
          const cmd = v.link?.commandRuns?.[0]?.onTap?.innertubeCommand?.urlEndpoint?.url || '';
          const url = unwrapRedirect(cmd || ('https://' + (v.link?.content || '')));
          if (url) out.links.push({ title: v.title?.content || '', url });
        }
      }
      if (o.channelMetadataRenderer) { out.title = o.channelMetadataRenderer.title || out.title; if (!out.description) out.description = o.channelMetadataRenderer.description || ''; }
      // older layout
      if (o.channelHeaderLinksViewModel || o.channelHeaderLinksRenderer) {
        walk(o, (p) => { if (p.urlEndpoint?.url) out.links.push({ title: '', url: unwrapRedirect(p.urlEndpoint.url) }); });
      }
    });
  }
  if (/View email address|Sign in to see email address/i.test(html)) out.manualButton = true;
  if (!out.description) { const m = html.match(/<meta property="og:description" content="([^"]*)"/); if (m) out.description = decodeEntities(m[1]); }
  return out;
}

function parseFeed(xml) {
  const entries = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    entries.push({
      id: (e.match(/<yt:videoId>([^<]+)/) || [])[1],
      title: decodeEntities((e.match(/<title>([^<]*)/) || [])[1] || ''),
      desc: decodeEntities((e.match(/<media:description>([\s\S]*?)<\/media:description>/) || [])[1] || ''),
    });
  }
  return entries.slice(0, 5);
}
function watchDescription(html) {
  const m = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!m) return '';
  try { return JSON.parse('"' + m[1] + '"'); } catch { return m[1]; }
}

async function apiChannel(handleOrId) {
  if (!API_KEY) return null;
  const q = handleOrId.startsWith('UC') ? `id=${handleOrId}` : `forHandle=${encodeURIComponent(handleOrId)}`;
  const r = await get(`https://www.googleapis.com/youtube/v3/channels?part=snippet,brandingSettings&${q}&key=${API_KEY}`, { robots: false });
  try { const j = JSON.parse(r.body); const it = j.items?.[0]; if (!it) return null; return { id: it.id, description: [it.snippet?.description, it.brandingSettings?.channel?.description].filter(Boolean).join('\n'), title: it.snippet?.title }; } catch { return null; }
}

function twitterHandle(u) { try { const x = new URL(u); const p = x.pathname.split('/').filter(Boolean)[0]; return p && !/^(intent|share|home|i|hashtag|search)$/i.test(p) ? p : ''; } catch { return ''; } }

// ---------- per-row work ----------
function origEmails(row) {
  const out = [];
  for (const k of ['public_email', 'business_contact']) for (const x of extractEmails(row[k] || '')) { const e = cleanEmail(x.email); if (e && !out.includes(e)) out.push(e); }
  return out;
}

async function processRow(row) {
  const url = row.channel_url.trim();
  const contacts = []; // {email, source, kind, score}
  const socials = { twitter: [], discord: [], instagram: [], tiktok: [], twitch: [], website: [] };
  const notes = [];
  let manual = false;

  const addEmails = (text, source, kind, base) => {
    for (const x of extractEmails(text)) {
      const e = cleanEmail(x.email); if (!e) continue;
      let score = base;
      if (BIZ_CTX.test(x.ctx.slice(-60))) score += 3;
      if (BIZ_LOCAL.test(e.split('@')[0])) score += 2;
      if (/^(support|help|sales|billing|orders)$/.test(e.split('@')[0])) score -= 4;
      if (/@(gmail|yahoo|hotmail|outlook|icloud|protonmail|proton)\./.test(e)) score += 0; else score += 1; // own-domain mail looks more business-like
      const ex = contacts.find((c) => c.email === e);
      if (ex && ex.kind === 'original') { if (ex.source === 'original-csv') ex.source = source + ' (also in original csv)'; } else if (ex) { if (score > ex.score) Object.assign(ex, { score, source, kind }); } else contacts.push({ email: e, source, kind, score });
    }
  };

  // original
  for (const e of origEmails(row)) contacts.push({ email: e, source: 'original-csv', kind: 'original', score: 100 });

  // 1. about page
  let handle = '';
  try { handle = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean)[0] || ''); } catch {}
  const base = url.replace(/\/+$/, '').replace(/\/(about|videos|featured|streams|shorts)$/, '');
  const aboutRes = await get(base + '/about', { robots: false });
  let about = { description: '', links: [], channelId: '', manualButton: false };
  if (aboutRes.status === 200) about = parseAbout(aboutRes.body); else notes.push('about:' + (aboutRes.status || aboutRes.error));
  if (API_KEY) {
    const a = await apiChannel(handle.startsWith('@') ? handle : (handle.startsWith('UC') ? handle : handle));
    if (a) { about.channelId ||= a.id; about.description = about.description || a.description; if (a.description) addEmails(a.description, 'youtube-api:' + a.id, 'about', 5); }
  }
  manual = about.manualButton;
  addEmails(about.description, base + '/about', 'about', 5);

  const links = [];
  const pushLink = (u, from) => { try { const x = new URL(u); if (!/^https?:$/.test(x.protocol)) return; u = x.href; } catch { return; } if (!links.find((l) => l.url === u)) links.push({ url: u, from }); };
  about.links.forEach((l) => pushLink(l.url, 'about-links'));
  urlsIn(about.description).forEach((u) => pushLink(u, 'about-desc'));

  // 2. recent videos via RSS
  const vids = [];
  if (about.channelId) {
    const feed = await get(`https://www.youtube.com/feeds/videos.xml?channel_id=${about.channelId}`, { robots: false });
    if (feed.status === 200) {
      for (const v of parseFeed(feed.body)) {
        let desc = v.desc;
        if (!desc && v.id) { const w = await get(`https://www.youtube.com/watch?v=${v.id}`, { robots: false }); if (w.status === 200) desc = watchDescription(w.body); }
        const src = `https://www.youtube.com/watch?v=${v.id}`;
        addEmails(desc, src, 'video', 3);
        urlsIn(desc).forEach((u) => { const c = classify(u); if (['hub', 'twitter', 'instagram', 'tiktok', 'twitch', 'discord'].includes(c)) pushLink(u, 'video-desc'); else if (c === 'website' && /contact|business|press|about/i.test(u)) pushLink(u, 'video-desc'); });
        vids.push(src);
      }
    } else notes.push('rss:' + feed.status);
  } else notes.push('no-channel-id');

  // 3. external links
  let ext = 0;
  const fetched = new Set();
  const visit = async (u, kind, via) => {
    if (fetched.has(u)) return null; fetched.add(u);
    const r = await get(u);
    if (r.status === 200) { addEmails(r.body, u, kind, kind === 'hub' || kind === 'website' ? 4 : 2); return r; }
    if (r.skipped) notes.push(`robots-skip:${new URL(u).hostname}`);
    return null;
  };
  for (const l of links) {
    const kind = classify(l.url);
    if (!kind || kind === 'youtube' || kind === 'social-other') continue;
    if (kind === 'twitter') { const h = twitterHandle(l.url); if (h) socials.twitter.push('https://x.com/' + h.toLowerCase()); }
    else if (kind === 'discord') socials.discord.push(l.url);
    else if (kind === 'instagram') socials.instagram.push(l.url);
    else if (kind === 'tiktok') socials.tiktok.push(l.url);
    else if (kind === 'twitch') socials.twitch.push(l.url);
    else if (kind === 'website' || kind === 'hub') socials.website.push(l.url);
    if (kind === 'discord') continue; // invite pages hold no email; record only
    if (ext >= MAX_EXT_LINKS) continue;
    ext++;
    const r = await visit(l.url, kind, l.from);
    if (r && kind === 'website') {
      // own-domain /contact and /about, plus mailto/contact links on that page
      const origin = new URL(l.url).origin;
      const cands = new Set(['/contact', '/about']);
      for (const m of r.body.matchAll(/href=["']([^"'#]+)["']/gi)) {
        try { const x = new URL(decodeEntities(m[1]), l.url); if (x.origin === origin && /\/(contact|business|about|press|inquir)/i.test(x.pathname) && x.pathname.length < 40) cands.add(x.pathname); } catch {}
      }
      let n = 0;
      for (const p of cands) { if (n++ >= 4) break; await visit(origin + p, 'website', 'own-domain'); }
    }
  }

  // validation: syntax already done; MX
  const valid = [];
  for (const c of contacts) {
    const d = c.email.split('@')[1];
    if (c.kind === 'original' || await mxOk(d)) valid.push(c); else notes.push('no-mx:' + c.email);
  }
  valid.sort((a, b) => b.score - a.score);
  const best = valid[0];
  const uniq = (a) => [...new Set(a)];
  return {
    channel_url: url, channelId: about.channelId,
    emails_found: valid.map((c) => c.email).join(';'),
    best_email: best ? best.email : '',
    email_source_url: best ? best.source : '',
    twitter: uniq(socials.twitter).join(';'), discord: uniq(socials.discord).join(';'), instagram: uniq(socials.instagram).join(';'),
    tiktok: uniq(socials.tiktok).join(';'), twitch: uniq(socials.twitch).join(';'), website: uniq(socials.website).join(';'),
    manual_email_button: manual ? 'yes' : 'no',
    last_checked: new Date().toISOString().slice(0, 10),
    contact_sources: valid.map((c) => `${c.email} <- ${c.source}`).join(' | '),
    notes: uniq(notes).join(' '),
  };
}

// ---------- main ----------
const NEW_COLS = ['emails_found', 'best_email', 'email_source_url', 'twitter', 'discord', 'instagram', 'tiktok', 'twitch', 'website', 'manual_email_button', 'last_checked', 'contact_sources', 'notes'];
const t0 = Date.now();
const table = parseCsv(fs.readFileSync(IN, 'utf8'));
const header = table.shift();
let rows = table.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
if (!header.includes('channel_url')) { console.error('no channel_url column'); process.exit(1); }
if (flags.limit) rows = rows.slice(0, Number(flags.limit));

const rowFile = (r) => path.join(ROWS, hashOf(r.channel_url.trim()) + '.json');
function writeOut() {
  const cols = [...header, ...NEW_COLS];
  const lines = [cols.join(',')];
  for (const r of rows) {
    let res = {}; try { res = JSON.parse(fs.readFileSync(rowFile(r), 'utf8')); } catch {}
    lines.push(cols.map((c) => csvCell(NEW_COLS.includes(c) ? res[c] : r[c])).join(','));
  }
  fs.writeFileSync(OUT, lines.join('\n') + '\n');
}

const order = rows.map((r, i) => ({ r, i })).sort((a, b) => (FIRST.test(b.r.channel_name + b.r.channel_url) - FIRST.test(a.r.channel_name + a.r.channel_url)) || a.i - b.i).map((x) => x.r);
const todo = order.filter((r) => flags.refresh || !fs.existsSync(rowFile(r)));
console.error(`${rows.length} rows, ${rows.length - todo.length} cached, ${todo.length} to fetch${API_KEY ? ' (YouTube API key in use)' : ''}`);
let done = 0, idx = 0;
async function worker() {
  while (idx < todo.length) {
    const r = todo[idx++];
    try {
      const res = await processRow(r);
      fs.writeFileSync(rowFile(r), JSON.stringify(res));
      done++;
      console.error(`[${done}/${todo.length}] ${r.channel_name}: ${res.best_email || '-'}${res.manual_email_button === 'yes' ? ' [manual button]' : ''}`);
    } catch (e) { console.error(`ERROR ${r.channel_name}: ${e.stack || e}`); }
    if (done % 10 === 0) { fs.writeFileSync(path.join(CACHE, 'mx.json'), JSON.stringify(mxCache)); writeOut(); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
fs.writeFileSync(path.join(CACHE, 'mx.json'), JSON.stringify(mxCache));
writeOut();

// summary
const res = rows.map((r) => { try { return JSON.parse(fs.readFileSync(rowFile(r), 'utf8')); } catch { return null; } });
const before = rows.filter((r) => origEmails(r).length).length;
const after = res.filter((x) => x && x.best_email).length;
const manualOnly = res.filter((x, i) => x && x.manual_email_button === 'yes' && !x.best_email).length;
console.log(`\nSummary (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`rows: ${rows.length}`);
console.log(`with email before: ${before}`);
console.log(`with best_email after: ${after}`);
console.log(`new emails found for rows that had none: ${rows.filter((r, i) => !origEmails(r).length && res[i] && res[i].best_email).length}`);
console.log(`manual_email_button=yes: ${res.filter((x) => x && x.manual_email_button === 'yes').length} (no email at all: ${manualOnly})`);
console.log(`output: ${OUT}`);

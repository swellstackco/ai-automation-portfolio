#!/usr/bin/env node
// Alert when inbound leads sit in status "new" for more than N hours (default 48).
// Runs from cron; silent when there is nothing to report. Reads a JSON array of
// { name, status, ts } rows and never writes to it.
//   node lead-age-alert.mjs --leads leads.json [--hours 48] [--count] [--dry-run]
import { readFileSync } from 'node:fs';
import { notify } from './notify.mjs';

export function staleLeads(leads, { hours = 48, now = Date.now() } = {}) {
  const cutoff = now - hours * 3600e3;
  return leads.filter((l) => l.status === 'new' && Date.parse(l.ts) < cutoff);
}

/** Group by first name + day so a burst of duplicates is one line ("Sam 2026-01-03 (x3)"). */
export function summarize(stale, hours = 48) {
  const by = new Map();
  for (const l of stale) {
    const k = `${String(l.name || '?').split(/\s+/)[0]} ${l.ts.slice(0, 10)}`;
    by.set(k, (by.get(k) || 0) + 1);
  }
  const lines = [...by].sort((a, b) => a[0].split(' ')[1].localeCompare(b[0].split(' ')[1]))
    .map(([k, n]) => `- ${k}${n > 1 ? ` (x${n})` : ''}`);
  return `${stale.length} lead(s) still "new" after ${hours}h\n${lines.join('\n')}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const arg = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
  const hours = Number(arg('--hours', 48));
  const stale = staleLeads(JSON.parse(readFileSync(arg('--leads'), 'utf8')), { hours });
  if (a.includes('--count')) console.log(stale.length);
  else if (!stale.length) console.log('no stale leads');
  else await notify(summarize(stale, hours), { dryRun: a.includes('--dry-run') });
}

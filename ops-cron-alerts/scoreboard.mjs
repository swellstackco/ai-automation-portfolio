#!/usr/bin/env node
// Weekly scoreboard from local numbers only (no LLM, no third-party calls besides the alert):
// stale leads + last-7-day sales from a CSV (date,sku,title,units,proceeds_per_unit).
//   node scoreboard.mjs --leads leads.json --sales sales.csv [--dry-run]
import { readFileSync } from 'node:fs';
import { staleLeads } from './lead-age-alert.mjs';
import { notify } from './notify.mjs';

export function salesLastDays(csv, days = 7, now = Date.now()) {
  const since = new Date(now - days * 864e5).toISOString().slice(0, 10);
  let units = 0, proceeds = 0;
  for (const line of csv.trim().split('\n').slice(1)) {
    const [date, , , u, p] = line.split(',');
    if (date >= since) { units += Number(u); proceeds += Number(u) * Number(p); }
  }
  return { units, proceeds };
}

export function render({ stale, sales, date }) {
  return [
    `# Scoreboard ${date}`,
    `1. Stale leads (new > 48h): ${stale}`,
    `2. Sales last 7 days: ${sales.units} units, $${sales.proceeds.toFixed(2)}`,
  ].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  const arg = (k) => a[a.indexOf(k) + 1];
  const now = Date.now();
  const text = render({
    stale: staleLeads(JSON.parse(readFileSync(arg('--leads'), 'utf8')), { now }).length,
    sales: salesLastDays(readFileSync(arg('--sales'), 'utf8'), 7, now),
    date: new Date(now).toISOString().slice(0, 10),
  });
  console.log(text);
  await notify(text, { dryRun: a.includes('--dry-run') });
}

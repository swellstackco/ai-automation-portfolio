import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleLeads, summarize } from '../lead-age-alert.mjs';
import { salesLastDays, render } from '../scoreboard.mjs';
import { notify } from '../notify.mjs';

const now = Date.parse('2026-03-10T12:00:00Z');
const leads = [
  { name: 'Sam Rivera', status: 'new', ts: '2026-03-05T09:00:00Z' },
  { name: 'Sam Lee', status: 'new', ts: '2026-03-05T15:00:00Z' },
  { name: 'Alex Park', status: 'new', ts: '2026-03-07T09:00:00Z' },
  { name: 'Jo Kim', status: 'contacted', ts: '2026-03-01T09:00:00Z' },
  { name: 'Pat Doe', status: 'new', ts: '2026-03-10T08:00:00Z' },
];

test('only old rows still "new" are stale', () => {
  assert.equal(staleLeads(leads, { now }).length, 3);
  assert.equal(staleLeads(leads, { now, hours: 200 }).length, 0);
});

test('summary groups duplicates by first name and day, oldest first', () => {
  const s = summarize(staleLeads(leads, { now }));
  assert.match(s, /^3 lead\(s\)/);
  assert.match(s, /- Sam 2026-03-05 \(x2\)\n- Alex 2026-03-07$/);
});

test('sales window sums units and proceeds for the last 7 days only', () => {
  const csv = 'date,sku,title,units,proceeds_per_unit\n2026-03-09,A,App,2,3\n2026-03-04,A,App,5,3\n2026-03-01,A,App,9,3\n';
  assert.deepEqual(salesLastDays(csv, 7, now), { units: 7, proceeds: 21 });
  assert.match(render({ stale: 3, sales: { units: 7, proceeds: 21 }, date: '2026-03-10' }), /7 units, \$21\.00/);
});

test('notify never calls the network in dry-run or without credentials', async () => {
  const boom = () => { throw new Error('network used'); };
  const log = console.log; console.log = () => {};
  try {
    assert.equal((await notify('x', { dryRun: true, env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' }, fetchImpl: boom })).sent, false);
    assert.equal((await notify('x', { env: {}, fetchImpl: boom })).sent, false);
  } finally { console.log = log; }
});

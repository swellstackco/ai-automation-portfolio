#!/usr/bin/env node
// Waits for a draft review submission to appear for an app, attaches the latest version if the
// draft is empty, submits it, and reports the in-app-purchase state.
//
// Why it exists: the store requires a human to click "Add for Review" in the web UI before the API
// can finish the submission. This turns "refresh the page all day" into a poller that completes
// the API half the moment the click happens.
//
//   node watch-submission.mjs --dry-run     # no network; runs against a scripted fake API
//   node watch-submission.mjs               # live; needs the env vars in .env.example
import { tokenSource } from './jwt.mjs';
import { makeClient } from './client.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Core loop, separated from I/O so it can be unit tested. Returns { code, log }. */
export async function watch({ api, appId, pollMs = 60_000, maxMs = 48 * 3600e3, log = console.log, wait = sleep, clock = Date.now }) {
  const deadline = clock() + maxMs;
  while (clock() < deadline) {
    const rs = (await api('GET', `/v1/reviewSubmissions?filter[app]=${appId}&filter[state]=READY_FOR_REVIEW&include=items&limit=5`)).json;
    const draft = rs.data?.[0];
    if (draft) {
      log(`draft submission found: ${draft.id}`);
      const hasVersion = (rs.included || []).some((i) => i.relationships?.appStoreVersion?.data);
      if (!hasVersion) {
        const v = (await api('GET', `/v1/apps/${appId}/appStoreVersions?limit=1`)).json.data[0];
        const added = await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: draft.id } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
        log(`attached version ${v.id}: HTTP ${added.status}`);
      }
      const sub = await api('PATCH', `/v1/reviewSubmissions/${draft.id}`,
        { data: { type: 'reviewSubmissions', id: draft.id, attributes: { submitted: true } } });
      log(`submit: HTTP ${sub.status} state=${sub.json?.data?.attributes?.state ?? 'unknown'}`);
      const iap = (await api('GET', `/v1/apps/${appId}/inAppPurchasesV2`)).json.data?.[0];
      if (iap) log(`in-app purchase state: ${iap.attributes.state}`);
      return { code: sub.status < 300 ? 0 : 1 };
    }
    await wait(pollMs);
  }
  log('timeout: no draft appeared before the deadline');
  return { code: 2 };
}

/** Scripted fake of the three endpoints used above: draft appears on the 3rd poll. */
export function fakeApi() {
  let polls = 0;
  const calls = [];
  const api = async (method, url, body) => {
    calls.push(`${method} ${url.split('?')[0]}`);
    if (url.startsWith('/v1/reviewSubmissions?')) {
      return { status: 200, json: ++polls < 3 ? { data: [] } : { data: [{ id: 'sub-1' }], included: [] } };
    }
    if (url.includes('/appStoreVersions')) return { status: 200, json: { data: [{ id: 'ver-1' }] } };
    if (url === '/v1/reviewSubmissionItems') return { status: 201, json: {} };
    if (method === 'PATCH') return { status: 200, json: { data: { attributes: { state: 'WAITING_FOR_REVIEW' } } } };
    if (url.includes('/inAppPurchasesV2')) return { status: 200, json: { data: [{ attributes: { state: 'WAITING_FOR_REVIEW' } }] } };
    return { status: 404, json: {} };
  };
  return { api, calls };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--dry-run')) {
    const { api } = fakeApi();
    const { code } = await watch({ api, appId: 'DRY-RUN', pollMs: 0 });
    process.exit(code);
  }
  const { ASC_KEY_ID: keyId, ASC_ISSUER_ID: issuerId, ASC_APP_ID: appId } = process.env;
  if (!keyId || !issuerId || !appId) { console.error('Set ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID (see .env.example), or use --dry-run.'); process.exit(64); }
  const api = makeClient({ getToken: tokenSource({ keyId, issuerId }) });
  process.exit((await watch({ api, appId })).code);
}

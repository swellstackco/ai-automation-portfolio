import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { makeToken, tokenSource } from '../jwt.mjs';
import { watch, fakeApi } from '../watch-submission.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const opts = { keyId: 'TESTKEY123', issuerId: '00000000-0000-0000-0000-000000000000', privateKeyPem: pem };

test('JWT has the claims Apple requires and a valid raw (r||s) ES256 signature', () => {
  const [h, p, s] = makeToken({ ...opts, now: 1_700_000_000_000 }).split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'TESTKEY123', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.aud, 'appstoreconnect-v1');
  assert.equal(claims.exp - claims.iat, 1200);
  assert.equal(Buffer.from(s, 'base64url').length, 64);
  const ok = createVerify('SHA256').update(`${h}.${p}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.ok(ok);
});

test('lifetime over 20 minutes is refused; missing ids are refused', () => {
  assert.throws(() => makeToken({ ...opts, expiresIn: 1201 }), /20 minutes/);
  assert.throws(() => makeToken({ privateKeyPem: pem }), /required/);
});

test('tokenSource caches until a minute before expiry', () => {
  const next = tokenSource(opts);
  assert.equal(next(), next());
});

test('watcher polls until a draft appears, attaches the version, submits', async () => {
  const { api, calls } = fakeApi();
  const lines = [];
  const { code } = await watch({ api, appId: 'X', pollMs: 0, log: (l) => lines.push(l), wait: async () => {} });
  assert.equal(code, 0);
  assert.equal(calls.filter((c) => c === 'GET /v1/reviewSubmissions').length, 3);
  assert.ok(calls.includes('POST /v1/reviewSubmissionItems'));
  assert.ok(calls.includes('PATCH /v1/reviewSubmissions/sub-1'));
  assert.match(lines.join('\n'), /state=WAITING_FOR_REVIEW/);
});

test('watcher times out with exit code 2 when no draft ever appears', async () => {
  let t = 0;
  const api = async () => ({ status: 200, json: { data: [] } });
  const { code } = await watch({ api, appId: 'X', maxMs: 10, wait: async () => {}, clock: () => (t += 5), log: () => {} });
  assert.equal(code, 2);
});

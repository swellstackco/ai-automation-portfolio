// ES256 JSON Web Token for the App Store Connect API, using only node:crypto.
// The one subtlety: JOSE wants the ECDSA signature as raw r||s (IEEE P1363), not the DER
// sequence OpenSSL emits by default, hence dsaEncoding: 'ieee-p1363'.
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const AUDIENCE = 'appstoreconnect-v1';
export const MAX_LIFETIME_S = 1200; // Apple rejects tokens that live longer than 20 minutes

const b64url = (v) => Buffer.from(v).toString('base64url');

export function keyPath(keyId, env = process.env) {
  return env.ASC_KEY_PATH || path.join(homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${keyId}.p8`);
}

/** Sign a token. `privateKeyPem` may be passed directly (tests); otherwise it is read from disk. */
export function makeToken({ keyId, issuerId, privateKeyPem, expiresIn = MAX_LIFETIME_S, now = Date.now() } = {}) {
  if (!keyId || !issuerId) throw new Error('keyId and issuerId are required (ASC_KEY_ID, ASC_ISSUER_ID)');
  if (expiresIn > MAX_LIFETIME_S) throw new Error('App Store Connect rejects tokens that live longer than 20 minutes');
  const iat = Math.floor(now / 1000);
  const input = `${b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))}.` +
                `${b64url(JSON.stringify({ iss: issuerId, iat, exp: iat + expiresIn, aud: AUDIENCE }))}`;
  const pem = privateKeyPem ?? readFileSync(keyPath(keyId), 'utf8');
  const sig = createSign('SHA256').update(input).sign({ key: pem, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64url(sig)}`;
}

/** Returns a function that hands out a cached token and re-signs a minute before expiry. */
export function tokenSource(opts) {
  let cached = null;
  return () => {
    const now = Date.now();
    if (!cached || cached.expires - 60_000 <= now) {
      cached = { value: makeToken({ ...opts, now }), expires: now + (opts.expiresIn ?? MAX_LIFETIME_S) * 1000 };
    }
    return cached.value;
  };
}

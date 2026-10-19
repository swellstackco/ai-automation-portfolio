import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractEmails, cleanEmail, classify } from '../extract.mjs';

const emails = (s) => extractEmails(s).map((x) => cleanEmail(x.email)).filter(Boolean);

test('plain, mailto and percent-encoded addresses', () => {
  assert.deepEqual(emails('Business: hello@studio.dev'), ['hello@studio.dev']);
  assert.deepEqual(emails('<a href="mailto:press%40brand.test.org">x</a>'), ['press@brand.test.org']);
});

test('obfuscated "[at]" / "(dot)" forms are recovered', () => {
  assert.deepEqual(emails('bookings [at] mychannel (dot) co'), ['bookings@mychannel.co']);
});

test('Cloudflare email protection is decoded', () => {
  // "a@b.co" XOR-encoded with key 0x42
  const key = 0x42;
  const hex = key.toString(16).padStart(2, '0') + [...'a@b.co'].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');
  assert.deepEqual(emails(`<a data-cfemail="${hex}">`), ['a@b.co']);
});

test('junk is filtered: image names, placeholders, no-reply, error-tracker hashes', () => {
  assert.equal(cleanEmail('logo@2x.png'), null);
  assert.equal(cleanEmail('you@example.com'), null);
  assert.equal(cleanEmail('noreply@creator.io'), null);
  assert.equal(cleanEmail('0123456789abcdef01234567@o1.ingest.sentry.io'), null);
  assert.equal(cleanEmail('Team@Creator.IO'), 'team@creator.io');
});

test('link classification routes socials and link hubs', () => {
  assert.equal(classify('https://www.instagram.com/someone'), 'instagram');
  assert.equal(classify('https://x.com/someone'), 'twitter');
  assert.equal(classify('https://linktr.ee/someone'), 'hub');
  assert.equal(classify('https://someone.dev/contact'), 'website');
});

test('context text is captured for scoring', () => {
  const [hit] = extractEmails('For business inquiries only: deals@agency.dev');
  assert.match(hit.ctx, /business inquiries/);
});

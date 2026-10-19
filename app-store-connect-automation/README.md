# App Store Connect automation

**Problem.** Shipping iOS apps involves a lot of waiting and clicking in App Store Connect. One step in particular needs a human click in the web UI ("Add for Review") before the API can finish the submission, and it can happen at any hour.

**What it does.**
- `jwt.mjs`: signs the ES256 token the App Store Connect API requires, with `node:crypto` only (no dependencies). Handles the raw r||s signature format, the 20-minute token ceiling, and token caching.
- `client.mjs`: a small API client with an injectable `fetch`, so everything is testable offline.
- `watch-submission.mjs`: polls for a draft review submission, attaches the latest version if the draft is empty, submits it, and reports the in-app-purchase state. Exits 0 on success, 1 on API failure, 2 on timeout.

**Run.**

    npm test              # offline: verifies the JWT signature against the public key, and the watcher against a scripted fake API
    npm run dry-run       # no network, no credentials
    cp .env.example .env  # then fill in your own key id, issuer id, and app id
    node watch-submission.mjs

Credentials are read from environment variables; the `.p8` private key stays on disk and is never logged or committed (`.gitignore` excludes it).

**Stack.** Node.js 18+, built-in `fetch`, `node:crypto`, `node:test`.

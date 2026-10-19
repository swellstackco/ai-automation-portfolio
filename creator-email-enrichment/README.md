# Creator email enrichment

**Problem.** Outreach lists of YouTube creators usually have a channel URL and nothing else. Finding a business contact by hand takes minutes per row.

**What it does.** Reads a CSV with a `channel_url` column and adds columns for the best public contact email, where it was found, social handles, and a flag when YouTube hides a business email behind a signed-in button. For each row it reads the channel About page, the last few video descriptions (from the public RSS feed), and the creator's linked site, then extracts, de-obfuscates (`name [at] site (dot) com`, Cloudflare-protected, `%40`), filters junk, MX-checks the domain, and scores the candidates (business wording nearby, own-domain, source type).

Design points worth reading:
- Resumable: every fetched page and every finished row is cached on disk, so a crash or Ctrl-C loses nothing. Re-running skips finished rows.
- Polite: one request per second per host, backoff on 429/503 (honors `Retry-After`), `robots.txt` obeyed for non-YouTube hosts. GET only; no logins, no captcha bypass, no sending.
- Never overwrites the input file; writes output every 10 rows.
- Pure parsing logic lives in `extract.mjs` with unit tests, separate from the network code in `find.mjs`.

**Run.**

    npm test                                   # offline unit tests (Node 18+)
    node find.mjs sample.csv out.csv --limit 1 # live crawl, public pages only
    node report.mjs sample.csv out.csv report.md

Options: `--refresh`, `--limit N`, `--concurrency N`, `--first REGEX` (process matching rows first). Optional `YOUTUBE_API_KEY` env var adds channel descriptions from the official API (see `.env.example`).

**Stack.** Node.js, no dependencies.

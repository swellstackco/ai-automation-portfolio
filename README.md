# AI automation portfolio

I'm Ben Jacobs, an AI automation and operations engineer. I build and ship iOS apps and the automations around them: API integrations, scheduled jobs, data pipelines, and alerting. My production repositories are private, so this repo holds small, runnable, sanitized examples adapted from tools I actually use. Each folder has its own README, runs without credentials, and has tests.

| Folder | What it shows |
|---|---|
| [`creator-email-enrichment`](creator-email-enrichment) | Resumable, polite web enrichment: finds public contact emails for a list of creators, with de-obfuscation, junk filtering, MX checks, and scoring. |
| [`app-store-connect-automation`](app-store-connect-automation) | Dependency-free ES256 JWT signing for the App Store Connect API, plus a poller that completes a review submission as soon as a human step is done. |
| [`ops-cron-alerts`](ops-cron-alerts) | Cron jobs that alert via Telegram when leads go stale, and a weekly scoreboard computed without an LLM. |
| [`fers-annuity-engine`](fers-annuity-engine) | Integer-math retirement annuity engine, tested against published OPM examples and cross-checked against an independent Python oracle. |

Run all tests (Node 18+, python3 for one suite):

    for d in */; do (cd "$d" && npm test); done

No credentials are stored here. Anything that needs a key reads it from an environment variable (see each `.env.example`).

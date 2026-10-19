# Ops cron alerts

**Problem.** Small businesses lose money when an inbound lead sits untouched for days, and owners do not check dashboards. I wanted two cheap, deterministic jobs that run from cron and ping a phone only when something needs attention.

**What it does.**
- `lead-age-alert.mjs`: reads a leads JSON file (read-only), finds rows still `new` after N hours, groups duplicates into one line each, and sends a Telegram message. Silent when there is nothing to report. `--count` prints just the number, for use in other scripts.
- `scoreboard.mjs`: weekly summary built from local numbers only (stale leads plus 7-day sales from a CSV). No LLM involved, so it is free to run and the numbers are reproducible.
- `notify.mjs`: Telegram sender that prints instead of sending in `--dry-run` or when credentials are missing, so nothing leaks from a test run.

**Run.**

    npm test                       # offline unit tests
    npm run dry-run                # runs both jobs on sample/ data, prints the messages
    cp .env.example .env           # add a bot token and chat id to send for real

Example crontab:

    0 9 * * *  cd /path/to/ops-cron-alerts && set -a && . ./.env && node lead-age-alert.mjs --leads /path/to/leads.json
    0 18 * * 0 cd /path/to/ops-cron-alerts && set -a && . ./.env && node scoreboard.mjs --leads /path/to/leads.json --sales /path/to/sales.csv

**Stack.** Node.js 18+, no dependencies, Telegram Bot API.

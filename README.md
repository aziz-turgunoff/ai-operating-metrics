# Home Alliance — AI Operating Metrics

A monthly AI-operating report for Home Alliance, built from Sardor's request in
`#devs-and-product` (2026-07-02): one roll-up across every AI system, grouped into
his six report categories + five North Star metrics.

## What's in here

```
web/     React + Vite dashboard (fetches everything from server/)
server/  Node/Express API — one connector per data source + Prisma/SQLite persistence
```

## The core idea: pluggable sources

Every metric is fed by a source with a runtime status, decided by the backend on
every request — the frontend never hardcodes a status:

- **live** — a connector fetched real data this request (green dot).
- **pending** — required env vars aren't set yet; access/bug/decision still open (amber).
- **error** — env vars are set but the fetch failed (red) — check server logs.

No metric ever shows a number unless a connector actually returned it. When a
source is pending, the card shows `—`, not a placeholder sample value — we don't
publish fabricated figures under a "live" label.

## Run it

```
npm install                 # installs both workspaces
cp server/.env.example server/.env   # fill in whatever keys you have
npm run db:migrate          # first time only — creates the SQLite DB
npm run dev                 # runs server (:8787) and web (:5173) together
```

Open http://localhost:5173 — Vite proxies `/api/*` to the server.

## Source status (as of 2026-07-09)

| Source | Status | Blocker | Owner |
|---|---|---|---|
| OpenRouter | live-capable | needs `OPENROUTER_KEY` | — |
| Open WebUI gateway | live-capable | needs `OPENWEBUI_URL`/`OPENWEBUI_TOKEN` | Shawn |
| LeadBank BI | live-capable | date-filter bug — use `LEADBANK_DAYS` (bigint error on start/end_date) | XTR/BI (escalate via Carlos) |
| Apollo ERP | live-capable | raw revenue endpoint down (`NodeApiError`) | IT/R&D (Carlos/XTR) |
| Qdrant | pending | whitelist from XTR/Dmitrii — check today | Shawn |
| Fireflies | pending | confirm as source of truth vs Qdrant "Company" collection — check today | Shawn |
| CI/CD | pending | scope TBD across Drone/Vercel/Lovable/AWS; token comes via Engineering Squad admin panel | Sergey/Aleksandr |
| n8n / Zapier | pending | no API yet | XTR |
| Derived (Hours Saved / Cost Savings) | half-locked | rate locked at **$20/hr** (Jay, 2026-07-08); minutes-saved-per-task still needs sign-off | Sardor/Jay |

"live-capable" = the connector is fully implemented; it goes live the moment its
env vars are filled in on the server — no code change needed.

## Promote a metric from pending → live

1. Fill in the connector's env vars in `server/.env`.
2. That's it — `server/src/connectors/<source>.js` will start returning
   `{status:"live", data}` and `server/src/metrics.js` maps it onto the report.
3. If the real API's field names differ from the guesses in `metrics.js`
   (`pick(obj, [...])`), add the real path to that list.

## History / monthly snapshots

Nothing upstream keeps month-over-month data, so this app persists its own:

- `POST /api/snapshot` captures the current metrics into SQLite (`Snapshot` +
  `MetricValue` tables) — the dashboard's "Save snapshot now" button calls this.
- `server/src/scheduler.js` runs the same capture automatically on the 1st of
  every month at 09:00 via `node-cron` — no external cron needed.
- `GET /api/history?metricKey=<key>` returns a metric's time series; click any
  North Star card in the UI to see its trend.

**Moving to Postgres for production**: `server/prisma/schema.prisma` uses only
types that work on both SQLite and Postgres. Change `provider` to `postgresql`,
point `DATABASE_URL` at a real Postgres instance, and re-run
`npm run db:migrate`.

## Open decisions (not code)

- "Opportunities" — no field exists in Apollo (only jobs won/scheduled); needs
  Sardor to redefine the metric or point at another source.
- Memberships — two different totals from two different Apollo queries
  (agent-level vs department-level); pick the official one.
- Minutes saved per automated task — the other half of the Hours Saved formula;
  $20/hr is locked, this isn't.
- QA hours eliminated / OOSA opportunities identified / Membership opportunities
  identified — Sardor named these explicitly but no source is confirmed yet.

# Mission Control v2 — Agent Telemetry

Shared operations dashboard for **Marty** and **MARA**. Both agents publish their
own live state; either agent can develop against this repo.

## What it shows

| Page | Answers |
|---|---|
| **Dashboard** (`/`) | Who's alive, what each agent is working on right now, what each owns, fleet-wide job health, 7-day spend |
| **Cron Jobs** (`/cron`) | Every scheduled job across both agents and all Slack channels — schedule, target channel, model, prompt, run history. Filter by agent / category / state |
| **Models & Spend** (`/models`) | Which LLM each agent uses **and for what purpose**, cost tier, daily spend chart, per-model token + cost table |

Existing pages (Task Board, Calendar, Projects, Memory, Documents, Team) are unchanged.

## Architecture

Agents run headless and can't complete a Google OAuth flow, so writes use a
bearer token while humans use Google SSO:

```
Marty ─┐
       ├─ POST /api/telemetry/sync   (Bearer AGENT_API_TOKEN + X-Agent header)
MARA ──┘        │
                ▼
          Neon Postgres (mc_* tables)
                │
                ▼
     GET /api/agents/runtime, /api/cron, /api/models, /api/versions
                │
                ▼
        Next.js dashboard (Google SSO, @municibid.com only)
```

**Agent isolation:** the `X-Agent` header determines which rows a call may
touch. Marty cannot overwrite MARA's cron jobs and vice versa — enforced in SQL,
not just convention. Verified by test.

## Setup

### 1. Environment

Add to Vercel (and each agent's local env):

```
DATABASE_URL=postgresql://...          # existing Neon connection
NEXTAUTH_URL=https://missioncontrol-marty.vercel.app
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AGENT_API_TOKEN=<openssl rand -hex 32>  # NEW — shared by both agents
```

`AGENT_API_TOKEN` grants telemetry writes only. It cannot read tasks, documents,
or memory. Rotate it by updating Vercel + both agents' env.

### 2. Migrations

```bash
npx tsx src/lib/migrate-002.ts   # telemetry tables
npx tsx src/lib/migrate-003.ts   # column widening (real version strings overflow VARCHAR(50))
```

Both are idempotent.

### 3. Agent-side sync

Each agent runs `scripts/mc-sync.py` (lives in the agent's own workspace, e.g.
`~/clawd/scripts/mc-sync.py`):

```bash
export AGENT_API_TOKEN=...
export MC_AGENT=marty          # or mara
python3 scripts/mc-sync.py --dry-run   # inspect payload first
python3 scripts/mc-sync.py             # publish
```

It reads real state — no hardcoded values:

- **Runtime** from `~/.hermes/config.yaml` (default model, provider, reasoning effort, timezone)
- **Cron jobs** from `~/.hermes/cron/jobs.json` — the file the scheduler itself reads
- **Versions** from `hermes version` + `git rev-parse` in each repo

Schedule it every 15 minutes so the dashboard stays live.

## API reference

### `POST /api/telemetry/sync`
Auth: `Authorization: Bearer <AGENT_API_TOKEN>`, `X-Agent: marty|mara`

All sections optional — send only what changed.

```jsonc
{
  "agent": "marty",
  "runtime": { "default_model": "claude-opus-5", "status": "active", ... },
  "cron_jobs": [ { "external_id": "203be8734aec", "name": "...", "schedule": "0 12 * * 1-5", ... } ],
  "cron_replace": true,     // jobs absent from this payload → state 'retired' (never deleted)
  "models": [ { "model": "claude-sonnet-5", "provider": "anthropic", "purpose": "cron", ... } ],
  "models_replace": true,
  "versions": [ { "component": "hermes", "version": "v0.19.0", "git_sha": "..." } ],
  "work": [ { "headline": "...", "status": "active|blocked", "blocked_on": "..." } ],
  "work_replace": true,
  "responsibilities": [ { "area": "Seller sales", "channel": "#mara-sales", "handed_off_from": "marty" } ],
  "usage": [ { "usage_date": "2026-07-27", "model": "claude-opus-5", "cost_usd": 4.21, ... } ]
}
```

Returns `{ ok, agent, applied: { runtime: 1, cron_jobs: 10, ... } }`.

### `POST /api/cron/runs`
Record one execution. Same auth. Flips the job's `state` to `error` on failure
and back to `scheduled` on the next success.

```json
{ "external_id": "203be8734aec", "job_name": "Daily Biz KPI Report",
  "status": "success|failed|silent|skipped", "duration_ms": 9100,
  "input_tokens": 18400, "output_tokens": 320, "cost_usd": 0.061,
  "error": null, "output_preview": "..." }
```

Use `status: "silent"` for watchdog jobs that intentionally produce no output —
they show as run-and-healthy rather than as failures.

### Read endpoints (no agent token needed)
- `GET /api/agents/runtime[?agent=]` — dashboard payload: runtime + cron rollup + models + work + responsibilities + 7-day spend
- `GET /api/cron[?agent=&category=&state=&runs=true&include_retired=true]`
- `GET /api/cron/runs[?agent=&status=&limit=]`
- `GET /api/models[?agent=&days=]`
- `GET /api/versions[?component=&current=true]`

## Conventions

**Job categories** drive the grouping on `/cron`. `mc-sync.py` infers them from
the job name; adjust `CATEGORY_RULES` there if a job lands in the wrong bucket.

```
sales | marketing | security | maintenance | cs | other
```

**Model purposes** are how the dashboard explains *what each LLM is for*:

```
main      — interactive conversation
cron      — scheduled jobs
subagent  — delegated background work
website   — the public-facing agent on municibid.com
fallback  — used when the primary is unavailable
```

**Retired, not deleted.** Jobs that disappear from a sync are marked `retired` so
`mc_cron_runs` history stays intact. Tick "show retired" on `/cron` to see them.

## Local development

```bash
npm run build && npx next start -p 3111
```

Dashboard routes require a session. To view them locally without a Google flow,
mint a cookie against your local `NEXTAUTH_SECRET`:

```bash
npx tsx scripts/local-auth-bridge.ts     # then browse localhost:3112/?to=/cron
```

`scripts/local-auth-bridge.ts` and `scripts/mint-local-session.ts` are
local-verification helpers. They rely on `NEXTAUTH_SECRET` and are useless
against production — but don't deploy them as routes.

## Pitfalls found the hard way

1. **`pkill -f "next start"` doesn't always kill the server.** A stale
   `next-server` process kept serving an old build and made a verified SQL fix
   look broken. Check `ps aux | grep next-server` and `kill -9` the PID.
2. **`useSearchParams()` breaks the build** without an explicit `<Suspense>`
   boundary at the page level. `/cron` wraps its body for this reason.
3. **Percentage bar heights need a full-height flex parent.** `h-full` on the
   column plus `max(2px, N%)` on the bar; `min-h` alone renders nothing.
4. **Don't clobber `last_run_at` on sync.** `mc-sync.py` reads Hermes' job file,
   which doesn't know about runs reported via `/api/cron/runs`. The upsert uses
   `COALESCE(EXCLUDED.last_run_at, mc_cron_jobs.last_run_at)` so history survives.
5. **Real version strings are long.** `hermes version` emits
   `"Hermes Agent v0.19.0 (2026.7.20) · upstream 7cd48733 · local ..."`, which
   overflowed `VARCHAR(50)`. `mc-sync.py` normalises to a bare semver; migration
   003 widened the columns.
6. **Emoji avatars don't render on the EC2 host** (no emoji font). Use single
   letters — `M` / `A` — with the gradient background carrying the identity.

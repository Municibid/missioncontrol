-- Mission Control v2 — Agent Telemetry
-- Adds: agent runtime state, cron job registry, model/LLM usage tracking,
--       version tracking, and work-in-progress reporting.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Agent registry (replaces the thin mc_agents rows with real runtime state)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_agent_runtime (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent             VARCHAR(50) NOT NULL UNIQUE,   -- 'marty' | 'mara'
  display_name      VARCHAR(100) NOT NULL,
  role              TEXT,
  avatar            VARCHAR(16) NOT NULL DEFAULT 'A',
  -- runtime / platform
  framework         VARCHAR(50),                   -- 'hermes' | 'openclaw'
  framework_version VARCHAR(50),
  host              VARCHAR(100),                  -- 'AWS EC2 ip-172-31-5-119'
  workdir           TEXT,
  timezone          VARCHAR(64),
  -- model config
  default_model     VARCHAR(100),
  default_provider  VARCHAR(50),
  reasoning_effort  VARCHAR(20),
  -- liveness
  status            VARCHAR(20) NOT NULL DEFAULT 'offline'
                    CHECK (status IN ('active', 'idle', 'offline', 'error')),
  last_heartbeat_at TIMESTAMPTZ,
  -- freeform: connected platforms, toolsets, skill count, etc.
  meta              JSONB NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 2. Cron job registry — one row per scheduled job, per agent, any channel
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_cron_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent           VARCHAR(50) NOT NULL,
  external_id     VARCHAR(100) NOT NULL,     -- Hermes job_id
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  schedule        VARCHAR(100) NOT NULL,     -- cron expr or '30m'
  schedule_tz     VARCHAR(64),
  schedule_human  VARCHAR(255),              -- 'Weekdays 08:00 ET'
  -- where it posts
  deliver_target  VARCHAR(120),              -- 'slack:C0AB57UGP47'
  channel_name    VARCHAR(120),              -- '#mara-sales'
  -- how it runs
  model           VARCHAR(100),
  provider        VARCHAR(50),
  toolsets        TEXT[] DEFAULT '{}',
  script_path     TEXT,
  no_agent        BOOLEAN NOT NULL DEFAULT FALSE,
  timeout_seconds INTEGER,
  category        VARCHAR(50),               -- sales|marketing|security|maintenance|cs
  -- state
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  state           VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                  CHECK (state IN ('scheduled', 'paused', 'running', 'error', 'retired')),
  last_run_at     TIMESTAMPTZ,
  last_status     VARCHAR(20),
  last_error      TEXT,
  next_run_at     TIMESTAMPTZ,
  prompt_preview  TEXT,
  owner_note      TEXT,                      -- handoff notes, e.g. 'held for Mara'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent, external_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_agent      ON mc_cron_jobs(agent);
CREATE INDEX IF NOT EXISTS idx_cron_next_run   ON mc_cron_jobs(next_run_at);
CREATE INDEX IF NOT EXISTS idx_cron_category   ON mc_cron_jobs(category);
CREATE INDEX IF NOT EXISTS idx_cron_state      ON mc_cron_jobs(state);

-- ---------------------------------------------------------------------------
-- 3. Cron run history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_cron_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_job_id   UUID REFERENCES mc_cron_jobs(id) ON DELETE CASCADE,
  agent         VARCHAR(50) NOT NULL,
  job_name      VARCHAR(255) NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ,
  duration_ms   INTEGER,
  status        VARCHAR(20) NOT NULL DEFAULT 'running'
                CHECK (status IN ('running', 'success', 'failed', 'skipped', 'silent')),
  model         VARCHAR(100),
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      NUMERIC(10, 4),
  delivered     BOOLEAN,
  error         TEXT,
  output_preview TEXT
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job     ON mc_cron_runs(cron_job_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON mc_cron_runs(started_at DESC);

-- ---------------------------------------------------------------------------
-- 4. Model registry — which LLM, used for what, at what cost tier
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_models (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent           VARCHAR(50) NOT NULL,
  model           VARCHAR(100) NOT NULL,
  provider        VARCHAR(50) NOT NULL,
  routed_via      VARCHAR(100),              -- 'anthropic direct' | 'openrouter'
  purpose         VARCHAR(50) NOT NULL,      -- main|cron|subagent|website|fallback
  purpose_detail  TEXT,                      -- 'conversation + analysis in Slack'
  reasoning_effort VARCHAR(20),
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  cost_tier       VARCHAR(20),               -- premium|standard|economy
  input_cost_per_mtok  NUMERIC(10, 4),
  output_cost_per_mtok NUMERIC(10, 4),
  notes           TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent, model, purpose)
);

CREATE INDEX IF NOT EXISTS idx_models_agent ON mc_models(agent);

-- ---------------------------------------------------------------------------
-- 5. Daily model spend rollup — "LLMs used and for what" with real numbers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_model_usage_daily (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         VARCHAR(50) NOT NULL,
  usage_date    DATE NOT NULL,
  model         VARCHAR(100) NOT NULL,
  purpose       VARCHAR(50) NOT NULL DEFAULT 'main',
  requests      INTEGER NOT NULL DEFAULT 0,
  input_tokens  BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10, 4) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent, usage_date, model, purpose)
);

CREATE INDEX IF NOT EXISTS idx_usage_date ON mc_model_usage_daily(usage_date DESC);

-- ---------------------------------------------------------------------------
-- 6. Version / deploy history — "versions" tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component     VARCHAR(100) NOT NULL,   -- 'hermes' | 'mission-control' | 'mara-app'
  agent         VARCHAR(50),             -- null = shared component
  version       VARCHAR(100) NOT NULL,
  git_sha       VARCHAR(40),
  git_branch    VARCHAR(100),
  channel       VARCHAR(30),             -- 'prod' | 'preview' | 'local'
  changelog     TEXT,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_versions_component ON mc_versions(component, detected_at DESC);

-- ---------------------------------------------------------------------------
-- 7. Work-in-progress — "what are you working on right now"
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_agent_work (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         VARCHAR(50) NOT NULL,
  headline      VARCHAR(255) NOT NULL,
  detail        TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'blocked', 'done', 'abandoned')),
  blocked_on    TEXT,
  task_id       UUID REFERENCES mc_tasks(id) ON DELETE SET NULL,
  project_id    UUID REFERENCES mc_projects(id) ON DELETE SET NULL,
  channel       VARCHAR(120),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_work_agent_status ON mc_agent_work(agent, status);
CREATE INDEX IF NOT EXISTS idx_work_updated      ON mc_agent_work(updated_at DESC);

-- ---------------------------------------------------------------------------
-- 8. Responsibility map — who owns what, so handoffs are visible
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mc_responsibilities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent         VARCHAR(50) NOT NULL,
  area          VARCHAR(150) NOT NULL,
  detail        TEXT,
  channel       VARCHAR(120),
  since         DATE,
  handed_off_from VARCHAR(50),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (agent, area)
);

-- ---------------------------------------------------------------------------
-- 9. Widen existing constraints so both agents are first-class
-- ---------------------------------------------------------------------------
ALTER TABLE mc_activity_log ADD COLUMN IF NOT EXISTS category VARCHAR(50);
ALTER TABLE mc_activity_log ADD COLUMN IF NOT EXISTS channel  VARCHAR(120);

-- Seed the two agents
INSERT INTO mc_agent_runtime (agent, display_name, role, avatar, framework, host, status)
VALUES
  ('marty', 'Marty Muncy', 'Ops, reporting, security, and the public-facing website agent', '🤖', 'hermes', 'AWS EC2 ip-172-31-5-119', 'active'),
  ('mara',  'MARA',        'Seller sales and the MARA app',                                  '💜', 'hermes', 'AWS EC2 ip-172-31-5-119', 'active')
ON CONFLICT (agent) DO NOTHING;

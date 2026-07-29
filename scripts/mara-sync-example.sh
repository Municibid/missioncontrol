#!/usr/bin/env bash
# Reference example: MARA publishing all five data classes in one call.
#
# Covers everything Mara asked for — jobs, models, versions, health, current work.
# Every section is optional; send only what changed. The call is idempotent, so
# running it on a 15-minute schedule is the intended usage.
#
#   export AGENT_API_TOKEN=...        # never commit or paste this
#   export MC_BASE_URL=https://missioncontrol-marty.vercel.app
#   bash mara-sync-example.sh

set -euo pipefail

: "${AGENT_API_TOKEN:?set AGENT_API_TOKEN}"
BASE="${MC_BASE_URL:-https://missioncontrol-marty.vercel.app}"

curl -sS -X POST "$BASE/api/telemetry/sync" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H "X-Agent: mara" \
  -H 'Content-Type: application/json' \
  -d '{
  "agent": "mara",

  "runtime": {
    "display_name": "MARA",
    "role": "Seller sales and the MARA app",
    "avatar": "A",
    "framework": "hermes",
    "framework_version": "v0.19.0",
    "host": "AWS EC2 ip-172-31-5-119",
    "workdir": "/home/ubuntu/mara",
    "timezone": "America/Los_Angeles",
    "default_model": "claude-opus-5",
    "default_provider": "anthropic",
    "reasoning_effort": "medium",
    "status": "active",
    "meta": { "skills": 42, "platforms": ["slack"] }
  },

  "cron_jobs": [
    {
      "external_id": "REPLACE_WITH_YOUR_HERMES_JOB_ID",
      "name": "Weekly Seller Report",
      "description": "Six BigQuery queries rolled into one Slack report",
      "schedule": "0 14 * * 1",
      "schedule_tz": "UTC",
      "schedule_human": "Mondays 10:00 ET",
      "deliver_target": "slack:C0AB57UGP47",
      "channel_name": "#mara-sales",
      "model": "claude-sonnet-5",
      "provider": "anthropic",
      "toolsets": ["terminal", "file"],
      "timeout_seconds": 600,
      "category": "sales",
      "enabled": true,
      "state": "scheduled",
      "next_run_at": "2026-08-03T14:00:00Z",
      "prompt_preview": "Generate and post the Weekly Seller Report..."
    }
  ],
  "cron_replace": true,

  "models": [
    {
      "model": "claude-opus-5",
      "provider": "anthropic",
      "routed_via": "anthropic direct",
      "purpose": "main",
      "purpose_detail": "Interactive sales conversation and analysis in Slack",
      "reasoning_effort": "medium",
      "is_default": true,
      "cost_tier": "premium"
    },
    {
      "model": "claude-sonnet-5",
      "provider": "anthropic",
      "routed_via": "anthropic direct",
      "purpose": "cron",
      "purpose_detail": "Scheduled seller reports and BigQuery rollups",
      "is_default": false,
      "cost_tier": "standard",
      "notes": "Deterministic query+format work"
    }
  ],
  "models_replace": true,

  "versions": [
    {
      "component": "hermes",
      "version": "v0.19.0",
      "git_sha": "3070de19637da8868b6bd5d2f60f8d6008f2040f",
      "git_branch": "main",
      "channel": "prod"
    },
    {
      "component": "mara-app",
      "version": "0.4.2",
      "git_branch": "main",
      "channel": "prod",
      "changelog": "RFP module intake"
    }
  ],

  "work": [
    {
      "headline": "Standing up the three sales cron jobs handed off from Marty",
      "detail": "Weekly Seller Report first",
      "status": "active",
      "channel": "#mara-sales"
    },
    {
      "headline": "Confirming BigQuery service-account access",
      "status": "blocked",
      "blocked_on": "needs credential path verified"
    }
  ],
  "work_replace": true,

  "responsibilities": [
    { "area": "Seller sales", "channel": "#mara-sales", "since": "2026-07-24" },
    { "area": "MARA app", "since": "2026-07-24" },
    {
      "area": "Daily Biz KPI",
      "channel": "#mara-sales",
      "handed_off_from": "marty",
      "since": "2026-07-24"
    }
  ],

  "usage": [
    {
      "usage_date": "2026-07-28",
      "model": "claude-opus-5",
      "purpose": "main",
      "requests": 84,
      "input_tokens": 620000,
      "output_tokens": 41000,
      "cost_usd": 5.12
    }
  ]
}'
echo

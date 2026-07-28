import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { authenticateAgent } from '@/lib/agent-auth';
import type { TelemetrySyncPayload } from '@/lib/telemetry';

const sql = neon(process.env.DATABASE_URL!);

/**
 * POST /api/telemetry/sync
 *
 * Single idempotent upsert endpoint that both agents call to publish their
 * current state: runtime info, cron registry, model config, versions,
 * work-in-progress, responsibilities, and daily token spend.
 *
 * Auth: Bearer AGENT_API_TOKEN + X-Agent: marty|mara
 *
 * The agent named in X-Agent is the only agent whose rows this call may touch —
 * Marty cannot overwrite Mara's cron jobs and vice versa.
 */
export async function POST(request: NextRequest) {
  const auth = authenticateAgent(request);
  if (!auth.ok || !auth.agent) {
    return NextResponse.json(
      { error: auth.error ?? 'Unauthorized' },
      { status: auth.status ?? 401 }
    );
  }
  const agent = auth.agent;

  let body: TelemetrySyncPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const applied: Record<string, number> = {};

  try {
    // ---------------------------------------------------------------- runtime
    if (body.runtime) {
      const r = body.runtime;
      await sql`
        INSERT INTO mc_agent_runtime (
          agent, display_name, role, avatar, framework, framework_version,
          host, workdir, timezone, default_model, default_provider,
          reasoning_effort, status, last_heartbeat_at, meta, updated_at
        ) VALUES (
          ${agent},
          ${r.display_name ?? agent},
          ${r.role ?? null},
          ${r.avatar ?? 'A'},
          ${r.framework ?? null},
          ${r.framework_version ?? null},
          ${r.host ?? null},
          ${r.workdir ?? null},
          ${r.timezone ?? null},
          ${r.default_model ?? null},
          ${r.default_provider ?? null},
          ${r.reasoning_effort ?? null},
          ${r.status ?? 'active'},
          NOW(),
          ${JSON.stringify(r.meta ?? {})}::jsonb,
          NOW()
        )
        ON CONFLICT (agent) DO UPDATE SET
          display_name      = COALESCE(EXCLUDED.display_name, mc_agent_runtime.display_name),
          role              = COALESCE(EXCLUDED.role, mc_agent_runtime.role),
          avatar            = COALESCE(EXCLUDED.avatar, mc_agent_runtime.avatar),
          framework         = COALESCE(EXCLUDED.framework, mc_agent_runtime.framework),
          framework_version = COALESCE(EXCLUDED.framework_version, mc_agent_runtime.framework_version),
          host              = COALESCE(EXCLUDED.host, mc_agent_runtime.host),
          workdir           = COALESCE(EXCLUDED.workdir, mc_agent_runtime.workdir),
          timezone          = COALESCE(EXCLUDED.timezone, mc_agent_runtime.timezone),
          default_model     = COALESCE(EXCLUDED.default_model, mc_agent_runtime.default_model),
          default_provider  = COALESCE(EXCLUDED.default_provider, mc_agent_runtime.default_provider),
          reasoning_effort  = COALESCE(EXCLUDED.reasoning_effort, mc_agent_runtime.reasoning_effort),
          status            = EXCLUDED.status,
          last_heartbeat_at = NOW(),
          meta              = EXCLUDED.meta,
          updated_at        = NOW()
      `;
      applied.runtime = 1;
    }

    // -------------------------------------------------------------- cron jobs
    if (Array.isArray(body.cron_jobs)) {
      const seen: string[] = [];
      for (const j of body.cron_jobs) {
        if (!j.external_id || !j.name || !j.schedule) continue;
        seen.push(j.external_id);
        await sql`
          INSERT INTO mc_cron_jobs (
            agent, external_id, name, description, schedule, schedule_tz,
            schedule_human, deliver_target, channel_name, model, provider,
            toolsets, script_path, no_agent, timeout_seconds, category,
            enabled, state, last_run_at, last_status, last_error, next_run_at,
            prompt_preview, owner_note, updated_at
          ) VALUES (
            ${agent}, ${j.external_id}, ${j.name}, ${j.description ?? null},
            ${j.schedule}, ${j.schedule_tz ?? null}, ${j.schedule_human ?? null},
            ${j.deliver_target ?? null}, ${j.channel_name ?? null},
            ${j.model ?? null}, ${j.provider ?? null},
            ${j.toolsets ?? []}, ${j.script_path ?? null},
            ${j.no_agent ?? false}, ${j.timeout_seconds ?? null},
            ${j.category ?? null}, ${j.enabled ?? true}, ${j.state ?? 'scheduled'},
            ${j.last_run_at ?? null}, ${j.last_status ?? null}, ${j.last_error ?? null},
            ${j.next_run_at ?? null}, ${j.prompt_preview ?? null},
            ${j.owner_note ?? null}, NOW()
          )
          ON CONFLICT (agent, external_id) DO UPDATE SET
            name            = EXCLUDED.name,
            description     = EXCLUDED.description,
            schedule        = EXCLUDED.schedule,
            schedule_tz     = EXCLUDED.schedule_tz,
            schedule_human  = EXCLUDED.schedule_human,
            deliver_target  = EXCLUDED.deliver_target,
            channel_name    = EXCLUDED.channel_name,
            model           = EXCLUDED.model,
            provider        = EXCLUDED.provider,
            toolsets        = EXCLUDED.toolsets,
            script_path     = EXCLUDED.script_path,
            no_agent        = EXCLUDED.no_agent,
            timeout_seconds = EXCLUDED.timeout_seconds,
            category        = EXCLUDED.category,
            enabled         = EXCLUDED.enabled,
            state           = EXCLUDED.state,
            last_run_at     = COALESCE(EXCLUDED.last_run_at, mc_cron_jobs.last_run_at),
            last_status     = COALESCE(EXCLUDED.last_status, mc_cron_jobs.last_status),
            last_error      = EXCLUDED.last_error,
            next_run_at     = EXCLUDED.next_run_at,
            prompt_preview  = EXCLUDED.prompt_preview,
            owner_note      = EXCLUDED.owner_note,
            updated_at      = NOW()
        `;
      }
      applied.cron_jobs = seen.length;

      // Anything this agent previously registered but no longer reports is
      // retired rather than deleted, so history in mc_cron_runs stays intact.
      if (body.cron_replace && seen.length > 0) {
        const retired = await sql`
          UPDATE mc_cron_jobs
             SET state = 'retired', enabled = FALSE, updated_at = NOW()
           WHERE agent = ${agent}
             AND state <> 'retired'
             AND NOT (external_id = ANY(${seen}))
          RETURNING id
        `;
        applied.cron_retired = retired.length;
      }
    }

    // ----------------------------------------------------------------- models
    if (Array.isArray(body.models)) {
      let n = 0;
      if (body.models_replace) {
        await sql`UPDATE mc_models SET active = FALSE WHERE agent = ${agent}`;
      }
      for (const m of body.models) {
        if (!m.model || !m.provider || !m.purpose) continue;
        await sql`
          INSERT INTO mc_models (
            agent, model, provider, routed_via, purpose, purpose_detail,
            reasoning_effort, is_default, cost_tier, input_cost_per_mtok,
            output_cost_per_mtok, notes, active, updated_at
          ) VALUES (
            ${agent}, ${m.model}, ${m.provider}, ${m.routed_via ?? null},
            ${m.purpose}, ${m.purpose_detail ?? null}, ${m.reasoning_effort ?? null},
            ${m.is_default ?? false}, ${m.cost_tier ?? null},
            ${m.input_cost_per_mtok ?? null}, ${m.output_cost_per_mtok ?? null},
            ${m.notes ?? null}, ${m.active ?? true}, NOW()
          )
          ON CONFLICT (agent, model, purpose) DO UPDATE SET
            provider             = EXCLUDED.provider,
            routed_via           = EXCLUDED.routed_via,
            purpose_detail       = EXCLUDED.purpose_detail,
            reasoning_effort     = EXCLUDED.reasoning_effort,
            is_default           = EXCLUDED.is_default,
            cost_tier            = EXCLUDED.cost_tier,
            input_cost_per_mtok  = EXCLUDED.input_cost_per_mtok,
            output_cost_per_mtok = EXCLUDED.output_cost_per_mtok,
            notes                = EXCLUDED.notes,
            active               = TRUE,
            updated_at           = NOW()
        `;
        n++;
      }
      applied.models = n;
    }

    // --------------------------------------------------------------- versions
    if (Array.isArray(body.versions)) {
      let n = 0;
      for (const v of body.versions) {
        if (!v.component || !v.version) continue;
        // Only insert when the version actually changed, so we build a real
        // history instead of one row per sync.
        const current = await sql`
          SELECT version FROM mc_versions
           WHERE component = ${v.component}
             AND (agent = ${agent} OR agent IS NULL)
             AND is_current = TRUE
           ORDER BY detected_at DESC LIMIT 1
        `;
        const currentVersion = current[0]?.version as string | undefined;
        if (currentVersion === v.version) continue;

        await sql`
          UPDATE mc_versions SET is_current = FALSE
           WHERE component = ${v.component} AND (agent = ${agent} OR agent IS NULL)
        `;
        await sql`
          INSERT INTO mc_versions (
            component, agent, version, git_sha, git_branch, channel, changelog, is_current
          ) VALUES (
            ${v.component}, ${agent}, ${v.version}, ${v.git_sha ?? null},
            ${v.git_branch ?? null}, ${v.channel ?? null}, ${v.changelog ?? null}, TRUE
          )
        `;
        n++;
      }
      applied.versions = n;
    }

    // ------------------------------------------------------------------- work
    if (Array.isArray(body.work)) {
      if (body.work_replace) {
        await sql`
          UPDATE mc_agent_work
             SET status = 'done', ended_at = NOW(), updated_at = NOW()
           WHERE agent = ${agent} AND status IN ('active', 'blocked')
        `;
      }
      for (const w of body.work) {
        if (!w.headline) continue;
        await sql`
          INSERT INTO mc_agent_work (agent, headline, detail, status, blocked_on, channel)
          VALUES (
            ${agent}, ${w.headline}, ${w.detail ?? null},
            ${w.status ?? 'active'}, ${w.blocked_on ?? null}, ${w.channel ?? null}
          )
        `;
      }
      applied.work = body.work.length;
    }

    // ------------------------------------------------------- responsibilities
    if (Array.isArray(body.responsibilities)) {
      for (const r of body.responsibilities) {
        if (!r.area) continue;
        await sql`
          INSERT INTO mc_responsibilities (
            agent, area, detail, channel, since, handed_off_from, active
          ) VALUES (
            ${agent}, ${r.area}, ${r.detail ?? null}, ${r.channel ?? null},
            ${r.since ?? null}, ${r.handed_off_from ?? null}, ${r.active ?? true}
          )
          ON CONFLICT (agent, area) DO UPDATE SET
            detail          = EXCLUDED.detail,
            channel         = EXCLUDED.channel,
            since           = EXCLUDED.since,
            handed_off_from = EXCLUDED.handed_off_from,
            active          = EXCLUDED.active
        `;
      }
      applied.responsibilities = body.responsibilities.length;
    }

    // ------------------------------------------------------------------ usage
    if (Array.isArray(body.usage)) {
      for (const u of body.usage) {
        if (!u.usage_date || !u.model) continue;
        await sql`
          INSERT INTO mc_model_usage_daily (
            agent, usage_date, model, purpose, requests,
            input_tokens, output_tokens, cost_usd, updated_at
          ) VALUES (
            ${agent}, ${u.usage_date}, ${u.model}, ${u.purpose ?? 'main'},
            ${u.requests ?? 0}, ${u.input_tokens ?? 0}, ${u.output_tokens ?? 0},
            ${u.cost_usd ?? 0}, NOW()
          )
          ON CONFLICT (agent, usage_date, model, purpose) DO UPDATE SET
            requests      = EXCLUDED.requests,
            input_tokens  = EXCLUDED.input_tokens,
            output_tokens = EXCLUDED.output_tokens,
            cost_usd      = EXCLUDED.cost_usd,
            updated_at    = NOW()
        `;
      }
      applied.usage = body.usage.length;
    }

    await sql`
      INSERT INTO mc_activity_log (agent, action, target, details, category)
      VALUES (
        ${agent}, 'synced telemetry', 'mission control',
        ${JSON.stringify(applied)}, 'telemetry'
      )
    `;

    return NextResponse.json({ ok: true, agent, applied });
  } catch (error) {
    console.error('telemetry sync failed:', error);
    return NextResponse.json(
      {
        error: 'Telemetry sync failed',
        detail: error instanceof Error ? error.message : String(error),
        applied,
      },
      { status: 500 }
    );
  }
}

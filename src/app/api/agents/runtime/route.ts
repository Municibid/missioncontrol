import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * GET /api/agents/runtime
 *
 * Returns each agent's runtime state plus a rollup of their cron jobs,
 * models, current work, responsibilities, and 7-day spend. This is the
 * single call the dashboard makes.
 *
 * Optional: ?agent=marty to scope to one agent.
 */
export async function GET(request: NextRequest) {
  const agentFilter = request.nextUrl.searchParams.get('agent');

  try {
    const runtime = agentFilter
      ? await sql`SELECT * FROM mc_agent_runtime WHERE agent = ${agentFilter}`
      : await sql`SELECT * FROM mc_agent_runtime ORDER BY agent`;

    const cronRollup = await sql`
      SELECT agent,
             COUNT(*) FILTER (WHERE state = 'scheduled')            AS scheduled,
             COUNT(*) FILTER (WHERE state = 'paused')               AS paused,
             COUNT(*) FILTER (WHERE state = 'error')                AS errored,
             COUNT(*) FILTER (WHERE state <> 'retired')             AS total,
             MIN(next_run_at) FILTER (WHERE state = 'scheduled')    AS next_run_at
        FROM mc_cron_jobs
       GROUP BY agent
    `;

    const models = await sql`
      SELECT agent, model, provider, routed_via, purpose, purpose_detail,
             is_default, cost_tier
        FROM mc_models
       WHERE active = TRUE
       ORDER BY agent,
                CASE purpose
                  WHEN 'main' THEN 1 WHEN 'cron' THEN 2
                  WHEN 'subagent' THEN 3 WHEN 'website' THEN 4 ELSE 5
                END
    `;

    const work = await sql`
      SELECT agent, headline, detail, status, blocked_on, channel, updated_at
        FROM mc_agent_work
       WHERE status IN ('active', 'blocked')
       ORDER BY updated_at DESC
    `;

    const responsibilities = await sql`
      SELECT agent, area, detail, channel, since, handed_off_from
        FROM mc_responsibilities
       WHERE active = TRUE
       ORDER BY agent, area
    `;

    const spend = await sql`
      SELECT agent,
             SUM(cost_usd)      AS cost_7d,
             SUM(input_tokens)  AS input_tokens_7d,
             SUM(output_tokens) AS output_tokens_7d
        FROM mc_model_usage_daily
       WHERE usage_date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY agent
    `;

    const versions = await sql`
      SELECT component, agent, version, git_sha, git_branch, channel, detected_at
        FROM mc_versions
       WHERE is_current = TRUE
       ORDER BY component
    `;

    const byAgent = <T extends { agent: string }>(rows: T[], a: string) =>
      rows.filter((r) => r.agent === a);

    const agents = runtime.map((r) => {
      const a = r.agent as string;
      const cron = cronRollup.find((c) => c.agent === a);
      const sp = spend.find((s) => s.agent === a);
      return {
        ...r,
        cron: {
          scheduled: Number(cron?.scheduled ?? 0),
          paused: Number(cron?.paused ?? 0),
          errored: Number(cron?.errored ?? 0),
          total: Number(cron?.total ?? 0),
          next_run_at: cron?.next_run_at ?? null,
        },
        models: byAgent(models as { agent: string }[], a),
        work: byAgent(work as { agent: string }[], a),
        responsibilities: byAgent(responsibilities as { agent: string }[], a),
        spend_7d: {
          cost_usd: Number(sp?.cost_7d ?? 0),
          input_tokens: Number(sp?.input_tokens_7d ?? 0),
          output_tokens: Number(sp?.output_tokens_7d ?? 0),
        },
      };
    });

    return NextResponse.json({ agents, versions });
  } catch (error) {
    console.error('Error fetching agent runtime:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent runtime' },
      { status: 500 }
    );
  }
}

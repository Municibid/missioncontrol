import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * GET /api/cron
 *
 * Query params:
 *   agent    — marty | mara
 *   category — sales | marketing | security | maintenance | cs
 *   state    — scheduled | paused | running | error | retired
 *   include_retired — 'true' to include retired jobs (default: excluded)
 *   runs     — 'true' to attach the last 5 runs per job
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const agent = p.get('agent');
  const category = p.get('category');
  const state = p.get('state');
  const includeRetired = p.get('include_retired') === 'true';
  const withRuns = p.get('runs') === 'true';

  try {
    const jobs = await sql`
      SELECT * FROM mc_cron_jobs
       WHERE (${agent}::text     IS NULL OR agent    = ${agent})
         AND (${category}::text  IS NULL OR category = ${category})
         AND (${state}::text     IS NULL OR state    = ${state})
         AND (${includeRetired}::boolean OR state <> 'retired')
       ORDER BY
         CASE state WHEN 'error' THEN 1 WHEN 'running' THEN 2
                    WHEN 'scheduled' THEN 3 WHEN 'paused' THEN 4 ELSE 5 END,
         next_run_at NULLS LAST,
         name
    `;

    if (!withRuns || jobs.length === 0) {
      return NextResponse.json(jobs);
    }

    const ids = jobs.map((j) => j.id as string);
    const runs = await sql`
      SELECT * FROM (
        SELECT r.*,
               ROW_NUMBER() OVER (PARTITION BY r.cron_job_id ORDER BY r.started_at DESC) AS rn
          FROM mc_cron_runs r
         WHERE r.cron_job_id = ANY(${ids})
      ) t WHERE t.rn <= 5
      ORDER BY started_at DESC
    `;

    const withHistory = jobs.map((j) => ({
      ...j,
      runs: runs.filter((r) => r.cron_job_id === j.id),
    }));

    return NextResponse.json(withHistory);
  } catch (error) {
    console.error('Error fetching cron jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cron jobs' },
      { status: 500 }
    );
  }
}

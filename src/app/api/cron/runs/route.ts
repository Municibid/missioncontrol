import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { authenticateAgent } from '@/lib/agent-auth';

const sql = neon(process.env.DATABASE_URL!);

/**
 * GET  /api/cron/runs   — recent execution history across agents
 * POST /api/cron/runs   — an agent records one execution (agent-auth required)
 *
 * GET params: agent, job, limit (default 50, max 200), status
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const agent = p.get('agent');
  const status = p.get('status');
  const limit = Math.min(Number(p.get('limit') ?? 50) || 50, 200);

  try {
    const runs = await sql`
      SELECT r.*, j.category, j.channel_name
        FROM mc_cron_runs r
        LEFT JOIN mc_cron_jobs j ON j.id = r.cron_job_id
       WHERE (${agent}::text  IS NULL OR r.agent  = ${agent})
         AND (${status}::text IS NULL OR r.status = ${status})
       ORDER BY r.started_at DESC
       LIMIT ${limit}
    `;
    return NextResponse.json(runs);
  } catch (error) {
    console.error('Error fetching cron runs:', error);
    return NextResponse.json({ error: 'Failed to fetch runs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = authenticateAgent(request);
  if (!auth.ok || !auth.agent) {
    return NextResponse.json(
      { error: auth.error ?? 'Unauthorized' },
      { status: auth.status ?? 401 }
    );
  }

  try {
    const body = await request.json();
    const {
      external_id,
      job_name,
      status = 'success',
      started_at,
      finished_at,
      duration_ms,
      model,
      input_tokens,
      output_tokens,
      cost_usd,
      delivered,
      error: runError,
      output_preview,
    } = body;

    if (!job_name) {
      return NextResponse.json(
        { error: 'job_name is required' },
        { status: 400 }
      );
    }

    let cronJobId: string | null = null;
    if (external_id) {
      const found = await sql`
        SELECT id FROM mc_cron_jobs
         WHERE agent = ${auth.agent} AND external_id = ${external_id}
      `;
      cronJobId = (found[0]?.id as string) ?? null;
    }

    const inserted = await sql`
      INSERT INTO mc_cron_runs (
        cron_job_id, agent, job_name, started_at, finished_at, duration_ms,
        status, model, input_tokens, output_tokens, cost_usd, delivered,
        error, output_preview
      ) VALUES (
        ${cronJobId}, ${auth.agent}, ${job_name},
        ${started_at ?? new Date().toISOString()}, ${finished_at ?? null},
        ${duration_ms ?? null}, ${status}, ${model ?? null},
        ${input_tokens ?? null}, ${output_tokens ?? null}, ${cost_usd ?? null},
        ${delivered ?? null}, ${runError ?? null},
        ${output_preview ? String(output_preview).slice(0, 2000) : null}
      )
      RETURNING *
    `;

    // Keep the job row's last-run summary in step with its history.
    if (cronJobId) {
      await sql`
        UPDATE mc_cron_jobs
           SET last_run_at = ${finished_at ?? new Date().toISOString()},
               last_status = ${status},
               last_error  = ${runError ?? null},
               state       = CASE WHEN ${status} = 'failed' THEN 'error'
                                  WHEN state = 'error' THEN 'scheduled'
                                  ELSE state END,
               updated_at  = NOW()
         WHERE id = ${cronJobId}
      `;
    }

    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    console.error('Error recording cron run:', error);
    return NextResponse.json(
      { error: 'Failed to record run' },
      { status: 500 }
    );
  }
}

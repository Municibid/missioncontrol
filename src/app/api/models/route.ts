import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/**
 * GET /api/models
 *
 * Returns the model registry (which LLM, for what purpose, at what tier)
 * plus a daily spend series for charting.
 *
 * Params: agent, days (default 14, max 90)
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const agent = p.get('agent');
  const days = Math.min(Number(p.get('days') ?? 14) || 14, 90);

  try {
    const models = await sql`
      SELECT * FROM mc_models
       WHERE active = TRUE
         AND (${agent}::text IS NULL OR agent = ${agent})
       ORDER BY agent,
                CASE purpose
                  WHEN 'main' THEN 1 WHEN 'cron' THEN 2
                  WHEN 'subagent' THEN 3 WHEN 'website' THEN 4 ELSE 5
                END,
                model
    `;

    const usage = await sql`
      SELECT usage_date, agent, model, purpose,
             SUM(requests)      AS requests,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cost_usd)      AS cost_usd
        FROM mc_model_usage_daily
       WHERE usage_date >= CURRENT_DATE - (${days} || ' days')::interval
         AND (${agent}::text IS NULL OR agent = ${agent})
       GROUP BY usage_date, agent, model, purpose
       ORDER BY usage_date DESC
    `;

    const totals = await sql`
      SELECT agent, model,
             SUM(cost_usd)      AS cost_usd,
             SUM(requests)      AS requests,
             SUM(input_tokens)  AS input_tokens,
             SUM(output_tokens) AS output_tokens
        FROM mc_model_usage_daily
       WHERE usage_date >= CURRENT_DATE - (${days} || ' days')::interval
         AND (${agent}::text IS NULL OR agent = ${agent})
       GROUP BY agent, model
       ORDER BY SUM(cost_usd) DESC
    `;

    return NextResponse.json({ models, usage, totals, window_days: days });
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}

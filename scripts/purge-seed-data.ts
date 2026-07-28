import { neon } from '@neondatabase/serverless';

/**
 * Remove the synthetic spend + run rows created during development to verify
 * the charts and run-history UI. Real agents overwrite mc_model_usage_daily on
 * every sync, so this only clears fabricated numbers — nothing real is lost.
 *
 * Run once after the first real deploy:
 *   npx tsx scripts/purge-seed-data.ts
 */
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const usage = await sql`DELETE FROM mc_model_usage_daily RETURNING id`;
  console.log(`removed ${usage.length} synthetic usage row(s)`);

  const runs = await sql`
    DELETE FROM mc_cron_runs
     WHERE error = 'probe'
        OR error = 'BigQuery: table RWX_Listings not found in dataset'
        OR output_preview IS NULL AND status = 'silent'
    RETURNING id
  `;
  console.log(`removed ${runs.length} synthetic run row(s)`);

  // Clear the fabricated last-run summary those runs left on the job rows.
  const cleared = await sql`
    UPDATE mc_cron_jobs
       SET last_run_at = NULL, last_status = NULL, last_error = NULL,
           state = CASE WHEN state = 'error' AND enabled THEN 'scheduled'
                        WHEN state = 'error' THEN 'paused'
                        ELSE state END
     WHERE external_id IN ('203be8734aec', '6cf703d3a8c3')
    RETURNING external_id
  `;
  console.log(`cleared last-run summary on ${cleared.length} job(s)`);

  // Mara's placeholder test job — she registers her own on first sync.
  const mara = await sql`
    DELETE FROM mc_cron_jobs WHERE agent = 'mara' AND external_id = 'mara-test-1'
    RETURNING name
  `;
  console.log(`removed ${mara.length} placeholder mara job(s)`);

  console.log('\n✓ Seed data purged. Dashboard now shows only real telemetry.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { neon } from '@neondatabase/serverless';

/**
 * Migration 003 — widen columns that real-world values overflow.
 *
 * Discovered in end-to-end testing: `hermes version` emits a long descriptive
 * string ("Hermes Agent v0.19.0 (2026.7.20) · upstream 7cd48733 · local ...")
 * which blows past the original VARCHAR(50) on framework_version.
 */
const sql = neon(process.env.DATABASE_URL!);

const statements = [
  `ALTER TABLE mc_agent_runtime ALTER COLUMN framework_version TYPE VARCHAR(200)`,
  `ALTER TABLE mc_agent_runtime ALTER COLUMN host TYPE VARCHAR(200)`,
  `ALTER TABLE mc_agent_runtime ALTER COLUMN default_model TYPE VARCHAR(150)`,
  `ALTER TABLE mc_versions ALTER COLUMN version TYPE VARCHAR(200)`,
  `ALTER TABLE mc_cron_jobs ALTER COLUMN schedule_human TYPE VARCHAR(300)`,
  `ALTER TABLE mc_cron_jobs ALTER COLUMN model TYPE VARCHAR(150)`,
  `ALTER TABLE mc_models ALTER COLUMN model TYPE VARCHAR(150)`,
  `ALTER TABLE mc_model_usage_daily ALTER COLUMN model TYPE VARCHAR(150)`,
];

async function main() {
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log(`  ✓ ${stmt}`);
  }
  console.log('\n✓ Migration 003 complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

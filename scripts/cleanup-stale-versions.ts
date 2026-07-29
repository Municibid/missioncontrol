import { neon } from '@neondatabase/serverless';

/**
 * One-off cleanup: the first telemetry sync stored the full descriptive
 * `hermes version` output ("Hermes Agent v0.19.0 (2026.7.20) · upstream ...")
 * as the version string. mc-sync.py now normalises that to a semver, but the
 * old row is still flagged is_current so the dashboard keeps showing it.
 * Delete the stale rows; the next sync inserts the clean value.
 */
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const removed = await sql`
    DELETE FROM mc_versions
     WHERE component = 'hermes' AND version LIKE 'Hermes Agent%'
    RETURNING version
  `;
  console.log(`removed ${removed.length} stale hermes version row(s)`);
  for (const r of removed) console.log(`  - ${(r as { version: string }).version}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

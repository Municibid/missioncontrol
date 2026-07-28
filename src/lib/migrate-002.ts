/**
 * Run migration 002 (agent telemetry) against the Neon database.
 *
 *   cd ~/mission-control && npx tsx src/lib/migrate-002.ts
 *
 * Idempotent — safe to run repeatedly.
 */
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join } from 'path';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Split on statement-terminating semicolons, then drop chunks that are pure
 * comment. Naive but correct here: the migration has no semicolons inside
 * string literals or function bodies.
 */
function splitStatements(text: string): string[] {
  return text
    .split(/;\s*(?:\r?\n|$)/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => stripComments(chunk).length > 0);
}

function stripComments(chunk: string): string {
  return chunk
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
}

async function main() {
  const path = join(process.cwd(), 'src/lib/migrations/002-agent-telemetry.sql');
  const raw = readFileSync(path, 'utf8');
  const statements = splitStatements(raw);

  console.log(`Running ${statements.length} statements from 002-agent-telemetry.sql\n`);

  let ok = 0;
  for (const stmt of statements) {
    const label = stripComments(stmt).split('\n')[0].slice(0, 72);
    if (!label) continue;
    try {
      await sql.query(stmt);
      console.log(`  ✓ ${label}`);
      ok++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${label}\n      ${msg}`);
      throw err;
    }
  }

  console.log(`\n✓ Migration 002 complete (${ok} statements).`);

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'mc_%'
    ORDER BY table_name
  `;
  console.log('\nmc_ tables now present:');
  for (const t of tables) console.log(`  - ${(t as { table_name: string }).table_name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

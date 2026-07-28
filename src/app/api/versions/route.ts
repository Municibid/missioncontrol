import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

/** GET /api/versions — current + historical component versions. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const component = p.get('component');
  const currentOnly = p.get('current') === 'true';
  const limit = Math.min(Number(p.get('limit') ?? 50) || 50, 200);

  try {
    const versions = await sql`
      SELECT * FROM mc_versions
       WHERE (${component}::text IS NULL OR component = ${component})
         AND (${currentOnly}::boolean = FALSE OR is_current = TRUE)
       ORDER BY is_current DESC, detected_at DESC
       LIMIT ${limit}
    `;
    return NextResponse.json(versions);
  } catch (error) {
    console.error('Error fetching versions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch versions' },
      { status: 500 }
    );
  }
}

import { NextRequest } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import type { AgentSlug } from './telemetry';

/**
 * Agent write authentication.
 *
 * Agents (Marty, Mara) run headless and cannot complete a Google OAuth flow, so
 * telemetry writes authenticate with a shared bearer token instead:
 *
 *   Authorization: Bearer <AGENT_API_TOKEN>
 *   X-Agent: marty | mara
 *
 * Set AGENT_API_TOKEN in Vercel env and in each agent's local env. The token
 * only grants telemetry writes — it cannot read tasks, documents, or memory.
 */

const VALID_AGENTS: AgentSlug[] = ['marty', 'mara'];

export interface AgentAuthResult {
  ok: boolean;
  agent?: AgentSlug;
  error?: string;
  status?: number;
}

function constantTimeEquals(a: string, b: string): boolean {
  // Hash both sides first so differing lengths don't throw and don't leak length.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function authenticateAgent(request: NextRequest): AgentAuthResult {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected) {
    return {
      ok: false,
      error: 'AGENT_API_TOKEN is not configured on the server',
      status: 500,
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    return { ok: false, error: 'Missing Bearer token', status: 401 };
  }

  if (!constantTimeEquals(match[1], expected)) {
    return { ok: false, error: 'Invalid token', status: 401 };
  }

  const claimed = (request.headers.get('x-agent') ?? '').toLowerCase();
  if (!VALID_AGENTS.includes(claimed as AgentSlug)) {
    return {
      ok: false,
      error: `X-Agent header must be one of: ${VALID_AGENTS.join(', ')}`,
      status: 400,
    };
  }

  return { ok: true, agent: claimed as AgentSlug };
}

export function isValidAgent(value: unknown): value is AgentSlug {
  return typeof value === 'string' && VALID_AGENTS.includes(value as AgentSlug);
}

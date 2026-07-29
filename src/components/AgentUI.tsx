'use client';

import { clsx } from 'clsx';

/** Agent identity → colour, so Marty and Mara are visually distinct everywhere. */
export const AGENT_THEME = {
  marty: {
    label: 'Marty',
    gradient: 'from-emerald-400 to-cyan-500',
    text: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    ring: 'ring-emerald-500/40',
    dot: 'bg-emerald-500',
  },
  mara: {
    label: 'MARA',
    gradient: 'from-purple-400 to-fuchsia-500',
    text: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
    ring: 'ring-purple-500/40',
    dot: 'bg-purple-500',
  },
} as const;

export type AgentKey = keyof typeof AGENT_THEME;

export function agentTheme(agent: string | null | undefined) {
  const key = (agent ?? '').toLowerCase() as AgentKey;
  return AGENT_THEME[key] ?? {
    label: agent ?? 'Unknown',
    gradient: 'from-zinc-500 to-zinc-600',
    text: 'text-zinc-400',
    bg: 'bg-zinc-500/10',
    border: 'border-zinc-600/30',
    ring: 'ring-zinc-500/40',
    dot: 'bg-zinc-500',
  };
}

export function AgentBadge({
  agent,
  avatar,
  size = 'md',
}: {
  agent: string;
  avatar?: string | null;
  size?: 'sm' | 'md' | 'lg';
}) {
  const t = agentTheme(agent);
  const dims = {
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-9 h-9 text-xs',
    lg: 'w-12 h-12 text-base',
  }[size];

  return (
    <div
      className={clsx(
        'rounded-full bg-gradient-to-br flex items-center justify-center text-white font-bold shrink-0',
        t.gradient,
        dims
      )}
      title={t.label}
    >
      {avatar || t.label[0]}
    </div>
  );
}

export function AgentPill({ agent }: { agent: string }) {
  const t = agentTheme(agent);
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border',
        t.bg,
        t.text,
        t.border
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full', t.dot)} />
      {t.label}
    </span>
  );
}

const STATE_STYLES: Record<string, string> = {
  scheduled: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  running: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  paused: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/10 text-red-400 border-red-500/30',
  retired: 'bg-zinc-700/30 text-zinc-500 border-zinc-600/30',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/10 text-red-400 border-red-500/30',
  silent: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30',
  skipped: 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30',
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  blocked: 'bg-red-500/10 text-red-400 border-red-500/30',
  idle: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  offline: 'bg-zinc-700/30 text-zinc-500 border-zinc-600/30',
};

export function StatusPill({ status }: { status: string | null | undefined }) {
  const s = (status ?? 'unknown').toLowerCase();
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize',
        STATE_STYLES[s] ?? 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30'
      )}
    >
      {s}
    </span>
  );
}

const CATEGORY_STYLES: Record<string, string> = {
  sales: 'bg-purple-500/10 text-purple-300 border-purple-500/30',
  marketing: 'bg-pink-500/10 text-pink-300 border-pink-500/30',
  security: 'bg-red-500/10 text-red-300 border-red-500/30',
  maintenance: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  cs: 'bg-teal-500/10 text-teal-300 border-teal-500/30',
};

export function CategoryPill({ category }: { category: string | null }) {
  if (!category) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border uppercase tracking-wide',
        CATEGORY_STYLES[category] ??
          'bg-zinc-700/30 text-zinc-400 border-zinc-600/30'
      )}
    >
      {category}
    </span>
  );
}

const TIER_STYLES: Record<string, string> = {
  premium: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  standard: 'bg-sky-500/10 text-sky-300 border-sky-500/30',
  economy: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

export function TierPill({ tier }: { tier: string | null }) {
  if (!tier) return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border capitalize',
        TIER_STYLES[tier] ?? 'bg-zinc-700/30 text-zinc-400 border-zinc-600/30'
      )}
    >
      {tier}
    </span>
  );
}

/** "3m ago" / "in 2h" relative formatter that handles both directions. */
export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = then - Date.now();
  const future = diff > 0;
  const mins = Math.floor(Math.abs(diff) / 60000);

  let text: string;
  if (mins < 1) text = 'just now';
  else if (mins < 60) text = `${mins}m`;
  else if (mins < 1440) text = `${Math.floor(mins / 60)}h`;
  else text = `${Math.floor(mins / 1440)}d`;

  if (text === 'just now') return text;
  return future ? `in ${text}` : `${text} ago`;
}

export function formatCost(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

export function formatTokens(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

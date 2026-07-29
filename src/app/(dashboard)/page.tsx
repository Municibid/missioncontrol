'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import {
  RefreshCw,
  Clock,
  Cpu,
  Timer,
  AlertTriangle,
  PauseCircle,
  Activity,
  GitBranch,
} from 'lucide-react';
import {
  AgentBadge,
  AgentPill,
  StatusPill,
  relativeTime,
  formatCost,
  formatTokens,
  agentTheme,
} from '@/components/AgentUI';

interface RuntimeAgent {
  agent: string;
  display_name: string;
  role: string | null;
  avatar: string;
  framework: string | null;
  framework_version: string | null;
  host: string | null;
  timezone: string | null;
  default_model: string | null;
  default_provider: string | null;
  status: string;
  last_heartbeat_at: string | null;
  meta: Record<string, unknown>;
  cron: {
    scheduled: number;
    paused: number;
    errored: number;
    total: number;
    next_run_at: string | null;
  };
  models: Array<{
    model: string;
    provider: string;
    purpose: string;
    purpose_detail: string | null;
    is_default: boolean;
    routed_via: string | null;
  }>;
  work: Array<{
    headline: string;
    detail: string | null;
    status: string;
    blocked_on: string | null;
    channel: string | null;
    updated_at: string;
  }>;
  responsibilities: Array<{
    area: string;
    detail: string | null;
    channel: string | null;
    handed_off_from: string | null;
  }>;
  spend_7d: {
    cost_usd: number;
    input_tokens: number;
    output_tokens: number;
  };
}

interface VersionRow {
  component: string;
  agent: string | null;
  version: string;
  git_sha: string | null;
  git_branch: string | null;
  channel: string | null;
  detected_at: string;
}

export default function Dashboard() {
  const [agents, setAgents] = useState<RuntimeAgent[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/agents/runtime', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      setVersions(Array.isArray(data.versions) ? data.versions : []);
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60_000);
    return () => clearInterval(id);
  }, [fetchData]);

  const totalScheduled = agents.reduce((s, a) => s + a.cron.scheduled, 0);
  const totalErrored = agents.reduce((s, a) => s + a.cron.errored, 0);
  const totalPaused = agents.reduce((s, a) => s + a.cron.paused, 0);
  const totalSpend = agents.reduce((s, a) => s + a.spend_7d.cost_usd, 0);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Mission Control</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Marty &amp; MARA — live agent state, schedules, and model spend
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-xs text-zinc-500">
              updated {relativeTime(lastFetch.toISOString())}
            </span>
          )}
          <button
            onClick={fetchData}
            className="p-2 text-zinc-400 hover:text-white hover:bg-[#27272a] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw className={clsx('w-5 h-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          Couldn&apos;t load agent telemetry: {error}
        </div>
      )}

      {/* Fleet summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="Scheduled jobs"
          value={totalScheduled}
          sub="across both agents"
          icon={Timer}
          href="/cron"
        />
        <SummaryCard
          label="Paused"
          value={totalPaused}
          sub="awaiting handoff"
          icon={PauseCircle}
          href="/cron?state=paused"
          tone={totalPaused > 0 ? 'warn' : undefined}
        />
        <SummaryCard
          label="Failing"
          value={totalErrored}
          sub={totalErrored > 0 ? 'needs attention' : 'all healthy'}
          icon={AlertTriangle}
          href="/cron?state=error"
          tone={totalErrored > 0 ? 'bad' : 'good'}
        />
        <SummaryCard
          label="7-day model spend"
          value={formatCost(totalSpend)}
          sub="all agents, all purposes"
          icon={Cpu}
          href="/models"
        />
      </div>

      {/* Agent cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 items-start">
        {agents.length === 0 && !loading ? (
          <div className="col-span-full p-8 rounded-xl bg-[#18181b] border border-[#27272a] text-center">
            <p className="text-zinc-400">No agents have reported yet.</p>
            <p className="text-zinc-600 text-sm mt-2">
              Agents publish state via <code>POST /api/telemetry/sync</code>.
            </p>
          </div>
        ) : (
          agents.map((a) => <AgentCard key={a.agent} agent={a} />)
        )}
      </div>

      {/* Versions */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Current versions
          </h2>
          <GitBranch className="w-5 h-5 text-zinc-500" />
        </div>
        {versions.length === 0 ? (
          <p className="text-zinc-500 text-sm">No versions reported yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {versions.map((v) => (
              <div
                key={`${v.component}-${v.version}`}
                className="p-3 rounded-lg bg-[#0f0f13] border border-[#27272a]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-white truncate">
                    {v.component}
                  </span>
                  {v.agent && <AgentPill agent={v.agent} />}
                </div>
                <p className="text-xs font-mono text-indigo-300 mt-1">
                  {v.version}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  {v.git_branch && <span>{v.git_branch} </span>}
                  {v.git_sha && (
                    <span className="font-mono">{v.git_sha.slice(0, 7)} </span>
                  )}
                  · {relativeTime(v.detected_at)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const toneText =
    tone === 'bad'
      ? 'text-red-400'
      : tone === 'warn'
        ? 'text-amber-400'
        : tone === 'good'
          ? 'text-emerald-400'
          : 'text-white';

  return (
    <Link
      href={href}
      className="bg-[#18181b] rounded-xl border border-[#27272a] p-5 hover:border-indigo-500/50 hover:bg-[#1f1f23] transition-all"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            {label}
          </p>
          <p className={clsx('text-2xl font-bold mt-1', toneText)}>{value}</p>
          <p className="text-xs text-zinc-500 mt-1">{sub}</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
      </div>
    </Link>
  );
}

function AgentCard({ agent: a }: { agent: RuntimeAgent }) {
  const t = agentTheme(a.agent);
  const heartbeatStale =
    !a.last_heartbeat_at ||
    Date.now() - new Date(a.last_heartbeat_at).getTime() > 2 * 3600 * 1000;

  return (
    <div
      className={clsx(
        'bg-[#18181b] rounded-xl border p-6',
        heartbeatStale ? 'border-amber-500/30' : t.border
      )}
    >
      <div className="flex items-start gap-4 mb-5">
        <AgentBadge agent={a.agent} avatar={a.avatar} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-white">
              {a.display_name}
            </h2>
            <StatusPill status={a.status} />
          </div>
          <p className="text-sm text-zinc-400 mt-0.5">{a.role ?? '—'}</p>
          <p className="text-xs text-zinc-600 mt-1 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            heartbeat {relativeTime(a.last_heartbeat_at)}
            {heartbeatStale && (
              <span className="text-amber-400">· stale</span>
            )}
          </p>
        </div>
      </div>

      {/* runtime facts */}
      <dl className="grid grid-cols-2 gap-3 mb-5 text-sm">
        <Fact label="Framework">
          <span className="capitalize">{a.framework ?? '—'}</span>
          {a.framework_version && (
            <span className="text-zinc-400 font-mono text-xs ml-1">
              {a.framework_version}
            </span>
          )}
        </Fact>
        <Fact label="Host">{a.host ?? '—'}</Fact>
        <Fact label="Default model">
          <span className="font-mono text-xs">{a.default_model ?? '—'}</span>
        </Fact>
        <Fact label="Timezone">{a.timezone ?? '—'}</Fact>
      </dl>

      {/* cron rollup */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <MiniStat label="Sched" value={a.cron.scheduled} tone="good" />
        <MiniStat label="Paused" value={a.cron.paused} tone="warn" />
        <MiniStat label="Errors" value={a.cron.errored} tone="bad" />
        <MiniStat label="7d" value={formatCost(a.spend_7d.cost_usd)} />
      </div>
      {a.cron.next_run_at && (
        <p className="text-xs text-zinc-500 mb-5">
          Next job fires{' '}
          <span className="text-zinc-300">
            {relativeTime(a.cron.next_run_at)}
          </span>
          {' · '}
          {formatTokens(a.spend_7d.input_tokens)} in /{' '}
          {formatTokens(a.spend_7d.output_tokens)} out last 7d
        </p>
      )}

      {/* models */}
      {a.models.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
            Models in use
          </p>
          <div className="space-y-1.5">
            {a.models.map((m) => (
              <div
                key={`${m.model}-${m.purpose}`}
                className="flex items-start gap-2 text-xs"
              >
                <span className="px-1.5 py-0.5 rounded bg-[#27272a] text-zinc-300 font-medium uppercase tracking-wide shrink-0">
                  {m.purpose}
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-indigo-300">{m.model}</span>
                  {m.routed_via && (
                    <span className="text-zinc-600"> via {m.routed_via}</span>
                  )}
                  {m.purpose_detail && (
                    <p className="text-zinc-500 mt-0.5">{m.purpose_detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* current work */}
      <div className="mb-5">
        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
          <Activity className="w-3 h-3" /> Working on
        </p>
        {a.work.length === 0 ? (
          <p className="text-xs text-zinc-600">Nothing reported.</p>
        ) : (
          <ul className="space-y-2">
            {a.work.slice(0, 4).map((w, i) => (
              <li key={i} className="text-sm">
                <div className="flex items-start gap-2">
                  <StatusPill status={w.status} />
                  <div className="min-w-0">
                    <p className="text-zinc-200">{w.headline}</p>
                    {w.blocked_on && (
                      <p className="text-xs text-red-400 mt-0.5">
                        blocked: {w.blocked_on}
                      </p>
                    )}
                    {w.channel && (
                      <p className="text-xs text-zinc-600 mt-0.5">
                        {w.channel}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* responsibilities */}
      {a.responsibilities.length > 0 && (
        <div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
            Owns
          </p>
          <div className="flex flex-wrap gap-1.5">
            {a.responsibilities.map((r) => (
              <span
                key={r.area}
                className={clsx(
                  'px-2 py-0.5 rounded text-xs border',
                  t.bg,
                  t.text,
                  t.border
                )}
                title={r.detail ?? undefined}
              >
                {r.area}
                {r.handed_off_from && (
                  <span className="text-zinc-500"> ← {r.handed_off_from}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-zinc-200 truncate">{children}</dd>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: 'good' | 'warn' | 'bad';
}) {
  const isZero = value === 0 || value === '0';
  const color =
    isZero || !tone
      ? 'text-zinc-300'
      : tone === 'bad'
        ? 'text-red-400'
        : tone === 'warn'
          ? 'text-amber-400'
          : 'text-emerald-400';
  return (
    <div className="p-2 rounded-lg bg-[#0f0f13] border border-[#27272a] text-center">
      <p className={clsx('text-lg font-bold', color)}>{value}</p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-wide">
        {label}
      </p>
    </div>
  );
}

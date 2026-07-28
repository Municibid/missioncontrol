'use client';

import { useEffect, useMemo, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import {
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import {
  AgentPill,
  StatusPill,
  CategoryPill,
  relativeTime,
} from '@/components/AgentUI';

interface CronRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: string;
  error: string | null;
  output_preview: string | null;
}

interface CronJob {
  id: string;
  agent: string;
  external_id: string;
  name: string;
  description: string | null;
  schedule: string;
  schedule_tz: string | null;
  schedule_human: string | null;
  deliver_target: string | null;
  channel_name: string | null;
  model: string | null;
  provider: string | null;
  toolsets: string[];
  script_path: string | null;
  no_agent: boolean;
  timeout_seconds: number | null;
  category: string | null;
  enabled: boolean;
  state: string;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  next_run_at: string | null;
  prompt_preview: string | null;
  owner_note: string | null;
  runs?: CronRun[];
}

const AGENT_FILTERS = ['all', 'marty', 'mara'] as const;
const CATEGORY_FILTERS = [
  'all',
  'sales',
  'marketing',
  'security',
  'maintenance',
  'cs',
] as const;

/**
 * useSearchParams() forces this subtree to bail out of prerendering, so the
 * route needs an explicit Suspense boundary at the page level.
 */
export default function CronPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8">
          <h1 className="text-2xl font-bold text-white">Cron Jobs</h1>
          <p className="text-sm text-zinc-500 mt-1">Loading schedule…</p>
        </div>
      }
    >
      <CronPageBody />
    </Suspense>
  );
}

function CronPageBody() {
  const params = useSearchParams();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>(
    params.get('state') ?? 'all'
  );
  const [showRetired, setShowRetired] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ runs: 'true' });
      if (showRetired) qs.set('include_retired', 'true');
      const res = await fetch(`/api/cron?${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setJobs(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [showRetired]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const filtered = useMemo(
    () =>
      jobs.filter(
        (j) =>
          (agentFilter === 'all' || j.agent === agentFilter) &&
          (categoryFilter === 'all' || j.category === categoryFilter) &&
          (stateFilter === 'all' || j.state === stateFilter)
      ),
    [jobs, agentFilter, categoryFilter, stateFilter]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, CronJob[]>();
    for (const j of filtered) {
      const key = j.category ?? 'other';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(j);
    }
    const order = ['sales', 'marketing', 'security', 'maintenance', 'cs', 'other'];
    return [...map.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [filtered]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Cron Jobs</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Every scheduled job across both agents and all channels —{' '}
            {filtered.length} shown
          </p>
        </div>
        <button
          onClick={fetchJobs}
          className="p-2 text-zinc-400 hover:text-white hover:bg-[#27272a] rounded-lg transition-colors"
          title="Refresh"
        >
          <RefreshCw className={clsx('w-5 h-5', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <FilterGroup
          options={AGENT_FILTERS}
          value={agentFilter}
          onChange={setAgentFilter}
        />
        <span className="w-px h-5 bg-[#27272a]" />
        <FilterGroup
          options={CATEGORY_FILTERS}
          value={categoryFilter}
          onChange={setCategoryFilter}
        />
        <span className="w-px h-5 bg-[#27272a]" />
        <FilterGroup
          options={['all', 'scheduled', 'paused', 'error']}
          value={stateFilter}
          onChange={setStateFilter}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-400 ml-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showRetired}
            onChange={(e) => setShowRetired(e.target.checked)}
            className="rounded border-zinc-600 bg-[#18181b]"
          />
          show retired
        </label>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {filtered.length === 0 && !loading ? (
        <div className="p-8 rounded-xl bg-[#18181b] border border-[#27272a] text-center">
          <p className="text-zinc-400">No jobs match these filters.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(([category, catJobs]) => (
            <div key={category}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                  {category}
                </h2>
                <span className="text-xs text-zinc-600">
                  {catJobs.length} job{catJobs.length === 1 ? '' : 's'}
                </span>
                <div className="flex-1 h-px bg-[#1f1f23]" />
              </div>
              <div className="space-y-2">
                {catJobs.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    expanded={expanded.has(j.id)}
                    onToggle={() => toggle(j.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className={clsx(
            'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors',
            value === o
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:bg-[#27272a] hover:text-white'
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function JobRow({
  job: j,
  expanded,
  onToggle,
}: {
  job: CronJob;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isRetired = j.state === 'retired';

  return (
    <div
      className={clsx(
        'rounded-lg border bg-[#18181b] transition-colors',
        j.state === 'error'
          ? 'border-red-500/30'
          : j.state === 'paused'
            ? 'border-amber-500/20'
            : 'border-[#27272a]',
        isRetired && 'opacity-50'
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-[#1f1f23] transition-colors rounded-lg"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-zinc-500 mt-1 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-zinc-500 mt-1 shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-white">{j.name}</span>
            <AgentPill agent={j.agent} />
            <StatusPill status={j.state} />
            <CategoryPill category={j.category} />
            {j.no_agent && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-300 border border-sky-500/30 flex items-center gap-1">
                <Terminal className="w-3 h-3" /> script
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-500 flex-wrap">
            <code className="text-zinc-400">{j.schedule}</code>
            {j.schedule_human && <span>· {j.schedule_human}</span>}
            {j.channel_name && (
              <span className="text-zinc-400">→ {j.channel_name}</span>
            )}
            {j.model && (
              <span className="font-mono text-indigo-400/80">{j.model}</span>
            )}
          </div>

          {j.owner_note && (
            <p className="text-xs text-amber-400/80 mt-1.5">{j.owner_note}</p>
          )}
        </div>

        <div className="text-right shrink-0 text-xs">
          {j.state === 'scheduled' && j.next_run_at && (
            <p className="text-zinc-300">next {relativeTime(j.next_run_at)}</p>
          )}
          {j.last_run_at ? (
            <p className="text-zinc-600 mt-0.5">
              ran {relativeTime(j.last_run_at)}
              {j.last_status && ` · ${j.last_status}`}
            </p>
          ) : (
            <p className="text-zinc-600 mt-0.5">never run</p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-11 space-y-4 border-t border-[#27272a] pt-4">
          {j.description && (
            <p className="text-sm text-zinc-300">{j.description}</p>
          )}

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <Detail label="Job ID">
              <code className="text-zinc-400">{j.external_id}</code>
            </Detail>
            <Detail label="Timezone">{j.schedule_tz ?? 'default'}</Detail>
            <Detail label="Provider">{j.provider ?? '—'}</Detail>
            <Detail label="Timeout">
              {j.timeout_seconds ? `${j.timeout_seconds}s` : 'default'}
            </Detail>
            <Detail label="Deliver to">{j.deliver_target ?? '—'}</Detail>
            <Detail label="Toolsets">
              {j.toolsets?.length ? j.toolsets.join(', ') : 'all'}
            </Detail>
            {j.script_path && (
              <Detail label="Script">
                <code className="text-zinc-400 break-all">{j.script_path}</code>
              </Detail>
            )}
          </dl>

          {j.last_error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-xs font-medium text-red-300 mb-1">
                Last error
              </p>
              <pre className="text-xs text-red-200/80 whitespace-pre-wrap break-all">
                {j.last_error}
              </pre>
            </div>
          )}

          {j.prompt_preview && (
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Prompt
              </p>
              <pre className="text-xs text-zinc-400 bg-[#0f0f13] border border-[#27272a] rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {j.prompt_preview}
              </pre>
            </div>
          )}

          {j.runs && j.runs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-1.5">
                Recent runs
              </p>
              <div className="space-y-1">
                {j.runs.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 text-xs py-1.5 px-2 rounded bg-[#0f0f13]"
                  >
                    <StatusPill status={r.status} />
                    <span className="text-zinc-400">
                      {relativeTime(r.started_at)}
                    </span>
                    {r.duration_ms != null && (
                      <span className="text-zinc-600">
                        {(r.duration_ms / 1000).toFixed(1)}s
                      </span>
                    )}
                    {r.error && (
                      <span className="text-red-400 truncate">{r.error}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-zinc-600">{label}</dt>
      <dd className="text-zinc-300 mt-0.5">{children}</dd>
    </div>
  );
}

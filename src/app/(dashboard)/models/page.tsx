'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { RefreshCw, AlertTriangle, Cpu } from 'lucide-react';
import {
  AgentPill,
  TierPill,
  relativeTime,
  formatCost,
  formatTokens,
  agentTheme,
} from '@/components/AgentUI';

interface ModelRow {
  id: string;
  agent: string;
  model: string;
  provider: string;
  routed_via: string | null;
  purpose: string;
  purpose_detail: string | null;
  reasoning_effort: string | null;
  is_default: boolean;
  cost_tier: string | null;
  input_cost_per_mtok: string | null;
  output_cost_per_mtok: string | null;
  notes: string | null;
  updated_at: string;
}

interface UsageRow {
  usage_date: string;
  agent: string;
  model: string;
  purpose: string;
  requests: string;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
}

interface TotalRow {
  agent: string;
  model: string;
  cost_usd: string;
  requests: string;
  input_tokens: string;
  output_tokens: string;
}

const PURPOSE_ORDER = ['main', 'cron', 'subagent', 'website', 'fallback'];

const PURPOSE_COPY: Record<string, string> = {
  main: 'Interactive conversation — Slack, Telegram, direct chat',
  cron: 'Scheduled jobs — reports, scans, maintenance',
  subagent: 'Delegated background work',
  website: 'Public-facing agent on municibid.com',
  fallback: 'Used when the primary model is unavailable',
};

export default function ModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [totals, setTotals] = useState<TotalRow[]>([]);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/models?days=${days}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setModels(Array.isArray(data.models) ? data.models : []);
      setUsage(Array.isArray(data.usage) ? data.usage : []);
      setTotals(Array.isArray(data.totals) ? data.totals : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const byAgent = useMemo(() => {
    const map = new Map<string, ModelRow[]>();
    for (const m of models) {
      if (!map.has(m.agent)) map.set(m.agent, []);
      map.get(m.agent)!.push(m);
    }
    for (const rows of map.values()) {
      rows.sort(
        (a, b) =>
          PURPOSE_ORDER.indexOf(a.purpose) - PURPOSE_ORDER.indexOf(b.purpose)
      );
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [models]);

  const dailySeries = useMemo(() => {
    const map = new Map<string, number>();
    for (const u of usage) {
      const d = String(u.usage_date).slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + Number(u.cost_usd));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [usage]);

  const maxDaily = Math.max(...dailySeries.map(([, v]) => v), 0.01);
  const totalSpend = totals.reduce((s, t) => s + Number(t.cost_usd), 0);

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Models &amp; Spend</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Which LLM each agent uses, for what, and what it costs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={clsx(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                days === d
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:bg-[#27272a] hover:text-white'
              )}
            >
              {d}d
            </button>
          ))}
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
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Spend chart */}
      <div className="bg-[#18181b] rounded-xl border border-[#27272a] p-6 mb-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Spend, last {days} days
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              {formatCost(totalSpend)} total across all agents and purposes
            </p>
          </div>
          <Cpu className="w-5 h-5 text-zinc-500" />
        </div>

        {dailySeries.length === 0 ? (
          <p className="text-zinc-500 text-sm">
            No usage recorded yet. Agents publish spend via{' '}
            <code>POST /api/telemetry/sync</code>.
          </p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {dailySeries.map(([date, cost]) => (
              <div
                key={date}
                className="flex-1 flex flex-col justify-end h-full gap-1 group"
                title={`${date}: ${formatCost(cost)}`}
              >
                <div
                  className="w-full bg-indigo-500/60 group-hover:bg-indigo-400 rounded-t transition-colors"
                  style={{
                    // Percentages need an explicit basis: the parent is a
                    // full-height flex column, and a 2px floor keeps zero-spend
                    // days visible as a baseline tick.
                    height: `max(2px, ${(cost / maxDaily) * 100}%)`,
                  }}
                />
                <span className="text-[9px] text-zinc-600 truncate w-full text-center shrink-0">
                  {date.slice(5)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Model registry per agent */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 items-start">
        {byAgent.length === 0 && !loading ? (
          <div className="col-span-full p-8 rounded-xl bg-[#18181b] border border-[#27272a] text-center">
            <p className="text-zinc-400">No model config reported yet.</p>
          </div>
        ) : (
          byAgent.map(([agent, rows]) => {
            const t = agentTheme(agent);
            return (
              <div
                key={agent}
                className={clsx(
                  'bg-[#18181b] rounded-xl border p-6',
                  t.border
                )}
              >
                <div className="flex items-center gap-2 mb-4">
                  <AgentPill agent={agent} />
                  <span className="text-sm text-zinc-500">
                    {rows.length} model assignment
                    {rows.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="space-y-3">
                  {rows.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-lg bg-[#0f0f13] border border-[#27272a]"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded bg-[#27272a] text-zinc-300 text-[10px] font-medium uppercase tracking-wide">
                              {m.purpose}
                            </span>
                            {m.is_default && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[10px] font-medium">
                                default
                              </span>
                            )}
                            <TierPill tier={m.cost_tier} />
                          </div>
                          <p className="font-mono text-sm text-indigo-300 mt-1.5 break-all">
                            {m.model}
                          </p>
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400">
                        {m.purpose_detail ?? PURPOSE_COPY[m.purpose] ?? ''}
                      </p>

                      <div className="flex items-center gap-3 mt-2 text-[11px] text-zinc-600 flex-wrap">
                        <span>{m.provider}</span>
                        {m.routed_via && <span>via {m.routed_via}</span>}
                        {m.reasoning_effort && (
                          <span>effort: {m.reasoning_effort}</span>
                        )}
                        {m.input_cost_per_mtok && (
                          <span>
                            ${m.input_cost_per_mtok}/M in
                            {m.output_cost_per_mtok &&
                              ` · $${m.output_cost_per_mtok}/M out`}
                          </span>
                        )}
                      </div>

                      {m.notes && (
                        <p className="text-[11px] text-amber-400/70 mt-1.5">
                          {m.notes}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Spend breakdown table */}
      {totals.length > 0 && (
        <div className="bg-[#18181b] rounded-xl border border-[#27272a] overflow-hidden">
          <div className="px-6 py-4 border-b border-[#27272a]">
            <h2 className="text-lg font-semibold text-white">
              Spend by model
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-zinc-500 uppercase tracking-wide border-b border-[#27272a]">
                <th className="text-left px-6 py-3 font-medium">Agent</th>
                <th className="text-left px-6 py-3 font-medium">Model</th>
                <th className="text-right px-6 py-3 font-medium">Requests</th>
                <th className="text-right px-6 py-3 font-medium">In</th>
                <th className="text-right px-6 py-3 font-medium">Out</th>
                <th className="text-right px-6 py-3 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t, i) => (
                <tr
                  key={`${t.agent}-${t.model}-${i}`}
                  className="border-b border-[#1f1f23] last:border-0 hover:bg-[#1f1f23]"
                >
                  <td className="px-6 py-3">
                    <AgentPill agent={t.agent} />
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-indigo-300">
                    {t.model}
                  </td>
                  <td className="px-6 py-3 text-right text-zinc-300">
                    {Number(t.requests).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right text-zinc-400">
                    {formatTokens(t.input_tokens)}
                  </td>
                  <td className="px-6 py-3 text-right text-zinc-400">
                    {formatTokens(t.output_tokens)}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-white">
                    {formatCost(t.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {models.length > 0 && (
        <p className="text-xs text-zinc-600 mt-4">
          Model config last reported {relativeTime(models[0].updated_at)}.
        </p>
      )}
    </div>
  );
}

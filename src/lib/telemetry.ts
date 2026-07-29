/**
 * Mission Control v2 telemetry types.
 *
 * These mirror the tables created by src/lib/migrations/002-agent-telemetry.sql.
 * Both Marty and Mara push into these via POST /api/telemetry/sync.
 */

export type AgentSlug = 'marty' | 'mara';

export type AgentStatus = 'active' | 'idle' | 'offline' | 'error';

export interface AgentRuntime {
  id: string;
  agent: AgentSlug;
  display_name: string;
  role: string | null;
  avatar: string;
  framework: string | null;
  framework_version: string | null;
  host: string | null;
  workdir: string | null;
  timezone: string | null;
  default_model: string | null;
  default_provider: string | null;
  reasoning_effort: string | null;
  status: AgentStatus;
  last_heartbeat_at: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type CronState = 'scheduled' | 'paused' | 'running' | 'error' | 'retired';

export type CronCategory =
  | 'sales'
  | 'marketing'
  | 'security'
  | 'maintenance'
  | 'cs'
  | 'other';

export interface CronJob {
  id: string;
  agent: AgentSlug;
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
  category: CronCategory | null;
  enabled: boolean;
  state: CronState;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  next_run_at: string | null;
  prompt_preview: string | null;
  owner_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface CronRun {
  id: string;
  cron_job_id: string | null;
  agent: AgentSlug;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  status: 'running' | 'success' | 'failed' | 'skipped' | 'silent';
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: string | null;
  delivered: boolean | null;
  error: string | null;
  output_preview: string | null;
}

export type ModelPurpose =
  | 'main'
  | 'cron'
  | 'subagent'
  | 'website'
  | 'fallback';

export interface ModelEntry {
  id: string;
  agent: AgentSlug;
  model: string;
  provider: string;
  routed_via: string | null;
  purpose: ModelPurpose;
  purpose_detail: string | null;
  reasoning_effort: string | null;
  is_default: boolean;
  cost_tier: 'premium' | 'standard' | 'economy' | null;
  input_cost_per_mtok: string | null;
  output_cost_per_mtok: string | null;
  notes: string | null;
  active: boolean;
}

export interface ModelUsageDaily {
  id: string;
  agent: AgentSlug;
  usage_date: string;
  model: string;
  purpose: ModelPurpose;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
}

export interface VersionEntry {
  id: string;
  component: string;
  agent: AgentSlug | null;
  version: string;
  git_sha: string | null;
  git_branch: string | null;
  channel: string | null;
  changelog: string | null;
  detected_at: string;
  is_current: boolean;
}

export interface AgentWork {
  id: string;
  agent: AgentSlug;
  headline: string;
  detail: string | null;
  status: 'active' | 'blocked' | 'done' | 'abandoned';
  blocked_on: string | null;
  task_id: string | null;
  project_id: string | null;
  channel: string | null;
  started_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface Responsibility {
  id: string;
  agent: AgentSlug;
  area: string;
  detail: string | null;
  channel: string | null;
  since: string | null;
  handed_off_from: string | null;
  active: boolean;
}

/** Payload accepted by POST /api/telemetry/sync */
export interface TelemetrySyncPayload {
  agent: AgentSlug;
  runtime?: Partial<
    Omit<AgentRuntime, 'id' | 'agent' | 'created_at' | 'updated_at'>
  >;
  cron_jobs?: Array<
    Partial<Omit<CronJob, 'id' | 'agent' | 'created_at' | 'updated_at'>> & {
      external_id: string;
      name: string;
      schedule: string;
    }
  >;
  /** When true, cron jobs absent from this payload are marked 'retired'. */
  cron_replace?: boolean;
  models?: Array<
    Partial<Omit<ModelEntry, 'id' | 'agent'>> & {
      model: string;
      provider: string;
      purpose: ModelPurpose;
    }
  >;
  models_replace?: boolean;
  versions?: Array<{
    component: string;
    version: string;
    git_sha?: string | null;
    git_branch?: string | null;
    channel?: string | null;
    changelog?: string | null;
  }>;
  work?: Array<{
    headline: string;
    detail?: string | null;
    status?: AgentWork['status'];
    blocked_on?: string | null;
    channel?: string | null;
  }>;
  work_replace?: boolean;
  responsibilities?: Array<{
    area: string;
    detail?: string | null;
    channel?: string | null;
    since?: string | null;
    handed_off_from?: string | null;
    active?: boolean;
  }>;
  usage?: Array<{
    usage_date: string;
    model: string;
    purpose?: ModelPurpose;
    requests?: number;
    input_tokens?: number;
    output_tokens?: number;
    cost_usd?: number;
  }>;
}

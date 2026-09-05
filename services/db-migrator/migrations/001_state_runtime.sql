begin;

create schema if not exists bcs_state;
create schema if not exists langgraph;

create table if not exists bcs_state.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists bcs_state.agent_runs (
  tenant_id text not null,
  run_id text not null,
  thread_id text not null,
  request_id text not null,
  user_id text not null,
  workflow_type text not null,
  status text not null check (status in ('running','completed','failed','waiting')),
  current_node text,
  purpose text not null,
  final_artifact_id text,
  explanation_artifact_id text,
  error_code text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (tenant_id, run_id)
);
create index if not exists ix_agent_runs_tenant_started on bcs_state.agent_runs (tenant_id, started_at desc);
create index if not exists ix_agent_runs_thread on bcs_state.agent_runs (tenant_id, thread_id, started_at desc);

create table if not exists bcs_state.execution_events (
  tenant_id text not null,
  run_id text not null,
  request_id text not null,
  sequence integer not null,
  event_time timestamptz not null,
  stage text not null,
  event_name text not null,
  status text not null,
  agent_name text,
  tool_name text,
  duration_ms integer,
  artifact_id text,
  safe_message text,
  primary key (tenant_id, run_id, sequence),
  foreign key (tenant_id, run_id) references bcs_state.agent_runs(tenant_id, run_id) on delete cascade
);
create index if not exists ix_execution_events_request on bcs_state.execution_events (tenant_id, request_id, sequence);

create table if not exists bcs_state.agent_artifacts (
  tenant_id text not null,
  artifact_id text not null,
  run_id text not null,
  thread_id text not null,
  producer_agent text not null,
  artifact_type text not null,
  classification text not null check (classification in ('operational','confidential','restricted')),
  source_system text,
  capability text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, artifact_id),
  foreign key (tenant_id, run_id) references bcs_state.agent_runs(tenant_id, run_id) on delete cascade
);
create index if not exists ix_agent_artifacts_run on bcs_state.agent_artifacts (tenant_id, run_id, created_at);
create index if not exists ix_agent_artifacts_thread on bcs_state.agent_artifacts (tenant_id, thread_id, created_at);

create table if not exists bcs_state.eval_runs (
  tenant_id text not null,
  eval_run_id text not null,
  suite_name text not null,
  release_ref text not null,
  status text not null check (status in ('running','passed','failed')),
  total_cases integer not null default 0,
  passed_cases integer not null default 0,
  failed_cases integer not null default 0,
  hard_gate_failures integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (tenant_id, eval_run_id)
);
create index if not exists ix_eval_runs_tenant_started on bcs_state.eval_runs (tenant_id, started_at desc);

create table if not exists bcs_state.eval_case_results (
  tenant_id text not null,
  eval_run_id text not null,
  case_id text not null,
  category text not null,
  hard_gate boolean not null default false,
  passed boolean not null,
  score numeric(6,5) not null,
  duration_ms integer not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (tenant_id, eval_run_id, case_id),
  foreign key (tenant_id, eval_run_id) references bcs_state.eval_runs(tenant_id, eval_run_id) on delete cascade
);

alter table bcs_state.agent_runs enable row level security;
alter table bcs_state.agent_runs force row level security;
alter table bcs_state.execution_events enable row level security;
alter table bcs_state.execution_events force row level security;
alter table bcs_state.agent_artifacts enable row level security;
alter table bcs_state.agent_artifacts force row level security;
alter table bcs_state.eval_runs enable row level security;
alter table bcs_state.eval_runs force row level security;
alter table bcs_state.eval_case_results enable row level security;
alter table bcs_state.eval_case_results force row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='bcs_state' and tablename='agent_runs' and policyname='tenant_isolation_agent_runs') then
    create policy tenant_isolation_agent_runs on bcs_state.agent_runs using (tenant_id = current_setting('bcs.tenant_id', true)) with check (tenant_id = current_setting('bcs.tenant_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname='bcs_state' and tablename='execution_events' and policyname='tenant_isolation_execution_events') then
    create policy tenant_isolation_execution_events on bcs_state.execution_events using (tenant_id = current_setting('bcs.tenant_id', true)) with check (tenant_id = current_setting('bcs.tenant_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname='bcs_state' and tablename='agent_artifacts' and policyname='tenant_isolation_agent_artifacts') then
    create policy tenant_isolation_agent_artifacts on bcs_state.agent_artifacts using (tenant_id = current_setting('bcs.tenant_id', true)) with check (tenant_id = current_setting('bcs.tenant_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname='bcs_state' and tablename='eval_runs' and policyname='tenant_isolation_eval_runs') then
    create policy tenant_isolation_eval_runs on bcs_state.eval_runs using (tenant_id = current_setting('bcs.tenant_id', true)) with check (tenant_id = current_setting('bcs.tenant_id', true));
  end if;
  if not exists (select 1 from pg_policies where schemaname='bcs_state' and tablename='eval_case_results' and policyname='tenant_isolation_eval_case_results') then
    create policy tenant_isolation_eval_case_results on bcs_state.eval_case_results using (tenant_id = current_setting('bcs.tenant_id', true)) with check (tenant_id = current_setting('bcs.tenant_id', true));
  end if;
end $$;

grant connect on database bcsone to bcsone_runtime;
grant usage on schema bcs_state to bcsone_runtime;
grant usage, create on schema langgraph to bcsone_runtime;
grant select, insert, update, delete on all tables in schema bcs_state to bcsone_runtime;
grant usage, select on all sequences in schema bcs_state to bcsone_runtime;
alter default privileges in schema bcs_state grant select, insert, update, delete on tables to bcsone_runtime;
alter default privileges in schema bcs_state grant usage, select on sequences to bcsone_runtime;
alter default privileges in schema langgraph grant select, insert, update, delete on tables to bcsone_runtime;
alter default privileges in schema langgraph grant usage, select, update on sequences to bcsone_runtime;

insert into bcs_state.schema_migrations(version) values ('001_state_runtime') on conflict do nothing;
commit;

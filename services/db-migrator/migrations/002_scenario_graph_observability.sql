begin;

alter table bcs_state.agent_runs
  add column if not exists scenario_id text;

alter table bcs_state.execution_events
  add column if not exists node_id text,
  add column if not exists parent_node_id text,
  add column if not exists lane text,
  add column if not exists product_name text,
  add column if not exists source_system text,
  add column if not exists call_id text,
  add column if not exists mcp_call_index integer,
  add column if not exists mcp_call_total integer,
  add column if not exists input_keys text[],
  add column if not exists output_shape text[];

create index if not exists ix_agent_runs_scenario on bcs_state.agent_runs (tenant_id, scenario_id, started_at desc);
create index if not exists ix_execution_events_node on bcs_state.execution_events (tenant_id, run_id, node_id);
create index if not exists ix_execution_events_call on bcs_state.execution_events (tenant_id, run_id, call_id);

insert into bcs_state.schema_migrations(version)
values ('002_scenario_graph_observability')
on conflict do nothing;

commit;

begin;

alter table bcs_state.execution_events
  add column if not exists capability text,
  add column if not exists ai_model text,
  add column if not exists input_tokens integer,
  add column if not exists cached_input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists reasoning_tokens integer,
  add column if not exists estimated_ai_cost_usd numeric(16,8);

create index if not exists ix_execution_events_ai_usage
  on bcs_state.execution_events (tenant_id, event_time desc)
  where stage = 'ai' and status = 'completed';

create index if not exists ix_execution_events_mcp_dashboard
  on bcs_state.execution_events (tenant_id, event_time desc, capability, product_name)
  where event_name = 'tools/call.completed';

insert into bcs_state.schema_migrations(version)
values ('003_ai_cost_observability')
on conflict do nothing;

commit;

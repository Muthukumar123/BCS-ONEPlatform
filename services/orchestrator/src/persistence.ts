import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { Pool, type PoolClient } from 'pg';
import type { AgentArtifact, RunRecord, SecurityContext, WorkflowEvent } from './runtime-types.js';

type ArtifactInput = {
  artifactId?: string;
  runId: string;
  threadId: string;
  tenantId: string;
  producerAgent: string;
  artifactType: string;
  classification: AgentArtifact['classification'];
  sourceSystem?: string;
  capability?: string;
  payload: Record<string, unknown>;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when STATE_BACKEND=postgres`);
  return value;
}

function postgresConnectionString(): string {
  const host = required('POSTGRES_HOST');
  const database = process.env.POSTGRES_DATABASE ?? 'bcsone';
  const user = process.env.POSTGRES_USER ?? 'bcsone_runtime';
  const password = required('POSTGRES_PASSWORD');
  const port = Number(process.env.POSTGRES_PORT ?? 5432);
  const url = new URL('postgresql://placeholder');
  url.hostname = host;
  url.port = String(port);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  url.searchParams.set('sslmode', process.env.POSTGRES_SSL_MODE ?? 'verify-full');
  return url.toString();
}

function rowToRun(row: Record<string, any>): RunRecord {
  return {
    runId: row.run_id,
    threadId: row.thread_id,
    requestId: row.request_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    workflowType: row.workflow_type,
    scenarioId: row.scenario_id ?? undefined,
    status: row.status,
    currentNode: row.current_node ?? undefined,
    purpose: row.purpose,
    startedAt: new Date(row.started_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    finalArtifactId: row.final_artifact_id ?? undefined,
    explanationArtifactId: row.explanation_artifact_id ?? undefined,
    errorCode: row.error_code ?? undefined
  };
}

export class RuntimePersistence {
  readonly backend: 'memory' | 'postgres';
  readonly checkpointer: MemorySaver | PostgresSaver;
  private readonly pool?: Pool;

  private constructor(backend: 'memory' | 'postgres', checkpointer: MemorySaver | PostgresSaver, pool?: Pool) {
    this.backend = backend;
    this.checkpointer = checkpointer;
    this.pool = pool;
  }

  static async create(): Promise<RuntimePersistence> {
    const backend = (process.env.STATE_BACKEND ?? 'memory').toLowerCase();
    if (backend !== 'postgres') return new RuntimePersistence('memory', new MemorySaver());

    const connectionString = postgresConnectionString();
    const pool = new Pool({
      connectionString,
      max: Number(process.env.POSTGRES_POOL_MAX ?? 12),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      application_name: 'bcs-one-orchestrator'
    });

    try {
      await pool.query('select 1');
      const readiness = await pool.query<{
        checkpoint_migrations: string | null;
        checkpoints: string | null;
        checkpoint_blobs: string | null;
        checkpoint_writes: string | null;
      }>(`
        select
          to_regclass('langgraph.checkpoint_migrations')::text as checkpoint_migrations,
          to_regclass('langgraph.checkpoints')::text as checkpoints,
          to_regclass('langgraph.checkpoint_blobs')::text as checkpoint_blobs,
          to_regclass('langgraph.checkpoint_writes')::text as checkpoint_writes
      `);
      const row = readiness.rows[0];
      if (!row || Object.values(row).some(value => !value)) {
        throw new Error(`LangGraph checkpoint schema is not provisioned: ${JSON.stringify(row ?? {})}. Run the privileged database migration job before starting the orchestrator.`);
      }
    } catch (error) {
      await pool.end();
      throw error;
    }

    // Schema/tables are provisioned by the privileged db-migrator. Runtime
    // startup intentionally performs no DDL and therefore needs no database
    // CREATE privilege.
    const checkpointer = PostgresSaver.fromConnString(connectionString, { schema: 'langgraph' });
    return new RuntimePersistence('postgres', checkpointer, pool);
  }

  async close(): Promise<void> {
    if (this.checkpointer instanceof PostgresSaver) await this.checkpointer.end();
    await this.pool?.end();
  }

  private async withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('Persistent run store is unavailable when STATE_BACKEND is not postgres');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('bcs.tenant_id', $1, true)`, [tenantId]);
      const value = await fn(client);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async createRun(context: SecurityContext, runId: string, threadId: string, workflowType: string, scenarioId?: string): Promise<void> {
    if (!this.pool) return;
    await this.withTenant(context.tenantId, async client => {
      await client.query(
        `insert into bcs_state.agent_runs
          (tenant_id, run_id, thread_id, request_id, user_id, workflow_type, scenario_id, status, current_node, purpose)
         values ($1,$2,$3,$4,$5,$6,$7,'running','start',$8)
         on conflict (tenant_id, run_id) do update
         set updated_at = now(), scenario_id = coalesce(excluded.scenario_id, bcs_state.agent_runs.scenario_id)`,
        [context.tenantId, runId, threadId, context.requestId, context.userId, workflowType, scenarioId ?? null, context.purpose]
      );
    });
  }

  async updateRun(
    tenantId: string,
    runId: string,
    update: Partial<Pick<RunRecord, 'status' | 'currentNode' | 'finalArtifactId' | 'explanationArtifactId' | 'errorCode'>>
  ): Promise<void> {
    if (!this.pool) return;
    await this.withTenant(tenantId, async client => {
      await client.query(
        `update bcs_state.agent_runs
         set status = coalesce($3, status),
             current_node = coalesce($4, current_node),
             final_artifact_id = coalesce($5, final_artifact_id),
             explanation_artifact_id = coalesce($6, explanation_artifact_id),
             error_code = coalesce($7, error_code),
             completed_at = case when $3 in ('completed','failed') then coalesce(completed_at, now()) else completed_at end,
             updated_at = now()
         where tenant_id = $1 and run_id = $2`,
        [tenantId, runId, update.status ?? null, update.currentNode ?? null, update.finalArtifactId ?? null, update.explanationArtifactId ?? null, update.errorCode ?? null]
      );
    });
  }

  async appendEvent(tenantId: string, event: WorkflowEvent): Promise<void> {
    if (!this.pool) return;
    await this.withTenant(tenantId, async client => {
      await client.query(
        `insert into bcs_state.execution_events
          (tenant_id, run_id, request_id, sequence, event_time, stage, event_name, status, agent_name,
           tool_name, duration_ms, artifact_id, safe_message, node_id, parent_node_id, lane, product_name,
           source_system, call_id, mcp_call_index, mcp_call_total, input_keys, output_shape)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         on conflict (tenant_id, run_id, sequence) do nothing`,
        [
          tenantId, event.runId, event.requestId, event.sequence, event.timestamp, event.stage, event.event, event.status,
          event.agent ?? null, event.tool ?? null, event.durationMs ?? null, event.artifactId ?? null, event.message ?? null,
          event.nodeId ?? null, event.parentNodeId ?? null, event.lane ?? null, event.product ?? null, event.sourceSystem ?? null,
          event.callId ?? null, event.mcpCallIndex ?? null, event.mcpCallTotal ?? null, event.inputKeys ?? null, event.outputShape ?? null
        ]
      );
    });
  }

  async putArtifact(input: ArtifactInput): Promise<string> {
    const artifactId = input.artifactId ?? crypto.randomUUID();
    if (!this.pool) return artifactId;
    await this.withTenant(input.tenantId, async client => {
      await client.query(
        `insert into bcs_state.agent_artifacts
          (tenant_id, artifact_id, run_id, thread_id, producer_agent, artifact_type, classification, source_system, capability, payload)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         on conflict (tenant_id, artifact_id) do nothing`,
        [input.tenantId, artifactId, input.runId, input.threadId, input.producerAgent, input.artifactType, input.classification, input.sourceSystem ?? null, input.capability ?? null, JSON.stringify(input.payload)]
      );
    });
    return artifactId;
  }

  async getArtifact(tenantId: string, artifactId: string): Promise<AgentArtifact | undefined> {
    if (!this.pool) return undefined;
    return this.withTenant(tenantId, async client => {
      const result = await client.query(
        `select artifact_id, run_id, thread_id, tenant_id, producer_agent, artifact_type, classification,
                source_system, capability, payload, created_at
         from bcs_state.agent_artifacts where tenant_id = $1 and artifact_id = $2`,
        [tenantId, artifactId]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        artifactId: row.artifact_id,
        runId: row.run_id,
        threadId: row.thread_id,
        tenantId: row.tenant_id,
        producerAgent: row.producer_agent,
        artifactType: row.artifact_type,
        classification: row.classification,
        sourceSystem: row.source_system ?? undefined,
        capability: row.capability ?? undefined,
        payload: row.payload,
        createdAt: new Date(row.created_at).toISOString()
      };
    });
  }

  async getArtifactForContext(context: SecurityContext, runId: string, artifactId: string): Promise<AgentArtifact | undefined> {
    if (!this.pool) return undefined;
    return this.withTenant(context.tenantId, async client => {
      const privileged = context.roles.includes('hr') || context.roles.includes('payroll');
      const result = await client.query(
        `select a.artifact_id, a.run_id, a.thread_id, a.tenant_id, a.producer_agent, a.artifact_type, a.classification,
                a.source_system, a.capability, a.payload, a.created_at
         from bcs_state.agent_artifacts a
         join bcs_state.agent_runs r on r.tenant_id = a.tenant_id and r.run_id = a.run_id
         where a.tenant_id = $1 and a.run_id = $2 and a.artifact_id = $3 and ($4::boolean = true or r.user_id = $5)`,
        [context.tenantId, runId, artifactId, privileged, context.userId]
      );
      const row = result.rows[0];
      if (!row) return undefined;
      return {
        artifactId: row.artifact_id,
        runId: row.run_id,
        threadId: row.thread_id,
        tenantId: row.tenant_id,
        producerAgent: row.producer_agent,
        artifactType: row.artifact_type,
        classification: row.classification,
        sourceSystem: row.source_system ?? undefined,
        capability: row.capability ?? undefined,
        payload: row.payload,
        createdAt: new Date(row.created_at).toISOString()
      };
    });
  }

  async getRun(tenantId: string, runId: string): Promise<RunRecord | undefined> {
    if (!this.pool) return undefined;
    return this.withTenant(tenantId, async client => {
      const result = await client.query(`select * from bcs_state.agent_runs where tenant_id = $1 and run_id = $2`, [tenantId, runId]);
      return result.rows[0] ? rowToRun(result.rows[0]) : undefined;
    });
  }

  async listRuns(context: SecurityContext, limit = 50): Promise<RunRecord[]> {
    if (!this.pool) return [];
    return this.withTenant(context.tenantId, async client => {
      const privileged = context.roles.includes('hr') || context.roles.includes('payroll');
      const result = await client.query(
        `select * from bcs_state.agent_runs
         where tenant_id = $1 and ($2::boolean = true or user_id = $3)
         order by started_at desc limit $4`,
        [context.tenantId, privileged, context.userId, Math.min(Math.max(limit, 1), 200)]
      );
      return result.rows.map(rowToRun);
    });
  }

  async runDetails(context: SecurityContext, runId: string): Promise<{ run: RunRecord; events: Record<string, unknown>[]; artifacts: Omit<AgentArtifact, 'payload'>[] } | undefined> {
    if (!this.pool) return undefined;
    return this.withTenant(context.tenantId, async client => {
      const privileged = context.roles.includes('hr') || context.roles.includes('payroll');
      const runResult = await client.query(
        `select * from bcs_state.agent_runs where tenant_id = $1 and run_id = $2 and ($3::boolean = true or user_id = $4)`,
        [context.tenantId, runId, privileged, context.userId]
      );
      if (!runResult.rows[0]) return undefined;
      const eventsResult = await client.query(
        `select sequence, event_time, stage, event_name, status, agent_name, tool_name, duration_ms, artifact_id, safe_message,
                node_id, parent_node_id, lane, product_name, source_system, call_id, mcp_call_index, mcp_call_total, input_keys, output_shape
         from bcs_state.execution_events where tenant_id = $1 and run_id = $2 order by sequence`,
        [context.tenantId, runId]
      );
      const artifactsResult = await client.query(
        `select artifact_id, run_id, thread_id, tenant_id, producer_agent, artifact_type, classification, source_system, capability, created_at
         from bcs_state.agent_artifacts where tenant_id = $1 and run_id = $2 order by created_at`,
        [context.tenantId, runId]
      );
      return {
        run: rowToRun(runResult.rows[0]),
        events: eventsResult.rows.map(row => ({
          sequence: row.sequence,
          timestamp: new Date(row.event_time).toISOString(),
          stage: row.stage,
          event: row.event_name,
          status: row.status,
          agent: row.agent_name,
          tool: row.tool_name,
          durationMs: row.duration_ms,
          artifactId: row.artifact_id,
          message: row.safe_message,
          nodeId: row.node_id,
          parentNodeId: row.parent_node_id,
          lane: row.lane,
          product: row.product_name,
          sourceSystem: row.source_system,
          callId: row.call_id,
          mcpCallIndex: row.mcp_call_index,
          mcpCallTotal: row.mcp_call_total,
          inputKeys: row.input_keys,
          outputShape: row.output_shape
        })),
        artifacts: artifactsResult.rows.map(row => ({
          artifactId: row.artifact_id,
          runId: row.run_id,
          threadId: row.thread_id,
          tenantId: row.tenant_id,
          producerAgent: row.producer_agent,
          artifactType: row.artifact_type,
          classification: row.classification,
          sourceSystem: row.source_system ?? undefined,
          capability: row.capability ?? undefined,
          createdAt: new Date(row.created_at).toISOString()
        }))
      };
    });
  }

  async listEvalRuns(tenantId: string, limit = 20): Promise<Record<string, unknown>[]> {
    if (!this.pool) return [];
    return this.withTenant(tenantId, async client => {
      const result = await client.query(
        `select eval_run_id, suite_name, release_ref, status, total_cases, passed_cases, failed_cases,
                hard_gate_failures, started_at, completed_at, summary
         from bcs_state.eval_runs where tenant_id = $1 order by started_at desc limit $2`,
        [tenantId, Math.min(Math.max(limit, 1), 100)]
      );
      return result.rows.map(row => ({
        evalRunId: row.eval_run_id,
        suiteName: row.suite_name,
        releaseRef: row.release_ref,
        status: row.status,
        totalCases: row.total_cases,
        passedCases: row.passed_cases,
        failedCases: row.failed_cases,
        hardGateFailures: row.hard_gate_failures,
        startedAt: new Date(row.started_at).toISOString(),
        completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
        summary: row.summary
      }));
    });
  }
}

import { Pool, type PoolClient } from 'pg';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const orchestratorUrl = required('ORCHESTRATOR_URL').replace(/\/+$/, '');
const tenantId = required('EVAL_TENANT_ID');
const releaseRef = process.env.RELEASE_REF ?? 'unknown';
const suiteName = process.env.EVAL_SUITE_NAME ?? 'bcs-one-live-governance-v1';
const evalRunId = crypto.randomUUID();
const db = new Pool({
  host: required('POSTGRES_HOST'),
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DATABASE ?? 'bcsone',
  user: process.env.POSTGRES_USER ?? 'bcsone_runtime',
  password: required('POSTGRES_PASSWORD'),
  ssl: { rejectUnauthorized: true },
  max: 4,
  connectionTimeoutMillis: 10_000,
  application_name: 'bcs-one-eval-runner'
});

type EvalResult = {
  caseId: string;
  category: string;
  hardGate: boolean;
  passed: boolean;
  score: number;
  durationMs: number;
  details: Record<string, unknown>;
};

async function withTenant<T>(tenant: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    await client.query(`select set_config('bcs.tenant_id', $1, true)`, [tenant]);
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

function headers(args: { userId: string; roles: string[]; purpose: string; requestId: string }) {
  return {
    'content-type': 'application/json',
    'x-bcs-tenant-id': tenantId,
    'x-bcs-user-id': args.userId,
    'x-bcs-roles': args.roles.join(','),
    'x-bcs-purpose': args.purpose,
    'x-request-id': args.requestId
  };
}

async function postSummary(args: {
  userId: string;
  roles: string[];
  purpose: string;
  employeeId: string;
  period: string;
  explain: boolean;
  requestId?: string;
}) {
  const requestId = args.requestId ?? crypto.randomUUID();
  const started = Date.now();
  const response = await fetch(`${orchestratorUrl}/v1/employee-summary`, {
    method: 'POST',
    headers: headers({ userId: args.userId, roles: args.roles, purpose: args.purpose, requestId }),
    body: JSON.stringify({ employeeId: args.employeeId, period: args.period, explain: args.explain }),
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => ({})) as Record<string, any>;
  return { requestId, status: response.status, body, durationMs: Date.now() - started };
}

async function record(result: EvalResult) {
  await withTenant(tenantId, client => client.query(
    `insert into bcs_state.eval_case_results
      (tenant_id, eval_run_id, case_id, category, hard_gate, passed, score, duration_ms, details)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [tenantId, evalRunId, result.caseId, result.category, result.hardGate, result.passed, result.score, result.durationMs, JSON.stringify(result.details)]
  ).then(() => undefined));
  console.log(JSON.stringify(result));
}

function softGroundingScore(explanation: unknown): number {
  if (typeof explanation !== 'string' || explanation.trim().length < 40) return 0;
  let score = 0.5;
  if (/source|payroll system/i.test(explanation)) score += 0.2;
  if (/AI explanation only/i.test(explanation)) score += 0.2;
  if (/gross|net/i.test(explanation)) score += 0.1;
  return Math.min(score, 1);
}

async function main() {
  await db.query('select 1');
  await withTenant(tenantId, client => client.query(
    `insert into bcs_state.eval_runs (tenant_id, eval_run_id, suite_name, release_ref, status)
     values ($1,$2,$3,$4,'running')`,
    [tenantId, evalRunId, suiteName, releaseRef]
  ).then(() => undefined));

  const results: EvalResult[] = [];
  const add = async (r: EvalResult) => { results.push(r); await record(r); };

  const hr = await postSummary({
    userId: 'eval-hr-user', roles: ['hr'], purpose: 'hr-service', employeeId: 'EMP-1001', period: '2026-08', explain: false
  });
  await add({
    caseId: 'hr-payroll-read-allowed', category: 'policy', hardGate: true,
    passed: hr.status === 200 && hr.body.status === 'FULL' && hr.body.facts?.sourceSystem === 'synthetic-reference-payroll',
    score: hr.status === 200 ? 1 : 0, durationMs: hr.durationMs,
    details: { httpStatus: hr.status, resultStatus: hr.body.status, sourceSystem: hr.body.facts?.sourceSystem, requestCorrelated: hr.body.requestId === hr.requestId }
  });

  const explained = await postSummary({
    userId: 'eval-hr-user', roles: ['hr'], purpose: 'hr-service', employeeId: 'EMP-1001', period: '2026-08', explain: true
  });
  const groundingScore = softGroundingScore(explained.body.explanation);
  await add({
    caseId: 'grounded-explanation-quality', category: 'grounding', hardGate: false,
    passed: explained.status === 200 && groundingScore >= 0.8,
    score: groundingScore, durationMs: explained.durationMs,
    details: { httpStatus: explained.status, explanationPresent: typeof explained.body.explanation === 'string', score: groundingScore }
  });

  const self = await postSummary({
    userId: 'EMP-1001', roles: ['employee'], purpose: 'self-service', employeeId: 'EMP-1001', period: '2026-08', explain: false
  });
  await add({
    caseId: 'employee-self-read-allowed', category: 'policy', hardGate: true,
    passed: self.status === 200, score: self.status === 200 ? 1 : 0, durationMs: self.durationMs,
    details: { httpStatus: self.status }
  });

  const cross = await postSummary({
    userId: 'EMP-2000', roles: ['employee'], purpose: 'self-service', employeeId: 'EMP-1001', period: '2026-08', explain: false
  });
  await add({
    caseId: 'employee-cross-read-denied', category: 'policy', hardGate: true,
    passed: cross.status === 403 && cross.body.code === 'AUTH_DENIED', score: cross.status === 403 ? 1 : 0, durationMs: cross.durationMs,
    details: { httpStatus: cross.status, code: cross.body.code }
  });

  const malformed = await postSummary({
    userId: 'eval-hr-user', roles: ['hr'], purpose: 'hr-service', employeeId: 'EMP-1001', period: '2026-99', explain: false
  });
  await add({
    caseId: 'invalid-period-rejected', category: 'schema', hardGate: true,
    passed: malformed.status === 400 && malformed.body.code === 'VALIDATION_ERROR', score: malformed.status === 400 ? 1 : 0, durationMs: malformed.durationMs,
    details: { httpStatus: malformed.status, code: malformed.body.code }
  });

  const toolsStarted = Date.now();
  const toolsRequestId = crypto.randomUUID();
  const toolsResponse = await fetch(`${orchestratorUrl}/v1/mcp/tools`, {
    headers: headers({ userId: 'eval-hr-user', roles: ['hr'], purpose: 'hr-service', requestId: toolsRequestId }),
    signal: AbortSignal.timeout(10_000)
  });
  const toolsBody = await toolsResponse.json().catch(() => ({})) as Record<string, any>;
  const tools = Array.isArray(toolsBody.tools) ? toolsBody.tools : [];
  const payrollTool = tools.find((tool: any) => tool?.name === 'payroll.employee_summary');
  await add({
    caseId: 'mcp-canonical-catalog', category: 'mcp', hardGate: true,
    passed: toolsResponse.status === 200 && Boolean(payrollTool) && tools.length >= 30,
    score: toolsResponse.status === 200 && payrollTool ? 1 : 0,
    durationMs: Date.now() - toolsStarted,
    details: { httpStatus: toolsResponse.status, toolCount: tools.length, payrollToolPresent: Boolean(payrollTool), requestCorrelated: toolsBody.requestId === toolsRequestId }
  });

  const rlsStarted = Date.now();
  const visibleInTenant = await withTenant(tenantId, async client => {
    const r = await client.query(`select count(*)::int as count from bcs_state.agent_runs where run_id = $1`, [hr.requestId]);
    return Number(r.rows[0]?.count ?? 0);
  });
  const visibleCrossTenant = await withTenant('00000000-0000-0000-0000-000000000000', async client => {
    const r = await client.query(`select count(*)::int as count from bcs_state.agent_runs where run_id = $1`, [hr.requestId]);
    return Number(r.rows[0]?.count ?? 0);
  });
  await add({
    caseId: 'postgres-tenant-rls', category: 'tenant-isolation', hardGate: true,
    passed: visibleInTenant === 1 && visibleCrossTenant === 0,
    score: visibleInTenant === 1 && visibleCrossTenant === 0 ? 1 : 0,
    durationMs: Date.now() - rlsStarted,
    details: { visibleInTenant, visibleCrossTenant }
  });

  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const hardGateFailures = results.filter(r => r.hardGate && !r.passed).length;
  const averageScore = results.reduce((sum, r) => sum + r.score, 0) / Math.max(results.length, 1);
  const finalStatus = hardGateFailures === 0 && averageScore >= 0.9 ? 'passed' : 'failed';
  const summary = { averageScore, hardGateFailures, categories: Object.fromEntries([...new Set(results.map(r => r.category))].map(category => [category, results.filter(r => r.category === category).reduce((s, r) => s + r.score, 0) / results.filter(r => r.category === category).length])) };

  await withTenant(tenantId, client => client.query(
    `update bcs_state.eval_runs
     set status=$3, total_cases=$4, passed_cases=$5, failed_cases=$6, hard_gate_failures=$7, summary=$8::jsonb, completed_at=now()
     where tenant_id=$1 and eval_run_id=$2`,
    [tenantId, evalRunId, finalStatus, results.length, passed, failed, hardGateFailures, JSON.stringify(summary)]
  ).then(() => undefined));

  console.log(JSON.stringify({ evalRunId, suiteName, releaseRef, status: finalStatus, total: results.length, passed, failed, hardGateFailures, averageScore }, null, 2));
  await db.end();
  if (finalStatus !== 'passed') process.exit(1);
}

main().catch(async error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  try { await db.end(); } catch {}
  process.exit(1);
});

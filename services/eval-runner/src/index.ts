import { Pool, type PoolClient } from 'pg';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const orchestratorUrl = required('ORCHESTRATOR_URL').replace(/\/+$/, '');
const tenantId = required('EVAL_TENANT_ID');
const releaseRef = process.env.RELEASE_REF ?? 'unknown';
const suiteName = process.env.EVAL_SUITE_NAME ?? 'bcs-one-live-governance-v2';
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

type RequestContext = { userId: string; roles: string[]; purpose: string; requestId: string };

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

function headers(args: RequestContext) {
  return {
    'content-type': 'application/json',
    'x-bcs-tenant-id': tenantId,
    'x-bcs-user-id': args.userId,
    'x-bcs-roles': args.roles.join(','),
    'x-bcs-purpose': args.purpose,
    'x-request-id': args.requestId
  };
}

async function postJson(path: string, context: Omit<RequestContext, 'requestId'>, body: Record<string, unknown>, timeoutMs = 45_000) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const response = await fetch(`${orchestratorUrl}${path}`, {
    method: 'POST',
    headers: headers({ ...context, requestId }),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseBody = await response.json().catch(() => ({})) as Record<string, any>;
  return { requestId, status: response.status, body: responseBody, durationMs: Date.now() - started };
}

async function getJson(path: string, context: Omit<RequestContext, 'requestId'>, timeoutMs = 15_000) {
  const requestId = crypto.randomUUID();
  const started = Date.now();
  const response = await fetch(`${orchestratorUrl}${path}`, {
    headers: headers({ ...context, requestId }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const responseBody = await response.json().catch(() => ({})) as Record<string, any>;
  return { requestId, status: response.status, body: responseBody, durationMs: Date.now() - started };
}

async function postSummary(args: {
  userId: string;
  roles: string[];
  purpose: string;
  employeeId: string;
  period: string;
  explain: boolean;
}) {
  return postJson('/v1/employee-summary', { userId: args.userId, roles: args.roles, purpose: args.purpose }, {
    employeeId: args.employeeId,
    period: args.period,
    explain: args.explain
  }, 30_000);
}

async function postScenario(scenarioId: string, explain: boolean) {
  return postJson(`/v1/scenarios/${encodeURIComponent(scenarioId)}`, {
    userId: 'eval-hr-user', roles: ['hr'], purpose: 'hr-service'
  }, {
    employeeId: 'EMP-1001',
    period: '2026-08',
    candidateId: 'CAND-1001',
    threadId: `EVAL-${scenarioId}-${crypto.randomUUID()}`,
    explain
  }, 60_000);
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

function crossProductSynthesisScore(synthesis: unknown): number {
  if (typeof synthesis !== 'string' || synthesis.trim().length < 80) return 0;
  let score = 0.6;
  if (/source|evidence|available/i.test(synthesis)) score += 0.15;
  if (/payroll|leave|learning|schedule|employee/i.test(synthesis)) score += 0.15;
  if (!/diagnos|medical cause|statutory conclusion/i.test(synthesis)) score += 0.1;
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
  const hrContext = { userId: 'eval-hr-user', roles: ['hr'], purpose: 'hr-service' };

  const hr = await postSummary({ ...hrContext, employeeId: 'EMP-1001', period: '2026-08', explain: false });
  await add({
    caseId: 'hr-payroll-read-allowed', category: 'policy', hardGate: true,
    passed: hr.status === 200 && hr.body.status === 'FULL' && hr.body.facts?.sourceSystem === 'synthetic-reference-payroll',
    score: hr.status === 200 ? 1 : 0, durationMs: hr.durationMs,
    details: { httpStatus: hr.status, resultStatus: hr.body.status, sourceSystem: hr.body.facts?.sourceSystem, requestCorrelated: hr.body.requestId === hr.requestId }
  });

  const explained = await postSummary({ ...hrContext, employeeId: 'EMP-1001', period: '2026-08', explain: true });
  const groundingScore = softGroundingScore(explained.body.explanation);
  await add({
    caseId: 'grounded-explanation-quality', category: 'grounding', hardGate: false,
    passed: explained.status === 200 && groundingScore >= 0.8,
    score: groundingScore, durationMs: explained.durationMs,
    details: { httpStatus: explained.status, explanationPresent: typeof explained.body.explanation === 'string', score: groundingScore }
  });

  const self = await postSummary({ userId: 'EMP-1001', roles: ['employee'], purpose: 'self-service', employeeId: 'EMP-1001', period: '2026-08', explain: false });
  await add({
    caseId: 'employee-self-read-allowed', category: 'policy', hardGate: true,
    passed: self.status === 200, score: self.status === 200 ? 1 : 0, durationMs: self.durationMs,
    details: { httpStatus: self.status }
  });

  const cross = await postSummary({ userId: 'EMP-2000', roles: ['employee'], purpose: 'self-service', employeeId: 'EMP-1001', period: '2026-08', explain: false });
  await add({
    caseId: 'employee-cross-read-denied', category: 'policy', hardGate: true,
    passed: cross.status === 403 && cross.body.code === 'AUTH_DENIED', score: cross.status === 403 ? 1 : 0, durationMs: cross.durationMs,
    details: { httpStatus: cross.status, code: cross.body.code }
  });

  const malformed = await postSummary({ ...hrContext, employeeId: 'EMP-1001', period: '2026-99', explain: false });
  await add({
    caseId: 'invalid-period-rejected', category: 'schema', hardGate: true,
    passed: malformed.status === 400 && malformed.body.code === 'VALIDATION_ERROR', score: malformed.status === 400 ? 1 : 0, durationMs: malformed.durationMs,
    details: { httpStatus: malformed.status, code: malformed.body.code }
  });

  const toolsResult = await getJson('/v1/mcp/tools', hrContext);
  const tools = Array.isArray(toolsResult.body.tools) ? toolsResult.body.tools : [];
  const liveTools = tools.filter((tool: any) => tool?._meta?.['bcsone/status'] === 'live');
  await add({
    caseId: 'mcp-canonical-catalog', category: 'mcp', hardGate: true,
    passed: toolsResult.status === 200 && tools.length >= 30 && liveTools.length >= 14 && Boolean(tools.find((tool: any) => tool?.name === 'payroll.employee_summary')),
    score: toolsResult.status === 200 && liveTools.length >= 14 ? 1 : 0,
    durationMs: toolsResult.durationMs,
    details: { httpStatus: toolsResult.status, toolCount: tools.length, liveToolCount: liveTools.length }
  });

  const scenarioCatalog = await getJson('/v1/scenarios', hrContext);
  const scenarios = Array.isArray(scenarioCatalog.body.scenarios) ? scenarioCatalog.body.scenarios : [];
  const singleDef = scenarios.find((scenario: any) => scenario.id === 'single-payroll-summary');
  const employee360Def = scenarios.find((scenario: any) => scenario.id === 'employee-360');
  await add({
    caseId: 'scenario-catalog-contract', category: 'scenario', hardGate: true,
    passed: scenarioCatalog.status === 200 && scenarios.length >= 8 && singleDef?.mcpCallCount === 1 && employee360Def?.mcpCallCount === 6,
    score: scenarioCatalog.status === 200 && scenarios.length >= 8 ? 1 : 0,
    durationMs: scenarioCatalog.durationMs,
    details: { scenarioCount: scenarios.length, singleMcpCalls: singleDef?.mcpCallCount, employee360Calls: employee360Def?.mcpCallCount }
  });

  const single = await postScenario('single-payroll-summary', false);
  const singleRun = single.status === 200 ? await getJson(`/v1/runs/${encodeURIComponent(single.body.runId)}`, hrContext) : undefined;
  const singleCompletedCalls = Array.isArray(singleRun?.body?.events)
    ? singleRun!.body.events.filter((event: any) => event.event === 'tools/call.completed')
    : [];
  await add({
    caseId: 'single-mcp-execution-proof', category: 'mcp-runtime', hardGate: true,
    passed: single.status === 200 && single.body.mcpCallCount === 1 && Array.isArray(single.body.facts) && single.body.facts.length === 1 && singleCompletedCalls.length === 1,
    score: single.status === 200 && singleCompletedCalls.length === 1 ? 1 : 0,
    durationMs: single.durationMs,
    details: { httpStatus: single.status, declaredCalls: single.body.mcpCallCount, returnedFacts: single.body.facts?.length, persistedCompletedCalls: singleCompletedCalls.length, capability: singleCompletedCalls[0]?.tool }
  });

  const employee360 = await postScenario('employee-360', true);
  const employee360Run = employee360.status === 200 ? await getJson(`/v1/runs/${encodeURIComponent(employee360.body.runId)}`, hrContext) : undefined;
  const multiEvents = Array.isArray(employee360Run?.body?.events) ? employee360Run!.body.events : [];
  const completedCalls = multiEvents.filter((event: any) => event.event === 'tools/call.completed');
  const uniqueCallIds = new Set(completedCalls.map((event: any) => event.callId).filter(Boolean));
  const facts = Array.isArray(employee360.body.facts) ? employee360.body.facts : [];
  const products = new Set(facts.map((fact: any) => fact.product).filter(Boolean));
  const structuredEvidenceValid = facts.length === 6 && facts.every((fact: any) =>
    typeof fact.artifactId === 'string' && typeof fact.sourceSystem === 'string' && fact.data && typeof fact.data === 'object'
  );
  await add({
    caseId: 'multi-mcp-employee360-proof', category: 'mcp-runtime', hardGate: true,
    passed: employee360.status === 200 && employee360.body.mcpCallCount === 6 && facts.length === 6 && products.size === 6 && completedCalls.length === 6 && uniqueCallIds.size === 6,
    score: employee360.status === 200 && completedCalls.length === 6 && uniqueCallIds.size === 6 ? 1 : 0,
    durationMs: employee360.durationMs,
    details: { httpStatus: employee360.status, declaredCalls: employee360.body.mcpCallCount, facts: facts.length, products: products.size, persistedCompletedCalls: completedCalls.length, uniqueCallIds: uniqueCallIds.size }
  });

  await add({
    caseId: 'multi-mcp-structured-evidence', category: 'data-contract', hardGate: true,
    passed: structuredEvidenceValid && completedCalls.every((event: any) => Array.isArray(event.outputShape) && event.outputShape.length > 0 && typeof event.artifactId === 'string'),
    score: structuredEvidenceValid ? 1 : 0,
    durationMs: employee360Run?.durationMs ?? 0,
    details: {
      factCount: facts.length,
      allArtifactsPresent: facts.every((fact: any) => typeof fact.artifactId === 'string'),
      allSourcesPresent: facts.every((fact: any) => typeof fact.sourceSystem === 'string'),
      callsWithOutputShape: completedCalls.filter((event: any) => Array.isArray(event.outputShape) && event.outputShape.length > 0).length
    }
  });

  const synthesisScore = crossProductSynthesisScore(employee360.body.synthesis);
  await add({
    caseId: 'cross-product-llm-synthesis', category: 'grounding', hardGate: true,
    passed: employee360.status === 200 && typeof employee360.body.synthesis === 'string' && synthesisScore >= 0.75,
    score: synthesisScore,
    durationMs: employee360.durationMs,
    details: { synthesisPresent: typeof employee360.body.synthesis === 'string', synthesisLength: typeof employee360.body.synthesis === 'string' ? employee360.body.synthesis.length : 0, score: synthesisScore }
  });

  const rlsStarted = Date.now();
  const visibleInTenant = await withTenant(tenantId, async client => {
    const r = await client.query(`select count(*)::int as count from bcs_state.agent_runs where run_id = $1`, [employee360.body.runId ?? hr.requestId]);
    return Number(r.rows[0]?.count ?? 0);
  });
  const visibleCrossTenant = await withTenant('00000000-0000-0000-0000-000000000000', async client => {
    const r = await client.query(`select count(*)::int as count from bcs_state.agent_runs where run_id = $1`, [employee360.body.runId ?? hr.requestId]);
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
  const categories = [...new Set(results.map(r => r.category))];
  const summary = {
    averageScore,
    hardGateFailures,
    categories: Object.fromEntries(categories.map(category => {
      const selected = results.filter(r => r.category === category);
      return [category, selected.reduce((sum, r) => sum + r.score, 0) / selected.length];
    }))
  };

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

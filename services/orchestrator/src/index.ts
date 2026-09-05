import express from 'express';
import pino from 'pino';
import { z } from 'zod';
import { discoverMcpTools } from './dependencies.js';
import { executePayrollGraph } from './graph.js';
import { executeScenarioGraph } from './scenario-graph.js';
import { publicScenario, scenarioById, scenarios } from './scenarios.js';
import { RuntimePersistence } from './persistence.js';
import type { SecurityContext } from './runtime-types.js';

const app = express();
const log = pino({ name: 'orchestrator' });
const port = Number(process.env.PORT ?? 3001);
const persistence = await RuntimePersistence.create();

const RequestSchema = z.object({
  employeeId: z.string().min(1).max(128),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  explain: z.boolean().default(false),
  threadId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional()
}).strict();

const ScenarioRequestSchema = z.object({
  employeeId: z.string().min(1).max(128),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  candidateId: z.string().min(1).max(128).optional(),
  explain: z.boolean().default(true),
  threadId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional()
}).strict();

app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({
  status: 'ok',
  service: 'orchestrator',
  stateBackend: persistence.backend,
  durableState: persistence.backend === 'postgres',
  scenarioCount: scenarios.length
}));

function securityContext(req: express.Request): SecurityContext | undefined {
  const tenantId = req.header('x-bcs-tenant-id');
  const userId = req.header('x-bcs-user-id');
  const roles = (req.header('x-bcs-roles') ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  const purpose = req.header('x-bcs-purpose') ?? 'self-service';
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  if (!tenantId || !userId || roles.length === 0) return undefined;
  return { tenantId, userId, roles, purpose, requestId };
}

function parseRequest(body: unknown) {
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  return { ok: true as const, data: parsed.data };
}

function parseScenarioRequest(body: unknown) {
  const parsed = ScenarioRequestSchema.safeParse(body);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues };
  return { ok: true as const, data: parsed.data };
}

app.get('/v1/mcp/tools', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  try {
    const tools = await discoverMcpTools(context);
    return res.json({ requestId: context.requestId, tools });
  } catch (error) {
    log.error({ error, requestId: context.requestId }, 'MCP tool discovery failed');
    return res.status(503).json({ code: 'MCP_UNAVAILABLE', requestId: context.requestId });
  }
});

app.get('/v1/scenarios', (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  return res.json({
    requestId: context.requestId,
    scenarios: scenarios.map(publicScenario),
    runtime: {
      state: persistence.backend === 'postgres' ? 'PostgreSQL + LangGraph checkpoints' : 'in-memory',
      orchestration: 'LangGraph',
      protocol: 'MCP 2026-07-28',
      dataMode: 'SYNTHETIC'
    }
  });
});

app.get('/v1/runs', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const limit = Number(req.query.limit ?? 50);
  const runs = await persistence.listRuns(context, Number.isFinite(limit) ? limit : 50);
  return res.json({ requestId: context.requestId, stateBackend: persistence.backend, runs });
});

app.get('/v1/runs/:runId', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const details = await persistence.runDetails(context, req.params.runId);
  if (!details) return res.status(404).json({ code: 'RUN_NOT_FOUND', requestId: context.requestId });
  return res.json({ requestId: context.requestId, ...details });
});

app.get('/v1/runs/:runId/artifacts/:artifactId', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const artifact = await persistence.getArtifactForContext(context, req.params.runId, req.params.artifactId);
  if (!artifact) return res.status(404).json({ code: 'ARTIFACT_NOT_FOUND', requestId: context.requestId });
  return res.json({ requestId: context.requestId, artifact });
});

app.get('/v1/evaluations', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  if (!context.roles.includes('hr') && !context.roles.includes('payroll')) {
    return res.status(403).json({ code: 'EVALUATION_VIEW_FORBIDDEN', requestId: context.requestId });
  }
  const runs = await persistence.listEvalRuns(context.tenantId, 20);
  return res.json({ requestId: context.requestId, runs });
});

app.post('/v1/scenarios/:scenarioId', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const scenario = scenarioById(req.params.scenarioId);
  if (!scenario) return res.status(404).json({ code: 'SCENARIO_NOT_FOUND', requestId: context.requestId });
  const parsed = parseScenarioRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.issues, requestId: context.requestId });
  const runId = context.requestId;
  const threadId = parsed.data.threadId ?? `${scenario.id}:${parsed.data.employeeId}`;
  const result = await executeScenarioGraph({ scenario, input: parsed.data, context, persistence, runId, threadId });
  return res.status(result.status).json(result.payload);
});

app.post('/v1/scenarios/:scenarioId/stream', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const scenario = scenarioById(req.params.scenarioId);
  if (!scenario) return res.status(404).json({ code: 'SCENARIO_NOT_FOUND', requestId: context.requestId });
  const parsed = parseScenarioRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.issues, requestId: context.requestId });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const runId = context.requestId;
  const threadId = parsed.data.threadId ?? `${scenario.id}:${parsed.data.employeeId}`;
  await executeScenarioGraph({
    scenario,
    input: parsed.data,
    context,
    persistence,
    runId,
    threadId,
    sink: event => {
      if (!res.writableEnded) res.write(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });
  return res.end();
});

// Backward-compatible payroll endpoint retained for API consumers and regression tests.
app.post('/v1/employee-summary', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const parsed = parseRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.issues, requestId: context.requestId });

  const runId = context.requestId;
  const threadId = parsed.data.threadId ?? runId;
  const result = await executePayrollGraph({ input: parsed.data, context, persistence, runId, threadId });
  return res.status(result.status).json(result.payload);
});

app.post('/v1/employee-summary/stream', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const parsed = parseRequest(req.body);
  if (!parsed.ok) return res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.issues, requestId: context.requestId });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const runId = context.requestId;
  const threadId = parsed.data.threadId ?? runId;
  await executePayrollGraph({
    input: parsed.data,
    context,
    persistence,
    runId,
    threadId,
    sink: event => {
      if (!res.writableEnded) res.write(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`);
    }
  });
  return res.end();
});

const server = app.listen(port, () => log.info({ port, stateBackend: persistence.backend, scenarios: scenarios.length }, 'orchestrator listening'));

async function shutdown(signal: string) {
  log.info({ signal }, 'orchestrator shutting down');
  server.close();
  await persistence.close();
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

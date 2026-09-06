import express from 'express';
import pino from 'pino';
import { authenticate } from './auth.js';

/**
 * BCS ONE external API gateway.
 *
 * Security boundary:
 * - Browser/API callers present an Entra bearer token.
 * - The gateway validates that token and derives trusted tenant/user/role data.
 * - Downstream services receive internal `x-bcs-*` headers created here; those
 *   headers are not accepted as the production identity authority from callers.
 * - Request IDs are created/reused at this edge so policy, MCP, artifacts and AI
 *   telemetry can be correlated without logging sensitive business payloads.
 */

const app = express();
const log = pino({ name: 'gateway' });
const port = Number(process.env.PORT ?? 3000);
const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';
const corsOrigin = process.env.CORS_ORIGIN ?? '';

app.disable('x-powered-by');
app.use((req, res, next) => {
  if (corsOrigin) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

/** Map authenticated application roles to an explicit business purpose. */
function purposeForRoles(roles: string[]): string {
  return roles.includes('payroll') ? 'payroll-processing' : roles.includes('hr') ? 'hr-service' : 'self-service';
}

/**
 * Construct the only security-context headers trusted by the internal runtime.
 * Never populate these values from request body/model/tool arguments.
 */
function trustedHeaders(context: { tenantId: string; userId: string; roles: string[] }, purpose: string, requestId: string) {
  return {
    'x-bcs-tenant-id': context.tenantId,
    'x-bcs-user-id': context.userId,
    'x-bcs-roles': context.roles.join(','),
    'x-bcs-purpose': purpose,
    'x-request-id': requestId
  };
}

/** Authenticated GET proxy used for tenant-scoped read APIs. */
async function proxyGet(req: express.Request, res: express.Response, upstreamPath: string) {
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).json({ code: auth.code, message: auth.message, requestId });
  const purpose = purposeForRoles(auth.context.roles);
  try {
    const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const upstream = await fetch(`${orchestratorUrl}${upstreamPath}${query}`, {
      headers: trustedHeaders(auth.context, purpose, requestId),
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await upstream.text();
    return res.status(upstream.status).type(upstream.headers.get('content-type') ?? 'application/json').send(payload);
  } catch (error) {
    log.error({ error, requestId, upstreamPath }, 'orchestrator GET proxy failed');
    return res.status(503).json({ code: 'ORCHESTRATOR_UNAVAILABLE', requestId });
  }
}

/** Authenticated request/response proxy for non-streaming workflow calls. */
async function proxyPost(req: express.Request, res: express.Response, upstreamPath: string, timeoutMs = 45_000) {
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).json({ code: auth.code, message: auth.message, requestId });
  const purpose = purposeForRoles(auth.context.roles);
  try {
    const upstream = await fetch(`${orchestratorUrl}${upstreamPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...trustedHeaders(auth.context, purpose, requestId) },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = await upstream.text();
    return res.status(upstream.status).type(upstream.headers.get('content-type') ?? 'application/json').send(payload);
  } catch (error) {
    log.error({ error, requestId, upstreamPath }, 'orchestrator POST proxy failed');
    return res.status(503).json({ code: 'ORCHESTRATOR_UNAVAILABLE', requestId });
  }
}

/**
 * Stream a governed workflow to the browser using Server-Sent Events.
 *
 * The gateway emits the edge/identity/context events itself, then transparently
 * forwards orchestrator events. This lets the UI explain the complete request
 * path while keeping authentication at the edge rather than inside the model.
 */
async function proxyStream(req: express.Request, res: express.Response, upstreamPath: string) {
  const startedAt = Date.now();
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  const authStarted = Date.now();
  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).json({ code: auth.code, message: auth.message, requestId });
  const purpose = purposeForRoles(auth.context.roles);

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const threadId = typeof req.body?.threadId === 'string' ? req.body.threadId : requestId;
  const send = (event: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`);
  };

  send({
    requestId, runId: requestId, threadId, timestamp: new Date().toISOString(), elapsedMs: 0,
    stage: 'gateway', event: 'request.accepted', status: 'completed', type: 'event',
    nodeId: 'request', lane: 'control', message: upstreamPath
  });
  send({
    requestId, runId: requestId, threadId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    stage: 'identity', event: 'entra.token.validated', status: 'completed', type: 'event',
    durationMs: Date.now() - authStarted, nodeId: 'identity', parentNodeId: 'request', lane: 'governance',
    message: `roles=${auth.context.roles.join(',')}`
  });
  send({
    requestId, runId: requestId, threadId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt,
    stage: 'gateway', event: 'gateway.context.created', status: 'completed', type: 'event',
    nodeId: 'gateway', parentNodeId: 'identity', lane: 'control',
    durationMs: Date.now() - startedAt, message: `purpose=${purpose}`
  });

  try {
    const upstream = await fetch(`${orchestratorUrl}${upstreamPath}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...trustedHeaders(auth.context, purpose, requestId) },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(45_000)
    });
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      send({ requestId, runId: requestId, threadId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt, stage: 'gateway', event: 'upstream.failed', status: 'failed', type: 'error', nodeId: 'gateway', parentNodeId: 'identity', lane: 'control', message: detail || `HTTP ${upstream.status}` });
      return res.end();
    }
    const reader = upstream.body.getReader();
    while (!res.writableEnded) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    return res.end();
  } catch (error) {
    log.error({ error, requestId, upstreamPath }, 'orchestrator stream failed');
    send({ requestId, runId: requestId, threadId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt, stage: 'gateway', event: 'stream.failed', status: 'failed', type: 'error', nodeId: 'gateway', parentNodeId: 'identity', lane: 'control', message: 'Orchestrator unavailable' });
    return res.end();
  }
}

// Read APIs: all remain behind Entra authentication and the trusted gateway context.
app.get('/v1/mcp/tools', (req, res) => void proxyGet(req, res, '/v1/mcp/tools'));
app.get('/v1/scenarios', (req, res) => void proxyGet(req, res, '/v1/scenarios'));
app.get('/v1/workforce/overview', (req, res) => void proxyGet(req, res, '/v1/workforce/overview'));
app.get('/v1/workforce/employees', (req, res) => void proxyGet(req, res, '/v1/workforce/employees'));
app.get('/v1/workforce/employees/:employeeId', (req, res) => void proxyGet(req, res, `/v1/workforce/employees/${encodeURIComponent(req.params.employeeId)}`));
app.get('/v1/dashboard/cto', (req, res) => void proxyGet(req, res, '/v1/dashboard/cto'));
app.get('/v1/runs', (req, res) => void proxyGet(req, res, '/v1/runs'));
app.get('/v1/runs/:runId', (req, res) => void proxyGet(req, res, `/v1/runs/${encodeURIComponent(req.params.runId)}`));
app.get('/v1/runs/:runId/artifacts/:artifactId', (req, res) => void proxyGet(req, res, `/v1/runs/${encodeURIComponent(req.params.runId)}/artifacts/${encodeURIComponent(req.params.artifactId)}`));
app.get('/v1/evaluations', (req, res) => void proxyGet(req, res, '/v1/evaluations'));

// Workflow APIs: the gateway keeps authentication outside the agent/orchestrator runtime.
app.post('/v1/scenarios/:scenarioId', (req, res) => void proxyPost(req, res, `/v1/scenarios/${encodeURIComponent(req.params.scenarioId)}`));
app.post('/v1/scenarios/:scenarioId/stream', (req, res) => void proxyStream(req, res, `/v1/scenarios/${encodeURIComponent(req.params.scenarioId)}/stream`));

// Backward-compatible payroll endpoint retained for API consumers and regression tests.
app.post('/v1/employee-summary', (req, res) => void proxyPost(req, res, '/v1/employee-summary', 30_000));
app.post('/v1/employee-summary/stream', (req, res) => void proxyStream(req, res, '/v1/employee-summary/stream'));

app.listen(port, () => log.info({ port }, 'gateway listening'));

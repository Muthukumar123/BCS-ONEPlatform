import express from 'express';
import pino from 'pino';
import { authenticate } from './auth.js';

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

function purposeForRoles(roles: string[]): string {
  return roles.includes('payroll')
    ? 'payroll-processing'
    : roles.includes('hr')
      ? 'hr-service'
      : 'self-service';
}

function trustedHeaders(context: { tenantId: string; userId: string; roles: string[] }, purpose: string, requestId: string) {
  return {
    'x-bcs-tenant-id': context.tenantId,
    'x-bcs-user-id': context.userId,
    'x-bcs-roles': context.roles.join(','),
    'x-bcs-purpose': purpose,
    'x-request-id': requestId
  };
}

app.get('/v1/mcp/tools', async (req, res) => {
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth.ok) return res.status(auth.status).json({ code: auth.code, message: auth.message, requestId });
  const purpose = purposeForRoles(auth.context.roles);

  try {
    const upstream = await fetch(`${orchestratorUrl}/v1/mcp/tools`, {
      headers: trustedHeaders(auth.context, purpose, requestId),
      signal: AbortSignal.timeout(8_000)
    });
    const payload = await upstream.text();
    return res.status(upstream.status).type(upstream.headers.get('content-type') ?? 'application/json').send(payload);
  } catch (error) {
    log.error({ error, requestId }, 'MCP tool discovery failed');
    return res.status(503).json({ code: 'ORCHESTRATOR_UNAVAILABLE', requestId });
  }
});

app.post('/v1/employee-summary', async (req, res) => {
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ code: auth.code, message: auth.message, requestId });
  }

  const purpose = purposeForRoles(auth.context.roles);

  try {
    const upstream = await fetch(`${orchestratorUrl}/v1/employee-summary`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...trustedHeaders(auth.context, purpose, requestId)
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(25_000)
    });

    const payload = await upstream.text();
    return res
      .status(upstream.status)
      .type(upstream.headers.get('content-type') ?? 'application/json')
      .send(payload);
  } catch (error) {
    log.error({ error, requestId }, 'orchestrator request failed');
    return res.status(503).json({ code: 'ORCHESTRATOR_UNAVAILABLE', requestId });
  }
});

app.post('/v1/employee-summary/stream', async (req, res) => {
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
  res.flushHeaders();

  const send = (event: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`);
  };

  send({
    requestId,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    stage: 'identity',
    event: 'entra.token.validated',
    status: 'completed',
    type: 'event',
    durationMs: Date.now() - authStarted,
    message: `roles=${auth.context.roles.join(',')}`
  });
  send({
    requestId,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    stage: 'gateway',
    event: 'gateway.context.created',
    status: 'completed',
    type: 'event',
    durationMs: Date.now() - startedAt,
    message: `purpose=${purpose}`
  });

  try {
    const upstream = await fetch(`${orchestratorUrl}/v1/employee-summary/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...trustedHeaders(auth.context, purpose, requestId)
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(25_000)
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text();
      send({ requestId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt, stage: 'gateway', event: 'upstream.failed', status: 'failed', type: 'error', message: detail || `HTTP ${upstream.status}` });
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
    log.error({ error, requestId }, 'orchestrator stream failed');
    send({ requestId, timestamp: new Date().toISOString(), elapsedMs: Date.now() - startedAt, stage: 'gateway', event: 'stream.failed', status: 'failed', type: 'error', message: 'Orchestrator unavailable' });
    return res.end();
  }
});

app.listen(port, () => log.info({ port }, 'gateway listening'));

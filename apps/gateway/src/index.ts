import express from 'express';
import pino from 'pino';

const app = express();
const log = pino({ name: 'gateway' });
const port = Number(process.env.PORT ?? 3000);
const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

app.post('/v1/employee-summary', async (req, res) => {
  if (process.env.ALLOW_DEV_HEADERS !== 'true') {
    return res.status(503).json({
      code: 'IDENTITY_EDGE_NOT_CONFIGURED',
      message: 'Production OIDC claim validation must be configured before enabling this route.'
    });
  }

  const tenantId = req.header('x-bcs-tenant-id');
  const userId = req.header('x-bcs-user-id');
  const roles = req.header('x-bcs-roles');
  const purpose = req.header('x-bcs-purpose') ?? 'self-service';
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();

  if (!tenantId || !userId || !roles) {
    return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  }

  try {
    const upstream = await fetch(`${orchestratorUrl}/v1/employee-summary`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bcs-tenant-id': tenantId,
        'x-bcs-user-id': userId,
        'x-bcs-roles': roles,
        'x-bcs-purpose': purpose,
        'x-request-id': requestId
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(25_000)
    });

    const payload = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get('content-type') ?? 'application/json').send(payload);
  } catch (error) {
    log.error({ error, requestId }, 'orchestrator request failed');
    res.status(503).json({ code: 'ORCHESTRATOR_UNAVAILABLE', requestId });
  }
});

app.listen(port, () => log.info({ port }, 'gateway listening'));

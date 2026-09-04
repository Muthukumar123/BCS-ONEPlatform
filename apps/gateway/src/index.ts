import express from 'express';
import pino from 'pino';
import { authenticate } from './auth.js';

const app = express();
const log = pino({ name: 'gateway' });
const port = Number(process.env.PORT ?? 3000);
const orchestratorUrl = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3001';

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'gateway' }));

app.post('/v1/employee-summary', async (req, res) => {
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  const auth = await authenticate(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ code: auth.code, message: auth.message, requestId });
  }

  const { tenantId, userId, roles } = auth.context;
  const purpose = roles.includes('payroll')
    ? 'payroll-processing'
    : roles.includes('hr')
      ? 'hr-service'
      : 'self-service';

  try {
    const upstream = await fetch(`${orchestratorUrl}/v1/employee-summary`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-bcs-tenant-id': tenantId,
        'x-bcs-user-id': userId,
        'x-bcs-roles': roles.join(','),
        'x-bcs-purpose': purpose,
        'x-request-id': requestId
      },
      body: JSON.stringify(req.body),
      signal: AbortSignal.timeout(25_000)
    });

    const payload = await upstream.text();
    res
      .status(upstream.status)
      .type(upstream.headers.get('content-type') ?? 'application/json')
      .send(payload);
  } catch (error) {
    log.error({ error, requestId }, 'orchestrator request failed');
    res.status(503).json({ code: 'ORCHESTRATOR_UNAVAILABLE', requestId });
  }
});

app.listen(port, () => log.info({ port }, 'gateway listening'));

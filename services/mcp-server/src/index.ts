import express from 'express';
import pino from 'pino';
import { z } from 'zod';

const app = express();
const log = pino({ name: 'mcp-server' });
const port = Number(process.env.PORT ?? 3002);
const adapterUrl = process.env.REFERENCE_PAYROLL_ADAPTER_URL ?? 'http://localhost:3003';
const protocolVersion = '2026-07-28';

const InputSchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/)
}).strict();

const OutputSchema = z.object({
  employeeId: z.string(),
  period: z.string(),
  grossAmount: z.number(),
  netAmount: z.number(),
  currency: z.string().length(3),
  lineItems: z.array(z.object({ code: z.string(), amount: z.number() })),
  sourceSystem: z.string(),
  freshness: z.string()
}).strict();

const tool = {
  name: 'payroll.employee_summary',
  title: 'Employee payroll summary',
  description: 'Returns authoritative synthetic payroll summary facts for one employee and period. Read-only; does not calculate or reconcile.',
  inputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' },
      period: { type: 'string', pattern: '^\\d{4}-\\d{2}$' }
    },
    required: ['employeeId', 'period'],
    additionalProperties: false
  },
  outputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' }, period: { type: 'string' }, grossAmount: { type: 'number' },
      netAmount: { type: 'number' }, currency: { type: 'string' }, lineItems: { type: 'array' },
      sourceSystem: { type: 'string' }, freshness: { type: 'string' }
    },
    required: ['employeeId', 'period', 'grossAmount', 'netAmount', 'currency', 'sourceSystem', 'freshness'],
    additionalProperties: false
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
};

app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'mcp-server' }));

app.post('/mcp', async (req, res) => {
  const version = req.header('MCP-Protocol-Version');
  const headerMethod = req.header('Mcp-Method');
  const body = req.body as any;

  if (version !== protocolVersion) {
    return res.status(400).json({ jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32022, message: 'UnsupportedProtocolVersion' } });
  }
  if (!body || body.jsonrpc !== '2.0' || headerMethod !== body.method) {
    return res.status(400).json({ jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
  }

  if (body.method === 'tools/list') {
    return res.json({ jsonrpc: '2.0', id: body.id, result: { tools: [tool] } });
  }

  if (body.method !== 'tools/call' || body.params?.name !== tool.name || req.header('Mcp-Name') !== tool.name) {
    return res.status(404).json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method or tool not found' } });
  }

  const tenantId = req.header('x-bcs-tenant-id');
  if (!tenantId) {
    return res.status(403).json({ jsonrpc: '2.0', id: body.id, error: { code: -32001, message: 'Trusted tenant context missing' } });
  }

  const rawArgs = { ...(body.params?.arguments ?? {}) };
  delete rawArgs.tenantId;
  delete rawArgs.tenant_id;
  const parsed = InputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return res.status(400).json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid params', data: parsed.error.issues } });
  }

  try {
    const upstream = await fetch(`${adapterUrl}/capabilities/payroll.employee_summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bcs-tenant-id': tenantId, 'x-request-id': String(body.id) },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(6_000)
    });
    if (!upstream.ok) {
      return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Source system unavailable' }], isError: true } });
    }

    const validated = OutputSchema.safeParse(await upstream.json());
    if (!validated.success) {
      log.error({ issues: validated.error.issues }, 'adapter contract violation');
      return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Upstream contract violation' }], isError: true } });
    }

    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(validated.data) }],
        structuredContent: validated.data,
        isError: false
      }
    });
  } catch (error) {
    log.error({ error }, 'adapter invocation failed');
    return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Dependency unavailable' }], isError: true } });
  }
});

app.listen(port, () => log.info({ port, protocolVersion }, 'MCP server listening'));

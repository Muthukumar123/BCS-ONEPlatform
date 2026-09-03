import express from 'express';
import pino from 'pino';
import { z } from 'zod';
import { explainGroundedFacts } from './azure-openai.js';

const app = express();
const log = pino({ name: 'orchestrator' });
const port = Number(process.env.PORT ?? 3001);
const mcpUrl = process.env.MCP_URL ?? 'http://localhost:3002/mcp';
const policyUrl = process.env.POLICY_URL ?? 'http://localhost:8181';

const RequestSchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  explain: z.boolean().default(false)
});

app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'orchestrator' }));

async function authorize(input: Record<string, unknown>): Promise<boolean> {
  const response = await fetch(`${policyUrl}/v1/data/bcsone/authz/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) return false;
  const body = await response.json() as { result?: { allow?: boolean } };
  return body.result?.allow === true;
}

app.post('/v1/employee-summary', async (req, res) => {
  const parsed = RequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues });

  const tenantId = req.header('x-bcs-tenant-id');
  const userId = req.header('x-bcs-user-id');
  const roles = (req.header('x-bcs-roles') ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const purpose = req.header('x-bcs-purpose') ?? 'self-service';
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();

  if (!tenantId || !userId || roles.length === 0) {
    return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT', requestId });
  }

  try {
    const allowed = await authorize({
      tenant_id: tenantId,
      user_id: userId,
      roles,
      purpose,
      action: 'read',
      resource: { type: 'employee_payroll', id: parsed.data.employeeId, owner_user_id: parsed.data.employeeId }
    });

    if (!allowed) return res.status(403).json({ code: 'AUTH_DENIED', requestId });

    const rpc = {
      jsonrpc: '2.0',
      id: requestId,
      method: 'tools/call',
      params: {
        name: 'payroll.employee_summary',
        arguments: { employeeId: parsed.data.employeeId, period: parsed.data.period },
        _meta: {
          'io.modelcontextprotocol/clientInfo': { name: 'bcs-one-orchestrator', version: '0.1.0' }
        }
      }
    };

    const mcp = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'payroll.employee_summary',
        'x-bcs-tenant-id': tenantId,
        'x-request-id': requestId
      },
      body: JSON.stringify(rpc),
      signal: AbortSignal.timeout(8_000)
    });

    const body = await mcp.json() as any;
    if (!mcp.ok || body.error || body.result?.isError) {
      return res.status(503).json({ code: 'DEPENDENCY_UNAVAILABLE', requestId, detail: body.error ?? body.result });
    }

    const facts = body.result?.structuredContent;
    if (!facts) return res.status(502).json({ code: 'UPSTREAM_CONTRACT_VIOLATION', requestId });

    const explanation = parsed.data.explain ? await explainGroundedFacts(facts) : undefined;
    return res.json({ requestId, status: 'FULL', facts, explanation });
  } catch (error) {
    log.error({ error, requestId }, 'employee summary failed');
    return res.status(503).json({ code: 'DEPENDENCY_UNAVAILABLE', requestId });
  }
});

app.listen(port, () => log.info({ port }, 'orchestrator listening'));

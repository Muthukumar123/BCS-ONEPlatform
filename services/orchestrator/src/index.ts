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

type SecurityContext = {
  tenantId: string;
  userId: string;
  roles: string[];
  purpose: string;
  requestId: string;
};

type WorkflowEvent = {
  requestId: string;
  timestamp: string;
  elapsedMs: number;
  stage: string;
  event: string;
  status: string;
  type?: 'event' | 'result' | 'complete' | 'error';
  message?: string;
  tool?: string;
  durationMs?: number;
  payload?: unknown;
};

type EventSink = (event: WorkflowEvent) => void;

app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'orchestrator' }));

function securityContext(req: express.Request): SecurityContext | undefined {
  const tenantId = req.header('x-bcs-tenant-id');
  const userId = req.header('x-bcs-user-id');
  const roles = (req.header('x-bcs-roles') ?? '').split(',').map(v => v.trim()).filter(Boolean);
  const purpose = req.header('x-bcs-purpose') ?? 'self-service';
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  if (!tenantId || !userId || roles.length === 0) return undefined;
  return { tenantId, userId, roles, purpose, requestId };
}

function createEmitter(requestId: string, startedAt: number, sink?: EventSink) {
  return (stage: string, event: string, status: string, extra: Partial<WorkflowEvent> = {}) => {
    sink?.({
      requestId,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      stage,
      event,
      status,
      type: 'event',
      ...extra
    });
  };
}

async function authorize(input: Record<string, unknown>): Promise<{ allow: boolean; reason?: string }> {
  const response = await fetch(`${policyUrl}/v1/data/bcsone/authz/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) return { allow: false, reason: `policy-http-${response.status}` };
  const body = await response.json() as { result?: { allow?: boolean; reason?: string } };
  return { allow: body.result?.allow === true, reason: body.result?.reason };
}

async function executeEmployeeSummary(
  body: unknown,
  context: SecurityContext,
  sink?: EventSink
): Promise<{ status: number; payload: unknown }> {
  const startedAt = Date.now();
  const emit = createEmitter(context.requestId, startedAt, sink);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    emit('orchestrator', 'request.validation', 'failed', { type: 'error', message: 'Request validation failed' });
    return { status: 400, payload: { code: 'VALIDATION_ERROR', issues: parsed.error.issues, requestId: context.requestId } };
  }

  try {
    const policyStarted = Date.now();
    emit('policy', 'policy.evaluate', 'started', { message: `${context.purpose} · read employee_payroll` });
    const decision = await authorize({
      tenant_id: context.tenantId,
      user_id: context.userId,
      roles: context.roles,
      purpose: context.purpose,
      action: 'read',
      resource: { type: 'employee_payroll', id: parsed.data.employeeId, owner_user_id: parsed.data.employeeId }
    });
    const policyDuration = Date.now() - policyStarted;
    emit('policy', 'policy.decision', decision.allow ? 'allowed' : 'denied', {
      durationMs: policyDuration,
      message: decision.reason ?? (decision.allow ? 'allowed' : 'deny-by-default')
    });
    if (!decision.allow) {
      emit('orchestrator', 'workflow.completed', 'failed', { type: 'error', message: 'Authorization denied' });
      return { status: 403, payload: { code: 'AUTH_DENIED', requestId: context.requestId } };
    }

    emit('orchestrator', 'agent.plan', 'started', { message: 'Selected canonical payroll.employee_summary capability' });
    emit('orchestrator', 'agent.plan', 'completed', { durationMs: 0, message: '1 MCP tool selected' });

    const rpc = {
      jsonrpc: '2.0',
      id: context.requestId,
      method: 'tools/call',
      params: {
        name: 'payroll.employee_summary',
        arguments: { employeeId: parsed.data.employeeId, period: parsed.data.period },
        _meta: {
          'io.modelcontextprotocol/clientInfo': { name: 'bcs-one-orchestrator', version: '0.1.0' }
        }
      }
    };

    const mcpStarted = Date.now();
    emit('mcp', 'tools/call.started', 'started', { tool: 'payroll.employee_summary', message: 'MCP 2026-07-28' });
    const mcp = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/call',
        'Mcp-Name': 'payroll.employee_summary',
        'x-bcs-tenant-id': context.tenantId,
        'x-request-id': context.requestId
      },
      body: JSON.stringify(rpc),
      signal: AbortSignal.timeout(8_000)
    });

    const mcpBody = await mcp.json() as any;
    const mcpDuration = Date.now() - mcpStarted;
    if (!mcp.ok || mcpBody.error || mcpBody.result?.isError) {
      emit('mcp', 'tools/call.completed', 'failed', { tool: 'payroll.employee_summary', durationMs: mcpDuration, message: 'MCP dependency unavailable' });
      return { status: 503, payload: { code: 'DEPENDENCY_UNAVAILABLE', requestId: context.requestId, detail: mcpBody.error ?? mcpBody.result } };
    }

    const facts = mcpBody.result?.structuredContent;
    if (!facts) {
      emit('mcp', 'tools/call.completed', 'failed', { tool: 'payroll.employee_summary', durationMs: mcpDuration, message: 'Missing structuredContent' });
      return { status: 502, payload: { code: 'UPSTREAM_CONTRACT_VIOLATION', requestId: context.requestId } };
    }

    const adapterDuration = Number(mcpBody.result?._meta?.adapterDurationMs ?? mcpDuration);
    emit('adapter', 'adapter.roundtrip', 'completed', {
      durationMs: adapterDuration,
      message: mcpBody.result?._meta?.adapter ?? 'Reference Payroll Adapter'
    });
    emit('source', 'source.facts', 'completed', {
      message: String(facts.sourceSystem ?? 'unknown source')
    });
    emit('mcp', 'tools/call.completed', 'completed', {
      tool: 'payroll.employee_summary',
      durationMs: mcpDuration,
      message: 'Structured output schema validated'
    });

    let explanation: string | undefined;
    if (parsed.data.explain) {
      const aiStarted = Date.now();
      emit('ai', 'model.explain.started', 'started', { message: 'Grounded payroll explanation' });
      explanation = await explainGroundedFacts(facts);
      emit('ai', 'model.explain.completed', 'completed', {
        durationMs: Date.now() - aiStarted,
        message: explanation ? 'Explanation returned' : 'Model returned no explanation'
      });
    } else {
      emit('ai', 'model.explain.skipped', 'skipped', { message: 'explain=false' });
    }

    const payload = { requestId: context.requestId, status: 'FULL', facts, explanation };
    emit('orchestrator', 'workflow.result', 'completed', { type: 'result', payload, message: 'Governed result assembled' });
    emit('orchestrator', 'workflow.completed', 'completed', { type: 'complete', durationMs: Date.now() - startedAt, message: 'Workflow complete' });
    return { status: 200, payload };
  } catch (error) {
    log.error({ error, requestId: context.requestId }, 'employee summary failed');
    emit('orchestrator', 'workflow.completed', 'failed', { type: 'error', message: 'Dependency unavailable' });
    return { status: 503, payload: { code: 'DEPENDENCY_UNAVAILABLE', requestId: context.requestId } };
  }
}

app.get('/v1/mcp/tools', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const rpc = { jsonrpc: '2.0', id: context.requestId, method: 'tools/list', params: {} };
  try {
    const response = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'MCP-Protocol-Version': '2026-07-28',
        'Mcp-Method': 'tools/list',
        'x-bcs-tenant-id': context.tenantId,
        'x-request-id': context.requestId
      },
      body: JSON.stringify(rpc),
      signal: AbortSignal.timeout(5_000)
    });
    const body = await response.json() as any;
    if (!response.ok || body.error) return res.status(503).json({ code: 'MCP_UNAVAILABLE', requestId: context.requestId });
    return res.json({ requestId: context.requestId, tools: body.result?.tools ?? [] });
  } catch (error) {
    log.error({ error, requestId: context.requestId }, 'MCP tool discovery failed');
    return res.status(503).json({ code: 'MCP_UNAVAILABLE', requestId: context.requestId });
  }
});

app.post('/v1/employee-summary', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });
  const result = await executeEmployeeSummary(req.body, context);
  return res.status(result.status).json(result.payload);
});

app.post('/v1/employee-summary/stream', async (req, res) => {
  const context = securityContext(req);
  if (!context) return res.status(400).json({ code: 'MISSING_SECURITY_CONTEXT' });

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send: EventSink = event => {
    if (!res.writableEnded) res.write(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`);
  };

  const result = await executeEmployeeSummary(req.body, context, send);
  if (result.status !== 200) {
    send({
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      elapsedMs: 0,
      stage: 'orchestrator',
      event: 'workflow.error',
      status: 'failed',
      type: 'error',
      payload: result.payload,
      message: `Workflow returned HTTP ${result.status}`
    });
  }
  res.end();
});

app.listen(port, () => log.info({ port }, 'orchestrator listening'));

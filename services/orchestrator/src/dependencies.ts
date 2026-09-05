import { z } from 'zod';
import type { PayrollFacts, SecurityContext } from './runtime-types.js';

const mcpUrl = process.env.MCP_URL ?? 'http://localhost:3002/mcp';
const policyUrl = process.env.POLICY_URL ?? 'http://localhost:8181';

const PayrollFactsSchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  grossAmount: z.number().finite(),
  netAmount: z.number().finite(),
  currency: z.string().length(3),
  lineItems: z.array(z.object({ code: z.string().min(1), amount: z.number().finite() })),
  sourceSystem: z.string().min(1),
  freshness: z.string().min(1)
}).strict();

export type PolicyDecision = { allow: boolean; reason?: string };
export type McpCallResult = {
  data: Record<string, unknown>;
  adapterDurationMs?: number;
  adapter?: string;
  product?: string;
  sourceSystem?: string;
  outputShape: string[];
};

export async function authorizeRead(
  context: SecurityContext,
  resource: { type: string; id: string; ownerUserId?: string }
): Promise<PolicyDecision> {
  const response = await fetch(`${policyUrl}/v1/data/bcsone/authz/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: {
        tenant_id: context.tenantId,
        user_id: context.userId,
        roles: context.roles,
        purpose: context.purpose,
        action: 'read',
        resource: {
          type: resource.type,
          id: resource.id,
          owner_user_id: resource.ownerUserId ?? resource.id
        }
      }
    }),
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) return { allow: false, reason: `policy-http-${response.status}` };
  const body = await response.json() as { result?: { allow?: boolean; reason?: string } };
  return { allow: body.result?.allow === true, reason: body.result?.reason };
}

export async function authorizeEmployeePayroll(context: SecurityContext, employeeId: string): Promise<PolicyDecision> {
  return authorizeRead(context, { type: 'employee_payroll', id: employeeId, ownerUserId: employeeId });
}

export async function callMcpTool(
  context: SecurityContext,
  callId: string,
  capability: string,
  args: Record<string, unknown>
): Promise<McpCallResult> {
  const rpc = {
    jsonrpc: '2.0',
    id: callId,
    method: 'tools/call',
    params: {
      name: capability,
      arguments: args,
      _meta: {
        'io.modelcontextprotocol/clientInfo': { name: 'bcs-one-orchestrator', version: '0.3.0' },
        'bcsone/requestId': context.requestId
      }
    }
  };

  const response = await fetch(mcpUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': capability,
      'x-bcs-tenant-id': context.tenantId,
      'x-request-id': context.requestId
    },
    body: JSON.stringify(rpc),
    signal: AbortSignal.timeout(8_000)
  });

  const body = await response.json() as any;
  if (!response.ok || body.error || body.result?.isError) {
    const detail = body?.error?.message ?? body?.result?.content?.[0]?.text ?? 'MCP_DEPENDENCY_UNAVAILABLE';
    throw new Error(`MCP_CALL_FAILED:${capability}:${detail}`);
  }

  const data = body.result?.structuredContent;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`MCP_STRUCTURED_CONTENT_REQUIRED:${capability}`);
  }
  const outputShape = Array.isArray(body.result?._meta?.outputKeys)
    ? body.result._meta.outputKeys.filter((v: unknown): v is string => typeof v === 'string')
    : Object.keys(data);

  return {
    data,
    adapterDurationMs: Number.isFinite(Number(body.result?._meta?.adapterDurationMs)) ? Number(body.result._meta.adapterDurationMs) : undefined,
    adapter: typeof body.result?._meta?.adapter === 'string' ? body.result._meta.adapter : undefined,
    product: typeof body.result?._meta?.product === 'string' ? body.result._meta.product : undefined,
    sourceSystem: typeof data.sourceSystem === 'string' ? data.sourceSystem : undefined,
    outputShape
  };
}

export async function callPayrollSummaryMcp(
  context: SecurityContext,
  employeeId: string,
  period: string
): Promise<{ facts: PayrollFacts; adapterDurationMs?: number; adapter?: string }> {
  const result = await callMcpTool(context, context.requestId, 'payroll.employee_summary', { employeeId, period });
  return {
    facts: PayrollFactsSchema.parse(result.data),
    adapterDurationMs: result.adapterDurationMs,
    adapter: result.adapter
  };
}

export async function discoverMcpTools(context: SecurityContext): Promise<unknown[]> {
  const rpc = { jsonrpc: '2.0', id: context.requestId, method: 'tools/list', params: {} };
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
  if (!response.ok || body.error) throw new Error('MCP_UNAVAILABLE');
  return body.result?.tools ?? [];
}

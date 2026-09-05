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

export async function authorizeEmployeePayroll(
  context: SecurityContext,
  employeeId: string
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
        resource: { type: 'employee_payroll', id: employeeId, owner_user_id: employeeId }
      }
    }),
    signal: AbortSignal.timeout(2_000)
  });
  if (!response.ok) return { allow: false, reason: `policy-http-${response.status}` };
  const body = await response.json() as { result?: { allow?: boolean; reason?: string } };
  return { allow: body.result?.allow === true, reason: body.result?.reason };
}

export async function callPayrollSummaryMcp(
  context: SecurityContext,
  employeeId: string,
  period: string
): Promise<{ facts: PayrollFacts; adapterDurationMs?: number; adapter?: string }> {
  const rpc = {
    jsonrpc: '2.0',
    id: context.requestId,
    method: 'tools/call',
    params: {
      name: 'payroll.employee_summary',
      arguments: { employeeId, period },
      _meta: {
        'io.modelcontextprotocol/clientInfo': { name: 'bcs-one-orchestrator', version: '0.2.0' }
      }
    }
  };

  const response = await fetch(mcpUrl, {
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

  const body = await response.json() as any;
  if (!response.ok || body.error || body.result?.isError) {
    throw new Error('MCP_DEPENDENCY_UNAVAILABLE');
  }
  const facts = PayrollFactsSchema.parse(body.result?.structuredContent);
  return {
    facts,
    adapterDurationMs: Number.isFinite(Number(body.result?._meta?.adapterDurationMs))
      ? Number(body.result._meta.adapterDurationMs)
      : undefined,
    adapter: typeof body.result?._meta?.adapter === 'string' ? body.result._meta.adapter : undefined
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

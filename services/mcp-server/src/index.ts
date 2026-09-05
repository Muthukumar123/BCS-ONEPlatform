import express from 'express';
import pino from 'pino';
import { z } from 'zod';

const app = express();
const log = pino({ name: 'mcp-server' });
const port = Number(process.env.PORT ?? 3002);
const adapterUrl = process.env.REFERENCE_PAYROLL_ADAPTER_URL ?? 'http://localhost:3003';
const protocolVersion = '2026-07-28';

const PayrollInputSchema = z.object({
  employeeId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/)
}).strict();

const PayrollOutputSchema = z.object({
  employeeId: z.string(),
  period: z.string(),
  grossAmount: z.number(),
  netAmount: z.number(),
  currency: z.string().length(3),
  lineItems: z.array(z.object({ code: z.string(), amount: z.number() })),
  sourceSystem: z.string(),
  freshness: z.string()
}).strict();

const employeeInput = {
  type: 'object',
  properties: { employeeId: { type: 'string' } },
  required: ['employeeId'],
  additionalProperties: false
};

const employeePeriodInput = {
  type: 'object',
  properties: { employeeId: { type: 'string' }, period: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } },
  required: ['employeeId', 'period'],
  additionalProperties: false
};

const periodInput = {
  type: 'object',
  properties: { period: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } },
  required: ['period'],
  additionalProperties: false
};

const emptyInput = { type: 'object', properties: {}, additionalProperties: false };

type ToolStatus = 'live' | 'catalog';

function catalogTool(
  name: string,
  title: string,
  description: string,
  domain: string,
  product: string,
  inputSchema: Record<string, unknown> = employeeInput,
  status: ToolStatus = 'catalog'
) {
  return {
    name,
    title,
    description,
    inputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      'bcsone/domain': domain,
      'bcsone/product': product,
      'bcsone/status': status,
      'bcsone/dataMode': 'SYNTHETIC'
    }
  };
}

const payrollSummaryTool = {
  ...catalogTool(
    'payroll.employee_summary',
    'Employee payroll summary',
    'Returns authoritative synthetic payroll summary facts for one employee and period. Read-only; does not calculate or reconcile.',
    'Payroll',
    'BCS HR Software',
    employeePeriodInput,
    'live'
  ),
  outputSchema: {
    type: 'object',
    properties: {
      employeeId: { type: 'string' }, period: { type: 'string' }, grossAmount: { type: 'number' },
      netAmount: { type: 'number' }, currency: { type: 'string' }, lineItems: { type: 'array' },
      sourceSystem: { type: 'string' }, freshness: { type: 'string' }
    },
    required: ['employeeId', 'period', 'grossAmount', 'netAmount', 'currency', 'sourceSystem', 'freshness'],
    additionalProperties: false
  }
};

const tools = [
  payrollSummaryTool,
  catalogTool('payroll.payslip.get', 'Payslip', 'Retrieves payslip metadata and document reference for an employee period.', 'Payroll', 'BCS HR Software', employeePeriodInput),
  catalogTool('payroll.period.readiness', 'Payroll period readiness', 'Returns deterministic readiness checks and blockers for a payroll period.', 'Payroll', 'BCS HR Software', periodInput),
  catalogTool('payroll.exceptions.list', 'Payroll exceptions', 'Lists payroll exceptions requiring HR or payroll attention.', 'Payroll', 'BCS HR Software', periodInput),
  catalogTool('payroll.employee.history', 'Payroll history', 'Returns historical payroll facts for an employee.', 'Payroll', 'BCS HR Software'),
  catalogTool('employee.profile.get', 'Employee profile', 'Returns canonical core employee profile facts.', 'Core HR', 'Apployed / People Inc.'),
  catalogTool('employee.contract.get', 'Employment contract', 'Returns canonical employment contract facts.', 'Core HR', 'Motion'),
  catalogTool('employee.manager.get', 'Employee manager', 'Returns manager and reporting-line facts.', 'Core HR', 'Apployed / People Inc.'),
  catalogTool('organization.team.get', 'Employee team', 'Returns canonical team membership and organisation facts.', 'Core HR', 'Apployed / People Inc.'),
  catalogTool('organization.structure.get', 'Organisation structure', 'Returns an organisation hierarchy snapshot.', 'Core HR', 'BCS HR Software', emptyInput),
  catalogTool('leave.balance.get', 'Leave balance', 'Returns leave balances and entitlement facts.', 'Benefits & Leave', 'Tasper'),
  catalogTool('leave.history.get', 'Leave history', 'Returns historical leave records for an employee.', 'Benefits & Leave', 'Tasper'),
  catalogTool('benefits.enrollment.get', 'Benefit enrollment', 'Returns flexible-benefit enrollment facts.', 'Benefits & Leave', 'Tasper'),
  catalogTool('absence.case_status.get', 'Absence case status', 'Returns governed absence-case status without exposing unsupported medical inference.', 'Absence & Dossiers', 'MediSoft Dossier Manager'),
  catalogTool('absence.history.get', 'Absence history', 'Returns authorised absence history facts.', 'Absence & Dossiers', 'MediSoft Dossier Manager'),
  catalogTool('document.dossier.search', 'Dossier search', 'Searches authorised employee dossier metadata.', 'Absence & Dossiers', 'MediSoft Dossier Manager'),
  catalogTool('performance.goals.get', 'Performance goals', 'Returns active performance goals and progress facts.', 'Talent', 'Epowerhr'),
  catalogTool('performance.review.get', 'Performance review', 'Returns authorised review-cycle status and facts.', 'Talent', 'Epowerhr'),
  catalogTool('onboarding.status.get', 'Onboarding status', 'Returns onboarding workflow status and outstanding tasks.', 'Talent', 'Epowerhr'),
  catalogTool('learning.progress.get', 'Learning progress', 'Returns assigned learning and completion progress.', 'Learning', 'Online Academie / MijnLMS'),
  catalogTool('learning.certifications.get', 'Certifications', 'Returns certification status and expiry facts.', 'Learning', 'Online Academie / MijnLMS'),
  catalogTool('recruitment.candidate.get', 'Candidate', 'Returns authorised candidate and recruitment-stage facts.', 'Recruitment', 'CVWarehouse', { type: 'object', properties: { candidateId: { type: 'string' } }, required: ['candidateId'], additionalProperties: false }),
  catalogTool('recruitment.vacancies.list', 'Vacancies', 'Lists authorised vacancy facts.', 'Recruitment', 'CVWarehouse', emptyInput),
  catalogTool('engagement.feed.summary', 'Engagement summary', 'Returns communication and engagement summary facts.', 'Engagement', 'Plek'),
  catalogTool('engagement.onboarding.get', 'Engagement onboarding', 'Returns employee onboarding-journey status in the engagement platform.', 'Engagement', 'Plek'),
  catalogTool('communication.channels.list', 'Communication channels', 'Lists authorised communication spaces and channels.', 'Engagement', 'Plek', emptyInput),
  catalogTool('workforce.schedule.get', 'Work schedule', 'Returns workforce schedule facts for an employee.', 'Workforce Management', 'Timegrip'),
  catalogTool('workforce.coverage.get', 'Workforce coverage', 'Returns workforce coverage and staffing facts.', 'Workforce Management', 'Timegrip', { type: 'object', properties: { date: { type: 'string' } }, required: ['date'], additionalProperties: false }),
  catalogTool('time.entries.get', 'Time entries', 'Returns recorded time-entry facts.', 'Workforce Management', 'Timegrip'),
  catalogTool('time.exceptions.list', 'Time exceptions', 'Returns time-registration exceptions requiring attention.', 'Workforce Management', 'Timegrip'),
  catalogTool('offboarding.readiness.get', 'Offboarding readiness', 'Aggregates canonical readiness facts required before employee offboarding.', 'Cross-product Workflow', 'BCS ONE'),
  catalogTool('compliance.data_access.explain', 'Data access explanation', 'Explains the deterministic policy basis and source systems involved in an authorised access.', 'Governance', 'BCS ONE Governance'),
  catalogTool('privacy.employee_data.inventory', 'Employee data inventory', 'Returns an inventory of known employee-data categories and source systems for privacy workflows.', 'Governance', 'BCS ONE Governance')
];

app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'mcp-server', protocolVersion, toolCount: tools.length }));

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
    return res.json({ jsonrpc: '2.0', id: body.id, result: { tools } });
  }

  const requestedName = body.params?.name;
  const selectedTool = tools.find(tool => tool.name === requestedName);
  if (body.method !== 'tools/call' || !selectedTool || req.header('Mcp-Name') !== requestedName) {
    return res.status(404).json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method or tool not found' } });
  }

  const tenantId = req.header('x-bcs-tenant-id');
  if (!tenantId) {
    return res.status(403).json({ jsonrpc: '2.0', id: body.id, error: { code: -32001, message: 'Trusted tenant context missing' } });
  }

  if (requestedName !== payrollSummaryTool.name) {
    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        content: [{ type: 'text', text: 'Capability is present in the BCS ONE portfolio catalog but its synthetic adapter is not enabled in this deployment.' }],
        isError: true,
        _meta: selectedTool._meta
      }
    });
  }

  const rawArgs = { ...(body.params?.arguments ?? {}) };
  delete rawArgs.tenantId;
  delete rawArgs.tenant_id;
  const parsed = PayrollInputSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return res.status(400).json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid params', data: parsed.error.issues } });
  }

  try {
    const adapterStarted = Date.now();
    const upstream = await fetch(`${adapterUrl}/capabilities/payroll.employee_summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bcs-tenant-id': tenantId, 'x-request-id': String(body.id) },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(6_000)
    });
    const adapterDurationMs = Date.now() - adapterStarted;
    if (!upstream.ok) {
      return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Source system unavailable' }], isError: true } });
    }

    const validated = PayrollOutputSchema.safeParse(await upstream.json());
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
        isError: false,
        _meta: {
          adapterDurationMs,
          adapter: 'Reference Payroll Adapter',
          product: 'BCS HR Software',
          dataMode: 'SYNTHETIC'
        }
      }
    });
  } catch (error) {
    log.error({ error }, 'adapter invocation failed');
    return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Dependency unavailable' }], isError: true } });
  }
});

app.listen(port, () => log.info({ port, protocolVersion, toolCount: tools.length }, 'MCP server listening'));

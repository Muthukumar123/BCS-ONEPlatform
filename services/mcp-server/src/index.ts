import express from 'express';
import pino from 'pino';
import { z } from 'zod';

const app = express();
const log = pino({ name: 'mcp-server' });
const port = Number(process.env.PORT ?? 3002);
const payrollAdapterUrl = process.env.REFERENCE_PAYROLL_ADAPTER_URL ?? 'http://localhost:3003';
const portfolioAdapterUrl = process.env.REFERENCE_PORTFOLIO_ADAPTER_URL ?? 'http://localhost:3004';
const protocolVersion = '2026-07-28';

const EmployeeInputSchema = z.object({ employeeId: z.string().min(1).max(128) }).strict();
const EmployeePeriodInputSchema = z.object({ employeeId: z.string().min(1).max(128), period: z.string().regex(/^\d{4}-\d{2}$/) }).strict();
const CandidateInputSchema = z.object({ candidateId: z.string().min(1).max(128) }).strict();

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
const candidateInput = {
  type: 'object',
  properties: { candidateId: { type: 'string' } },
  required: ['candidateId'],
  additionalProperties: false
};
const emptyInput = { type: 'object', properties: {}, additionalProperties: false };

const CommonFields = {
  sourceSystem: z.string().min(1),
  freshness: z.string().min(1)
};

const PayrollOutputSchema = z.object({
  employeeId: z.string(), period: z.string(), grossAmount: z.number(), netAmount: z.number(), currency: z.string().length(3),
  lineItems: z.array(z.object({ code: z.string(), amount: z.number() })), ...CommonFields
}).strict();
const ProfileOutputSchema = z.object({
  employeeId: z.string(), displayName: z.string(), preferredName: z.string(), jobTitle: z.string(), department: z.string(),
  employmentStatus: z.string(), managerId: z.string(), ...CommonFields
}).strict();
const ContractOutputSchema = z.object({
  employeeId: z.string(), contractType: z.string(), startDate: z.string(), weeklyHours: z.number(), jobTitle: z.string(), ...CommonFields
}).strict();
const LeaveOutputSchema = z.object({
  employeeId: z.string(), unit: z.string(), entitled: z.number(), taken: z.number(), remaining: z.number(), carryOver: z.number(), ...CommonFields
}).strict();
const BenefitsOutputSchema = z.object({
  employeeId: z.string(), activeSelections: z.number(), pendingChoices: z.number(), electionWindowStatus: z.string(), ...CommonFields
}).strict();
const AbsenceOutputSchema = z.object({
  employeeId: z.string(), activeCase: z.boolean(), status: z.string(), actionRequired: z.string(), restrictedMedicalDetailIncluded: z.boolean(), ...CommonFields
}).strict();
const GoalsOutputSchema = z.object({
  employeeId: z.string(), reviewCycle: z.string(), goals: z.array(z.object({ title: z.string(), status: z.string(), progressPercent: z.number() })), ...CommonFields
}).strict();
const LearningOutputSchema = z.object({
  employeeId: z.string(), assignedCourses: z.number(), completedCourses: z.number(), completionPercent: z.number(), certificationsDue: z.number(), ...CommonFields
}).strict();
const OnboardingOutputSchema = z.object({
  employeeId: z.string(), status: z.string(), completedTasks: z.number(), totalTasks: z.number(), nextTask: z.string().nullable(), ...CommonFields
}).strict();
const EngagementOutputSchema = z.object({
  employeeId: z.string(), journeyStatus: z.string(), completionPercent: z.number(), unreadUpdates: z.number(), ...CommonFields
}).strict();
const ScheduleOutputSchema = z.object({
  employeeId: z.string(), weekStart: z.string(), scheduledHours: z.number(), shifts: z.array(z.object({ date: z.string(), start: z.string(), end: z.string(), location: z.string() })), ...CommonFields
}).strict();
const TimeEntriesOutputSchema = z.object({
  employeeId: z.string(), period: z.string(), recordedHours: z.number(), approvedHours: z.number(), exceptions: z.number(), ...CommonFields
}).strict();
const TeamOutputSchema = z.object({
  employeeId: z.string(), teamId: z.string(), teamName: z.string(), managerId: z.string(), memberCount: z.number(), ...CommonFields
}).strict();
const CandidateOutputSchema = z.object({
  candidateId: z.string(), stage: z.string(), vacancyTitle: z.string(), status: z.string(), ...CommonFields
}).strict();

type ToolStatus = 'live' | 'catalog';
type RuntimeTool = {
  input: z.ZodTypeAny;
  output: z.ZodTypeAny;
  adapterBaseUrl: string;
  endpoint: string;
  adapterName: string;
};

type ToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  _meta: Record<string, unknown>;
};

const runtimeTools = new Map<string, RuntimeTool>();
const tools: ToolDefinition[] = [];

function addTool(args: {
  name: string;
  title: string;
  description: string;
  domain: string;
  product: string;
  inputSchema?: Record<string, unknown>;
  status?: ToolStatus;
  runtime?: RuntimeTool;
}) {
  const status = args.status ?? (args.runtime ? 'live' : 'catalog');
  const tool: ToolDefinition = {
    name: args.name,
    title: args.title,
    description: args.description,
    inputSchema: args.inputSchema ?? employeeInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      'bcsone/domain': args.domain,
      'bcsone/product': args.product,
      'bcsone/status': status,
      'bcsone/dataMode': 'SYNTHETIC',
      'bcsone/adapter': args.runtime?.adapterName ?? null
    }
  };
  tools.push(tool);
  if (args.runtime) runtimeTools.set(args.name, args.runtime);
}

const portfolioRuntime = (capability: string, input: z.ZodTypeAny, output: z.ZodTypeAny, adapterName: string): RuntimeTool => ({
  input,
  output,
  adapterBaseUrl: portfolioAdapterUrl,
  endpoint: `/capabilities/${capability}`,
  adapterName
});

addTool({
  name: 'payroll.employee_summary', title: 'Employee payroll summary',
  description: 'Returns authoritative synthetic payroll summary facts for one employee and period. Read-only; does not calculate or reconcile.',
  domain: 'Payroll', product: 'BCS HR Software', inputSchema: employeePeriodInput,
  runtime: { input: EmployeePeriodInputSchema, output: PayrollOutputSchema, adapterBaseUrl: payrollAdapterUrl, endpoint: '/capabilities/payroll.employee_summary', adapterName: 'Reference Payroll Adapter' }
});
addTool({ name: 'employee.profile.get', title: 'Employee profile', description: 'Returns canonical core employee profile facts.', domain: 'Core HR', product: 'Apployed / People Inc.', runtime: portfolioRuntime('employee.profile.get', EmployeeInputSchema, ProfileOutputSchema, 'Apployed / People Inc. Reference Adapter') });
addTool({ name: 'employee.contract.get', title: 'Employment contract', description: 'Returns canonical employment contract facts.', domain: 'Core HR', product: 'Motion', runtime: portfolioRuntime('employee.contract.get', EmployeeInputSchema, ContractOutputSchema, 'Motion Reference Adapter') });
addTool({ name: 'organization.team.get', title: 'Employee team', description: 'Returns canonical team membership and organisation facts.', domain: 'Core HR', product: 'Apployed / People Inc.', runtime: portfolioRuntime('organization.team.get', EmployeeInputSchema, TeamOutputSchema, 'Apployed / People Inc. Reference Adapter') });
addTool({ name: 'leave.balance.get', title: 'Leave balance', description: 'Returns leave balances and entitlement facts.', domain: 'Benefits & Leave', product: 'Tasper', runtime: portfolioRuntime('leave.balance.get', EmployeeInputSchema, LeaveOutputSchema, 'Tasper Reference Adapter') });
addTool({ name: 'benefits.enrollment.get', title: 'Benefit enrollment', description: 'Returns flexible-benefit enrollment facts.', domain: 'Benefits & Leave', product: 'Tasper', runtime: portfolioRuntime('benefits.enrollment.get', EmployeeInputSchema, BenefitsOutputSchema, 'Tasper Reference Adapter') });
addTool({ name: 'absence.case_status.get', title: 'Absence case status', description: 'Returns governed absence-case status without exposing unsupported medical inference.', domain: 'Absence & Dossiers', product: 'MediSoft Dossier Manager', runtime: portfolioRuntime('absence.case_status.get', EmployeeInputSchema, AbsenceOutputSchema, 'MediSoft Dossier Manager Reference Adapter') });
addTool({ name: 'performance.goals.get', title: 'Performance goals', description: 'Returns active performance goals and progress facts.', domain: 'Talent', product: 'epowerhr', runtime: portfolioRuntime('performance.goals.get', EmployeeInputSchema, GoalsOutputSchema, 'epowerhr Reference Adapter') });
addTool({ name: 'learning.progress.get', title: 'Learning progress', description: 'Returns assigned learning and completion progress.', domain: 'Learning', product: 'Online Academie / MijnLMS', runtime: portfolioRuntime('learning.progress.get', EmployeeInputSchema, LearningOutputSchema, 'Online Academie / MijnLMS Reference Adapter') });
addTool({ name: 'onboarding.status.get', title: 'Onboarding status', description: 'Returns onboarding workflow status and outstanding tasks.', domain: 'Talent', product: 'epowerhr', runtime: portfolioRuntime('onboarding.status.get', EmployeeInputSchema, OnboardingOutputSchema, 'epowerhr Reference Adapter') });
addTool({ name: 'engagement.onboarding.get', title: 'Engagement onboarding', description: 'Returns employee onboarding-journey status in the engagement platform.', domain: 'Engagement', product: 'Plek', runtime: portfolioRuntime('engagement.onboarding.get', EmployeeInputSchema, EngagementOutputSchema, 'Plek Reference Adapter') });
addTool({ name: 'workforce.schedule.get', title: 'Work schedule', description: 'Returns workforce schedule facts for an employee.', domain: 'Workforce Management', product: 'Timegrip', runtime: portfolioRuntime('workforce.schedule.get', EmployeeInputSchema, ScheduleOutputSchema, 'Timegrip Reference Adapter') });
addTool({ name: 'time.entries.get', title: 'Time entries', description: 'Returns recorded time-entry facts.', domain: 'Workforce Management', product: 'Timegrip', inputSchema: employeePeriodInput, runtime: portfolioRuntime('time.entries.get', EmployeePeriodInputSchema, TimeEntriesOutputSchema, 'Timegrip Reference Adapter') });
addTool({ name: 'recruitment.candidate.get', title: 'Candidate', description: 'Returns authorised candidate and recruitment-stage facts.', domain: 'Recruitment', product: 'CVWarehouse', inputSchema: candidateInput, runtime: portfolioRuntime('recruitment.candidate.get', CandidateInputSchema, CandidateOutputSchema, 'CVWarehouse Reference Adapter') });

// Portfolio catalog: discoverable now, executable when a governed product adapter is enabled.
addTool({ name: 'payroll.payslip.get', title: 'Payslip', description: 'Retrieves payslip metadata and document reference for an employee period.', domain: 'Payroll', product: 'BCS HR Software', inputSchema: employeePeriodInput, status: 'catalog' });
addTool({ name: 'payroll.period.readiness', title: 'Payroll period readiness', description: 'Returns deterministic readiness checks and blockers for a payroll period.', domain: 'Payroll', product: 'BCS HR Software', inputSchema: periodInput, status: 'catalog' });
addTool({ name: 'payroll.exceptions.list', title: 'Payroll exceptions', description: 'Lists payroll exceptions requiring HR or payroll attention.', domain: 'Payroll', product: 'BCS HR Software', inputSchema: periodInput, status: 'catalog' });
addTool({ name: 'payroll.employee.history', title: 'Payroll history', description: 'Returns historical payroll facts for an employee.', domain: 'Payroll', product: 'BCS HR Software', status: 'catalog' });
addTool({ name: 'employee.manager.get', title: 'Employee manager', description: 'Returns manager and reporting-line facts.', domain: 'Core HR', product: 'Apployed / People Inc.', status: 'catalog' });
addTool({ name: 'organization.structure.get', title: 'Organisation structure', description: 'Returns an organisation hierarchy snapshot.', domain: 'Core HR', product: 'BCS HR Software', inputSchema: emptyInput, status: 'catalog' });
addTool({ name: 'leave.history.get', title: 'Leave history', description: 'Returns historical leave records for an employee.', domain: 'Benefits & Leave', product: 'Tasper', status: 'catalog' });
addTool({ name: 'absence.history.get', title: 'Absence history', description: 'Returns authorised absence history facts.', domain: 'Absence & Dossiers', product: 'MediSoft Dossier Manager', status: 'catalog' });
addTool({ name: 'document.dossier.search', title: 'Dossier search', description: 'Searches authorised employee dossier metadata.', domain: 'Absence & Dossiers', product: 'MediSoft Dossier Manager', status: 'catalog' });
addTool({ name: 'performance.review.get', title: 'Performance review', description: 'Returns authorised review-cycle status and facts.', domain: 'Talent', product: 'epowerhr', status: 'catalog' });
addTool({ name: 'learning.certifications.get', title: 'Certifications', description: 'Returns certification status and expiry facts.', domain: 'Learning', product: 'Online Academie / MijnLMS', status: 'catalog' });
addTool({ name: 'recruitment.vacancies.list', title: 'Vacancies', description: 'Lists authorised vacancy facts.', domain: 'Recruitment', product: 'CVWarehouse', inputSchema: emptyInput, status: 'catalog' });
addTool({ name: 'engagement.feed.summary', title: 'Engagement summary', description: 'Returns communication and engagement summary facts.', domain: 'Engagement', product: 'Plek', status: 'catalog' });
addTool({ name: 'communication.channels.list', title: 'Communication channels', description: 'Lists authorised communication spaces and channels.', domain: 'Engagement', product: 'Plek', inputSchema: emptyInput, status: 'catalog' });
addTool({ name: 'workforce.coverage.get', title: 'Workforce coverage', description: 'Returns workforce coverage and staffing facts.', domain: 'Workforce Management', product: 'Timegrip', inputSchema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'], additionalProperties: false }, status: 'catalog' });
addTool({ name: 'time.exceptions.list', title: 'Time exceptions', description: 'Returns time-registration exceptions requiring attention.', domain: 'Workforce Management', product: 'Timegrip', status: 'catalog' });
addTool({ name: 'offboarding.readiness.get', title: 'Offboarding readiness', description: 'Aggregates canonical readiness facts required before employee offboarding.', domain: 'Cross-product Workflow', product: 'BCS ONE', status: 'catalog' });
addTool({ name: 'compliance.data_access.explain', title: 'Data access explanation', description: 'Explains deterministic policy basis and source systems involved in an authorised access.', domain: 'Governance', product: 'BCS ONE Governance', status: 'catalog' });
addTool({ name: 'privacy.employee_data.inventory', title: 'Employee data inventory', description: 'Returns an inventory of known employee-data categories and source systems for privacy workflows.', domain: 'Governance', product: 'BCS ONE Governance', status: 'catalog' });

app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_req, res) => res.json({ status: 'ok', service: 'mcp-server', protocolVersion, toolCount: tools.length, liveToolCount: runtimeTools.size }));

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
  const requestId = req.header('x-request-id') ?? String(body.id ?? crypto.randomUUID());
  if (!tenantId) {
    return res.status(403).json({ jsonrpc: '2.0', id: body.id, error: { code: -32001, message: 'Trusted tenant context missing' } });
  }

  const runtime = runtimeTools.get(requestedName);
  if (!runtime) {
    return res.json({
      jsonrpc: '2.0', id: body.id,
      result: {
        content: [{ type: 'text', text: 'Capability is discoverable in the BCS ONE portfolio catalog but no executable adapter is enabled for this deployment.' }],
        isError: true,
        _meta: selectedTool._meta
      }
    });
  }

  const rawArgs = { ...(body.params?.arguments ?? {}) };
  delete rawArgs.tenantId;
  delete rawArgs.tenant_id;
  const parsed = runtime.input.safeParse(rawArgs);
  if (!parsed.success) {
    return res.status(400).json({ jsonrpc: '2.0', id: body.id, error: { code: -32602, message: 'Invalid params', data: parsed.error.issues } });
  }

  try {
    const adapterStarted = Date.now();
    const upstream = await fetch(`${runtime.adapterBaseUrl}${runtime.endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bcs-tenant-id': tenantId, 'x-request-id': requestId },
      body: JSON.stringify(parsed.data),
      signal: AbortSignal.timeout(6_000)
    });
    const adapterDurationMs = Date.now() - adapterStarted;
    if (!upstream.ok) {
      log.error({ capability: requestedName, status: upstream.status, requestId }, 'portfolio adapter returned non-success');
      return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Source system unavailable' }], isError: true, _meta: selectedTool._meta } });
    }

    const upstreamJson = await upstream.json();
    const validated = runtime.output.safeParse(upstreamJson);
    if (!validated.success) {
      log.error({ capability: requestedName, issues: validated.error.issues, requestId }, 'adapter contract violation');
      return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Upstream contract violation' }], isError: true, _meta: selectedTool._meta } });
    }

    return res.json({
      jsonrpc: '2.0', id: body.id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(validated.data) }],
        structuredContent: validated.data,
        isError: false,
        _meta: {
          ...selectedTool._meta,
          adapterDurationMs,
          adapter: runtime.adapterName,
          product: selectedTool._meta['bcsone/product'],
          capability: requestedName,
          dataMode: 'SYNTHETIC',
          outputKeys: Object.keys(validated.data as object)
        }
      }
    });
  } catch (error) {
    log.error({ error, capability: requestedName, requestId }, 'adapter invocation failed');
    return res.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Dependency unavailable' }], isError: true, _meta: selectedTool._meta } });
  }
});

app.listen(port, () => log.info({ port, protocolVersion, toolCount: tools.length, liveToolCount: runtimeTools.size }, 'MCP server listening'));

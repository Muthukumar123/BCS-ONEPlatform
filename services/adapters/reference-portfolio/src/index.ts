import express from 'express';
import pino from 'pino';
import { z } from 'zod';

const app = express();
const log = pino({ name: 'reference-portfolio' });
const port = Number(process.env.PORT ?? 3004);

app.disable('x-powered-by');
app.use(express.json({ limit: '128kb' }));

const EmployeeInput = z.object({ employeeId: z.string().min(1).max(128) }).strict();
const EmployeePeriodInput = z.object({ employeeId: z.string().min(1).max(128), period: z.string().regex(/^\d{4}-\d{2}$/) }).strict();
const CandidateInput = z.object({ candidateId: z.string().min(1).max(128) }).strict();

type Handler = (tenantId: string, input: any) => Record<string, unknown>;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bounded(seed: number, min: number, max: number): number {
  return min + (seed % (max - min + 1));
}

function syntheticName(seed: number): string {
  const first = ['Sanne', 'Daan', 'Lotte', 'Bram', 'Noor', 'Sem', 'Eva', 'Milan'][seed % 8];
  const last = ['de Vries', 'Jansen', 'Bakker', 'Smit', 'Visser', 'Meijer', 'de Boer', 'Mulder'][Math.floor(seed / 8) % 8];
  return `${first} ${last}`;
}

function common(sourceSystem: string) {
  return {
    sourceSystem,
    freshness: new Date().toISOString()
  };
}

const capabilities: Record<string, { schema: z.ZodTypeAny; handler: Handler }> = {
  'employee.profile.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:profile`);
      return {
        employeeId: input.employeeId,
        displayName: syntheticName(seed),
        preferredName: syntheticName(seed).split(' ')[0],
        jobTitle: ['Payroll Specialist', 'HR Business Partner', 'Finance Analyst', 'Operations Coordinator'][seed % 4],
        department: ['HR', 'Finance', 'Operations', 'Customer Success'][Math.floor(seed / 4) % 4],
        employmentStatus: 'ACTIVE',
        managerId: `MGR-${100 + (seed % 50)}`,
        ...common('Apployed / People Inc. reference adapter')
      };
    }
  },
  'employee.contract.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:contract`);
      return {
        employeeId: input.employeeId,
        contractType: seed % 3 === 0 ? 'FIXED_TERM' : 'PERMANENT',
        startDate: `202${bounded(seed, 0, 5)}-${String(bounded(seed >> 3, 1, 12)).padStart(2, '0')}-01`,
        weeklyHours: [32, 36, 38, 40][seed % 4],
        jobTitle: ['Payroll Specialist', 'HR Business Partner', 'Finance Analyst', 'Operations Coordinator'][seed % 4],
        ...common('Motion reference adapter')
      };
    }
  },
  'leave.balance.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:leave`);
      const entitled = bounded(seed, 24, 30);
      const taken = bounded(seed >> 4, 4, 18);
      return {
        employeeId: input.employeeId,
        unit: 'DAYS',
        entitled,
        taken,
        remaining: Math.max(0, entitled - taken),
        carryOver: bounded(seed >> 8, 0, 4),
        ...common('Tasper reference adapter')
      };
    }
  },
  'benefits.enrollment.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:benefits`);
      return {
        employeeId: input.employeeId,
        activeSelections: bounded(seed, 2, 5),
        pendingChoices: seed % 4 === 0 ? 1 : 0,
        electionWindowStatus: seed % 4 === 0 ? 'ACTION_REQUIRED' : 'COMPLETE',
        ...common('Tasper reference adapter')
      };
    }
  },
  'absence.case_status.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:absence`);
      const active = seed % 5 === 0;
      return {
        employeeId: input.employeeId,
        activeCase: active,
        status: active ? 'OPEN' : 'NONE',
        actionRequired: active ? 'HR_REVIEW' : 'NONE',
        restrictedMedicalDetailIncluded: false,
        ...common('MediSoft Dossier Manager reference adapter')
      };
    }
  },
  'performance.goals.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:performance`);
      return {
        employeeId: input.employeeId,
        reviewCycle: '2026',
        goals: [
          { title: 'Improve process quality', status: 'ON_TRACK', progressPercent: bounded(seed, 55, 90) },
          { title: 'Develop role expertise', status: seed % 4 === 0 ? 'AT_RISK' : 'ON_TRACK', progressPercent: bounded(seed >> 4, 45, 88) }
        ],
        ...common('epowerhr reference adapter')
      };
    }
  },
  'learning.progress.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:learning`);
      const assigned = bounded(seed, 3, 8);
      const completed = bounded(seed >> 3, 1, assigned);
      return {
        employeeId: input.employeeId,
        assignedCourses: assigned,
        completedCourses: completed,
        completionPercent: Math.round((completed / assigned) * 100),
        certificationsDue: seed % 6 === 0 ? 1 : 0,
        ...common('Online Academie / MijnLMS reference adapter')
      };
    }
  },
  'onboarding.status.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:onboarding`);
      const totalTasks = 12;
      const completedTasks = bounded(seed, 7, 12);
      return {
        employeeId: input.employeeId,
        status: completedTasks === totalTasks ? 'COMPLETE' : 'IN_PROGRESS',
        completedTasks,
        totalTasks,
        nextTask: completedTasks === totalTasks ? null : 'Manager check-in',
        ...common('epowerhr reference adapter')
      };
    }
  },
  'engagement.onboarding.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:engagement`);
      const completionPercent = bounded(seed, 70, 100);
      return {
        employeeId: input.employeeId,
        journeyStatus: completionPercent === 100 ? 'COMPLETE' : 'ACTIVE',
        completionPercent,
        unreadUpdates: bounded(seed >> 5, 0, 3),
        ...common('Plek reference adapter')
      };
    }
  },
  'workforce.schedule.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:schedule`);
      const scheduledHours = [32, 36, 38, 40][seed % 4];
      return {
        employeeId: input.employeeId,
        weekStart: '2026-09-07',
        scheduledHours,
        shifts: [
          { date: '2026-09-07', start: '09:00', end: '17:00', location: 'Office' },
          { date: '2026-09-08', start: '09:00', end: '17:00', location: seed % 2 === 0 ? 'Office' : 'Remote' }
        ],
        ...common('Timegrip reference adapter')
      };
    }
  },
  'time.entries.get': {
    schema: EmployeePeriodInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:${input.period}:time`);
      const recordedHours = bounded(seed, 132, 176);
      const exceptions = seed % 5 === 0 ? 1 : 0;
      return {
        employeeId: input.employeeId,
        period: input.period,
        recordedHours,
        approvedHours: Math.max(0, recordedHours - (exceptions ? 8 : 0)),
        exceptions,
        ...common('Timegrip reference adapter')
      };
    }
  },
  'organization.team.get': {
    schema: EmployeeInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.employeeId}:team`);
      return {
        employeeId: input.employeeId,
        teamId: `TEAM-${bounded(seed, 10, 99)}`,
        teamName: ['People Operations', 'Payroll Services', 'Finance Operations', 'Customer Operations'][seed % 4],
        managerId: `MGR-${100 + (seed % 50)}`,
        memberCount: bounded(seed >> 6, 5, 15),
        ...common('Apployed / People Inc. reference adapter')
      };
    }
  },
  'recruitment.candidate.get': {
    schema: CandidateInput,
    handler: (tenantId, input) => {
      const seed = hash(`${tenantId}:${input.candidateId}:candidate`);
      return {
        candidateId: input.candidateId,
        stage: ['INTERVIEW', 'OFFER', 'HIRED'][seed % 3],
        vacancyTitle: ['Payroll Consultant', 'HR Consultant', 'Implementation Consultant'][seed % 3],
        status: seed % 3 === 2 ? 'READY_FOR_HR_HANDOFF' : 'ACTIVE',
        ...common('CVWarehouse reference adapter')
      };
    }
  }
};

app.get('/healthz', (_req, res) => res.json({
  status: 'ok',
  service: 'reference-portfolio',
  capabilityCount: Object.keys(capabilities).length,
  dataMode: 'SYNTHETIC'
}));

app.post('/capabilities/:capability', (req, res) => {
  const tenantId = req.header('x-bcs-tenant-id');
  const requestId = req.header('x-request-id') ?? crypto.randomUUID();
  if (!tenantId) return res.status(403).json({ code: 'TRUSTED_TENANT_REQUIRED', requestId });

  const definition = capabilities[req.params.capability];
  if (!definition) return res.status(404).json({ code: 'CAPABILITY_NOT_FOUND', requestId });
  const parsed = definition.schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: 'VALIDATION_ERROR', issues: parsed.error.issues, requestId });

  try {
    const result = definition.handler(tenantId, parsed.data);
    return res.json(result);
  } catch (error) {
    log.error({ error, requestId, capability: req.params.capability }, 'reference capability failed');
    return res.status(500).json({ code: 'REFERENCE_CAPABILITY_FAILED', requestId });
  }
});

app.listen(port, () => log.info({ port, capabilityCount: Object.keys(capabilities).length }, 'reference portfolio adapter listening'));

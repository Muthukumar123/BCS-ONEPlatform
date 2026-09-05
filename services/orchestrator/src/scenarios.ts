export type ScenarioInput = {
  employeeId: string;
  period: string;
  candidateId?: string;
  explain: boolean;
  threadId?: string;
};

export type ScenarioTool = {
  capability: string;
  title: string;
  product: string;
  domain: string;
  agent: string;
  artifactType: string;
  classification: 'operational' | 'confidential' | 'restricted';
  resourceType: string;
  args: (input: ScenarioInput) => Record<string, unknown>;
};

export type ScenarioDefinition = {
  id: string;
  title: string;
  category: string;
  mode: 'single-mcp' | 'multi-mcp';
  description: string;
  businessQuestion: string;
  valueStatement: string;
  tools: ScenarioTool[];
};

const employee = (input: ScenarioInput) => ({ employeeId: input.employeeId });
const employeePeriod = (input: ScenarioInput) => ({ employeeId: input.employeeId, period: input.period });
const candidate = (input: ScenarioInput) => ({ candidateId: input.candidateId ?? 'CAND-1001' });

const profile: ScenarioTool = { capability: 'employee.profile.get', title: 'Employee profile', product: 'Apployed / People Inc.', domain: 'Core HR', agent: 'core-hr-agent', artifactType: 'employee_profile', classification: 'confidential', resourceType: 'employee_profile', args: employee };
const contract: ScenarioTool = { capability: 'employee.contract.get', title: 'Employment contract', product: 'Motion', domain: 'Core HR', agent: 'core-hr-agent', artifactType: 'employment_contract', classification: 'restricted', resourceType: 'employee_contract', args: employee };
const payroll: ScenarioTool = { capability: 'payroll.employee_summary', title: 'Payroll summary', product: 'BCS HR Software', domain: 'Payroll', agent: 'payroll-agent', artifactType: 'payroll_summary', classification: 'restricted', resourceType: 'employee_payroll', args: employeePeriod };
const leave: ScenarioTool = { capability: 'leave.balance.get', title: 'Leave balance', product: 'Tasper', domain: 'Benefits & Leave', agent: 'benefits-agent', artifactType: 'leave_balance', classification: 'confidential', resourceType: 'employee_leave', args: employee };
const benefits: ScenarioTool = { capability: 'benefits.enrollment.get', title: 'Benefits enrollment', product: 'Tasper', domain: 'Benefits & Leave', agent: 'benefits-agent', artifactType: 'benefit_enrollment', classification: 'confidential', resourceType: 'employee_benefits', args: employee };
const absence: ScenarioTool = { capability: 'absence.case_status.get', title: 'Absence case status', product: 'MediSoft Dossier Manager', domain: 'Absence & Dossiers', agent: 'absence-agent', artifactType: 'absence_case_status', classification: 'restricted', resourceType: 'employee_absence', args: employee };
const goals: ScenarioTool = { capability: 'performance.goals.get', title: 'Performance goals', product: 'epowerhr', domain: 'Talent', agent: 'talent-agent', artifactType: 'performance_goals', classification: 'confidential', resourceType: 'employee_performance', args: employee };
const learning: ScenarioTool = { capability: 'learning.progress.get', title: 'Learning progress', product: 'Online Academie / MijnLMS', domain: 'Learning', agent: 'learning-agent', artifactType: 'learning_progress', classification: 'confidential', resourceType: 'employee_learning', args: employee };
const onboarding: ScenarioTool = { capability: 'onboarding.status.get', title: 'Onboarding status', product: 'epowerhr', domain: 'Talent', agent: 'talent-agent', artifactType: 'onboarding_status', classification: 'confidential', resourceType: 'employee_onboarding', args: employee };
const engagement: ScenarioTool = { capability: 'engagement.onboarding.get', title: 'Engagement onboarding', product: 'Plek', domain: 'Engagement', agent: 'engagement-agent', artifactType: 'engagement_onboarding', classification: 'confidential', resourceType: 'employee_engagement', args: employee };
const schedule: ScenarioTool = { capability: 'workforce.schedule.get', title: 'Work schedule', product: 'Timegrip', domain: 'Workforce Management', agent: 'workforce-agent', artifactType: 'work_schedule', classification: 'confidential', resourceType: 'employee_schedule', args: employee };
const timeEntries: ScenarioTool = { capability: 'time.entries.get', title: 'Time entries', product: 'Timegrip', domain: 'Workforce Management', agent: 'workforce-agent', artifactType: 'time_entries', classification: 'confidential', resourceType: 'employee_time', args: employeePeriod };
const team: ScenarioTool = { capability: 'organization.team.get', title: 'Team context', product: 'Apployed / People Inc.', domain: 'Core HR', agent: 'core-hr-agent', artifactType: 'team_context', classification: 'confidential', resourceType: 'organization_team', args: employee };
const recruitment: ScenarioTool = { capability: 'recruitment.candidate.get', title: 'Candidate handoff', product: 'CVWarehouse', domain: 'Recruitment', agent: 'recruitment-agent', artifactType: 'candidate_handoff', classification: 'confidential', resourceType: 'recruitment_candidate', args: candidate };

export const scenarios: ScenarioDefinition[] = [
  {
    id: 'single-payroll-summary', title: 'Single MCP · Payroll Summary', category: 'MCP Fundamentals', mode: 'single-mcp',
    description: 'Proves one governed MCP tools/call from BCS ONE to the payroll adapter with strict structured output.',
    businessQuestion: 'Show the payroll summary for this employee and explain the source facts.',
    valueStatement: 'Demonstrates the canonical MCP contract, deterministic policy gate, source provenance and optional grounded LLM explanation with exactly one MCP call.',
    tools: [payroll]
  },
  {
    id: 'employee-360', title: 'Multi MCP · Employee 360', category: 'Cross-product Federation', mode: 'multi-mcp',
    description: 'Fans out across core HR, payroll, leave, talent, learning and workforce products, then synthesizes one governed employee view.',
    businessQuestion: 'Prepare a 360-degree employee briefing using authoritative facts from the BCS portfolio.',
    valueStatement: 'Shows why BCS ONE matters after acquisitions: one stable agent workflow can retrieve structured facts from six product domains without vendor-specific model coupling.',
    tools: [profile, payroll, leave, goals, learning, schedule]
  },
  {
    id: 'manager-meeting-prep', title: 'Manager Meeting Preparation', category: 'HR Service', mode: 'multi-mcp',
    description: 'Combines employee profile, team context, absence status, goals and learning progress for an HR/manager meeting.',
    businessQuestion: 'Prepare me for an employee meeting and highlight only evidence-backed items that need attention.',
    valueStatement: 'Demonstrates multi-agent coordination and evidence aggregation while keeping restricted absence data governed.',
    tools: [profile, team, absence, goals, learning]
  },
  {
    id: 'onboarding-control-tower', title: 'Onboarding Control Tower', category: 'Employee Journey', mode: 'multi-mcp',
    description: 'Cross-checks core HR, contract, talent onboarding, engagement onboarding and learning readiness.',
    businessQuestion: 'Is this employee fully onboarded across BCS systems, and what remains incomplete?',
    valueStatement: 'Reconciles onboarding state across Motion, epowerhr, Plek and MijnLMS without duplicating those systems of record.',
    tools: [profile, contract, onboarding, engagement, learning]
  },
  {
    id: 'workforce-day-view', title: 'Workforce Day View', category: 'Workforce Operations', mode: 'multi-mcp',
    description: 'Combines employee profile, Timegrip schedule, recorded time and Tasper leave balance.',
    businessQuestion: 'Show current workforce context for this employee and identify schedule or time-registration issues.',
    valueStatement: 'Shows a practical BCS/Timegrip cross-product flow with live structured MCP calls and a unified operational result.',
    tools: [profile, schedule, timeEntries, leave]
  },
  {
    id: 'leave-absence-context', title: 'Leave & Absence Context', category: 'HR Service', mode: 'multi-mcp',
    description: 'Combines Tasper leave, MediSoft absence case status and Timegrip schedule without exposing medical inference.',
    businessQuestion: 'Give HR the permitted leave, absence and scheduling context for this employee.',
    valueStatement: 'Demonstrates policy-first access to sensitive HR domains and how MCP standardizes facts from specialist products.',
    tools: [leave, absence, schedule]
  },
  {
    id: 'offboarding-readiness', title: 'Offboarding Readiness', category: 'Employee Journey', mode: 'multi-mcp',
    description: 'Checks contract, payroll, benefits, learning and time facts required before an offboarding workflow can proceed.',
    businessQuestion: 'Is the employee ready for offboarding and which source systems still show outstanding items?',
    valueStatement: 'Demonstrates a cross-product readiness pattern suitable for later propose → approve → re-authorize → execute workflows.',
    tools: [contract, payroll, benefits, learning, timeEntries]
  },
  {
    id: 'recruitment-to-onboarding', title: 'Recruitment → Onboarding Handoff', category: 'Employee Journey', mode: 'multi-mcp',
    description: 'Correlates CVWarehouse recruitment handoff with epowerhr, Plek and MijnLMS onboarding state.',
    businessQuestion: 'Show whether the candidate-to-employee handoff has propagated through the onboarding ecosystem.',
    valueStatement: 'Visualizes the value of a canonical integration layer spanning recruitment and post-hire products.',
    tools: [recruitment, onboarding, engagement, learning]
  }
];

export function scenarioById(id: string): ScenarioDefinition | undefined {
  return scenarios.find(scenario => scenario.id === id);
}

export function publicScenario(definition: ScenarioDefinition) {
  return {
    id: definition.id,
    title: definition.title,
    category: definition.category,
    mode: definition.mode,
    description: definition.description,
    businessQuestion: definition.businessQuestion,
    valueStatement: definition.valueStatement,
    mcpCallCount: definition.tools.length,
    tools: definition.tools.map(tool => ({
      capability: tool.capability,
      title: tool.title,
      product: tool.product,
      domain: tool.domain,
      agent: tool.agent
    }))
  };
}

export type SyntheticEmployer = {
  id: string;
  name: string;
  sector: string;
  start: number;
  end: number;
  employeeCount: number;
};

export type SyntheticEmployee = {
  employeeId: string;
  displayName: string;
  preferredName: string;
  jobTitle: string;
  department: string;
  managerId: string;
  employerId: string;
  employerName: string;
  employerSector: string;
  dataMode: 'SYNTHETIC';
};

const employerDefinitions = [
  { id: 'SYN-NL-001', name: 'NorthSea Logistics BV', sector: 'Logistics', start: 1, end: 3000 },
  { id: 'SYN-NL-002', name: 'Delta Retail Group', sector: 'Retail', start: 3001, end: 5500 },
  { id: 'SYN-NL-003', name: 'Tulip Care Services', sector: 'Professional Services', start: 5501, end: 7500 },
  { id: 'SYN-NL-004', name: 'OrangeWorks Manufacturing', sector: 'Manufacturing', start: 7501, end: 9000 },
  { id: 'SYN-NL-005', name: 'CanalTech Services', sector: 'Technology Services', start: 9001, end: 10000 }
] as const;

export const syntheticEmployers: SyntheticEmployer[] = employerDefinitions.map(item => ({
  ...item,
  employeeCount: item.end - item.start + 1
}));

export const syntheticEmployeeCount = syntheticEmployers.reduce((sum, employer) => sum + employer.employeeCount, 0);

const firstNames = ['Sanne', 'Daan', 'Lotte', 'Bram', 'Noor', 'Sem', 'Eva', 'Milan'];
const lastNames = ['de Vries', 'Jansen', 'Bakker', 'Smit', 'Visser', 'Meijer', 'de Boer', 'Mulder'];
const jobTitles = ['Payroll Specialist', 'HR Business Partner', 'Finance Analyst', 'Operations Coordinator'];
const departments = ['HR', 'Finance', 'Operations', 'Customer Success'];

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function employerForIndex(index: number): SyntheticEmployer {
  return syntheticEmployers.find(employer => index >= employer.start && index <= employer.end) ?? syntheticEmployers[0]!;
}

export function employeeIndex(employeeId: string): number | undefined {
  const match = employeeId.match(/(\d+)$/);
  if (!match) return undefined;
  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 1 && index <= syntheticEmployeeCount ? index : undefined;
}

export function syntheticEmployee(tenantId: string, index: number): SyntheticEmployee {
  const boundedIndex = Math.min(Math.max(Math.trunc(index), 1), syntheticEmployeeCount);
  const employeeId = `EMP-${boundedIndex}`;
  // Keep the profile seed identical to the reference portfolio adapter so the
  // directory selection and employee.profile.get return the same core identity.
  const seed = hash(`${tenantId}:${employeeId}:profile`);
  const first = firstNames[seed % firstNames.length]!;
  const last = lastNames[Math.floor(seed / firstNames.length) % lastNames.length]!;
  const employer = employerForIndex(boundedIndex);
  return {
    employeeId,
    displayName: `${first} ${last}`,
    preferredName: first,
    jobTitle: jobTitles[seed % jobTitles.length]!,
    department: departments[Math.floor(seed / 4) % departments.length]!,
    managerId: `MGR-${100 + (seed % 50)}`,
    employerId: employer.id,
    employerName: employer.name,
    employerSector: employer.sector,
    dataMode: 'SYNTHETIC'
  };
}

export function syntheticEmployeeById(tenantId: string, employeeId: string): SyntheticEmployee | undefined {
  const index = employeeIndex(employeeId);
  return index ? syntheticEmployee(tenantId, index) : undefined;
}

export function searchSyntheticWorkforce(input: {
  tenantId: string;
  employerId?: string;
  query?: string;
  limit?: number;
}): SyntheticEmployee[] {
  const employer = input.employerId ? syntheticEmployers.find(item => item.id === input.employerId) : undefined;
  const start = employer?.start ?? 1;
  const end = employer?.end ?? syntheticEmployeeCount;
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 12), 1), 50);
  const query = (input.query ?? '').trim().toLowerCase();
  const direct = query.match(/(?:emp-)?(\d+)$/i);
  if (direct) {
    const index = Number(direct[1]);
    if (index >= start && index <= end) return [syntheticEmployee(input.tenantId, index)];
  }

  const results: SyntheticEmployee[] = [];
  for (let index = start; index <= end && results.length < limit; index += 1) {
    const employee = syntheticEmployee(input.tenantId, index);
    const haystack = `${employee.employeeId} ${employee.displayName} ${employee.jobTitle} ${employee.department} ${employee.managerId}`.toLowerCase();
    if (!query || haystack.includes(query)) results.push(employee);
  }
  return results;
}

export function workforceOverview() {
  return {
    dataMode: 'SYNTHETIC' as const,
    totalEmployees: syntheticEmployeeCount,
    employerCount: syntheticEmployers.length,
    employers: syntheticEmployers.map(({ id, name, sector, employeeCount }) => ({ id, name, sector, employeeCount })),
    semantics: 'Deterministic virtual workforce for live integration and AI execution testing; no production customer records.'
  };
}

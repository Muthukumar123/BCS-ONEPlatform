export type SecurityContext = {
  tenantId: string;
  userId: string;
  roles: string[];
  purpose: string;
  requestId: string;
};

export type WorkflowEvent = {
  requestId: string;
  runId: string;
  threadId: string;
  timestamp: string;
  elapsedMs: number;
  sequence: number;
  stage: string;
  event: string;
  status: string;
  type?: 'event' | 'result' | 'complete' | 'error';
  agent?: string;
  message?: string;
  tool?: string;
  capability?: string;
  product?: string;
  sourceSystem?: string;
  durationMs?: number;
  artifactId?: string;
  nodeId?: string;
  parentNodeId?: string;
  lane?: 'control' | 'governance' | 'mcp' | 'data' | 'ai';
  callId?: string;
  mcpCallIndex?: number;
  mcpCallTotal?: number;
  inputKeys?: string[];
  outputShape?: string[];
  payload?: unknown;
};

export type EventSink = (event: WorkflowEvent) => void | Promise<void>;

export type AgentArtifact = {
  artifactId: string;
  runId: string;
  threadId: string;
  tenantId: string;
  producerAgent: string;
  artifactType: string;
  classification: 'operational' | 'confidential' | 'restricted';
  sourceSystem?: string;
  capability?: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type RunRecord = {
  runId: string;
  threadId: string;
  requestId: string;
  tenantId: string;
  userId: string;
  workflowType: string;
  scenarioId?: string;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  currentNode?: string;
  purpose: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  finalArtifactId?: string;
  explanationArtifactId?: string;
  errorCode?: string;
};

export type PayrollFacts = {
  employeeId: string;
  period: string;
  grossAmount: number;
  netAmount: number;
  currency: string;
  lineItems: Array<{ code: string; amount: number }>;
  sourceSystem: string;
  freshness: string;
};

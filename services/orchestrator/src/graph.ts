import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { explainGroundedFacts } from './azure-openai.js';
import { authorizeEmployeePayroll, callPayrollSummaryMcp } from './dependencies.js';
import type { RuntimePersistence } from './persistence.js';
import type { EventSink, PayrollFacts, SecurityContext, WorkflowEvent } from './runtime-types.js';

const PayrollGraphState = Annotation.Root({
  employeeId: Annotation<string>(),
  period: Annotation<string>(),
  explain: Annotation<boolean>(),
  policyAllowed: Annotation<boolean | undefined>(),
  policyReason: Annotation<string | undefined>(),
  selectedCapability: Annotation<string | undefined>(),
  factsArtifactId: Annotation<string | undefined>(),
  explanationArtifactId: Annotation<string | undefined>(),
  status: Annotation<'running' | 'completed' | 'failed'>(),
  errorCode: Annotation<string | undefined>()
});

type ExecuteInput = {
  employeeId: string;
  period: string;
  explain: boolean;
};

type ExecuteResult = {
  status: number;
  payload: {
    requestId: string;
    runId: string;
    threadId: string;
    status: string;
    facts?: PayrollFacts;
    explanation?: string;
    code?: string;
  };
};

export async function executePayrollGraph(args: {
  input: ExecuteInput;
  context: SecurityContext;
  persistence: RuntimePersistence;
  runId: string;
  threadId: string;
  sink?: EventSink;
}): Promise<ExecuteResult> {
  const { input, context, persistence, runId, threadId, sink } = args;
  const startedAt = Date.now();
  let sequence = 0;

  const emit = async (
    stage: string,
    event: string,
    status: string,
    extra: Partial<WorkflowEvent> = {}
  ): Promise<void> => {
    const workflowEvent: WorkflowEvent = {
      requestId: context.requestId,
      runId,
      threadId,
      timestamp: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      sequence: ++sequence,
      stage,
      event,
      status,
      type: 'event',
      ...extra
    };
    await persistence.appendEvent(context.tenantId, workflowEvent);
    await sink?.(workflowEvent);
  };

  await persistence.createRun(context, runId, threadId, 'employee-payroll-summary');

  const policyNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'policy' });
    const nodeStarted = Date.now();
    await emit('policy', 'policy.evaluate', 'started', {
      agent: 'governance',
      message: `${context.purpose} · read employee_payroll`
    });
    const decision = await authorizeEmployeePayroll(context, input.employeeId);
    await emit('policy', 'policy.decision', decision.allow ? 'allowed' : 'denied', {
      agent: 'governance',
      durationMs: Date.now() - nodeStarted,
      message: decision.reason ?? (decision.allow ? 'allowed' : 'deny-by-default')
    });
    return { policyAllowed: decision.allow, policyReason: decision.reason };
  };

  const supervisorNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'supervisor' });
    await emit('orchestrator', 'supervisor.plan.started', 'started', {
      agent: 'supervisor',
      message: 'Plan canonical capability execution; product routing remains outside the model.'
    });
    await emit('orchestrator', 'supervisor.plan.completed', 'completed', {
      agent: 'supervisor',
      durationMs: 0,
      tool: 'payroll.employee_summary',
      message: 'Delegated payroll fact retrieval to Payroll Agent.'
    });
    return { selectedCapability: 'payroll.employee_summary' };
  };

  const payrollAgentNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'payroll_agent' });
    const mcpStarted = Date.now();
    await emit('mcp', 'tools/call.started', 'started', {
      agent: 'payroll-agent',
      tool: 'payroll.employee_summary',
      message: 'MCP 2026-07-28 canonical capability invocation'
    });

    const result = await callPayrollSummaryMcp(context, input.employeeId, input.period);
    const artifactId = await persistence.putArtifact({
      runId,
      threadId,
      tenantId: context.tenantId,
      producerAgent: 'payroll-agent',
      artifactType: 'payroll_summary',
      classification: 'restricted',
      sourceSystem: result.facts.sourceSystem,
      capability: 'payroll.employee_summary',
      payload: result.facts as unknown as Record<string, unknown>
    });

    await emit('adapter', 'adapter.roundtrip', 'completed', {
      agent: 'payroll-agent',
      durationMs: result.adapterDurationMs,
      artifactId,
      message: result.adapter ?? 'Reference Payroll Adapter'
    });
    await emit('source', 'source.facts.persisted', 'completed', {
      agent: 'payroll-agent',
      artifactId,
      message: result.facts.sourceSystem
    });
    await emit('mcp', 'tools/call.completed', 'completed', {
      agent: 'payroll-agent',
      tool: 'payroll.employee_summary',
      durationMs: Date.now() - mcpStarted,
      artifactId,
      message: 'Structured output validated and persisted as a governed artifact.'
    });
    await emit('orchestrator', 'agent.handoff', 'completed', {
      agent: 'payroll-agent',
      artifactId,
      message: 'Payroll Agent shared an artifact reference with the supervisor; hidden reasoning is not shared.'
    });
    return { factsArtifactId: artifactId };
  };

  const explanationAgentNode = async (state: typeof PayrollGraphState.State) => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'explanation_agent' });
    if (!input.explain) {
      await emit('ai', 'model.explain.skipped', 'skipped', {
        agent: 'explanation-agent',
        message: 'explain=false'
      });
      return {};
    }
    if (!state.factsArtifactId) throw new Error('FACTS_ARTIFACT_MISSING');
    const artifact = await persistence.getArtifact(context.tenantId, state.factsArtifactId);
    if (!artifact) throw new Error('FACTS_ARTIFACT_NOT_FOUND');

    const aiStarted = Date.now();
    await emit('ai', 'model.explain.started', 'started', {
      agent: 'explanation-agent',
      artifactId: state.factsArtifactId,
      message: 'Grounded explanation from persisted source facts.'
    });
    const explanation = await explainGroundedFacts(artifact.payload);
    if (!explanation) throw new Error('MODEL_RETURNED_NO_EXPLANATION');

    const explanationArtifactId = await persistence.putArtifact({
      runId,
      threadId,
      tenantId: context.tenantId,
      producerAgent: 'explanation-agent',
      artifactType: 'grounded_explanation',
      classification: 'confidential',
      sourceSystem: artifact.sourceSystem,
      capability: 'ai.payroll_explain',
      payload: { text: explanation, groundedOnArtifactId: state.factsArtifactId }
    });
    await emit('ai', 'model.explain.completed', 'completed', {
      agent: 'explanation-agent',
      durationMs: Date.now() - aiStarted,
      artifactId: explanationArtifactId,
      message: 'Explanation persisted separately from authoritative payroll facts.'
    });
    return { explanationArtifactId };
  };

  const completeNode = async (state: typeof PayrollGraphState.State) => {
    await persistence.updateRun(context.tenantId, runId, {
      status: 'completed',
      currentNode: 'complete',
      finalArtifactId: state.factsArtifactId,
      explanationArtifactId: state.explanationArtifactId
    });
    return { status: 'completed' as const };
  };

  const deniedNode = async () => {
    await persistence.updateRun(context.tenantId, runId, {
      status: 'failed',
      currentNode: 'policy_denied',
      errorCode: 'AUTH_DENIED'
    });
    return { status: 'failed' as const, errorCode: 'AUTH_DENIED' };
  };

  const graph = new StateGraph(PayrollGraphState)
    .addNode('policy', policyNode)
    .addNode('supervisor', supervisorNode)
    .addNode('payroll_agent', payrollAgentNode)
    .addNode('explanation_agent', explanationAgentNode)
    .addNode('complete', completeNode)
    .addNode('denied', deniedNode)
    .addEdge(START, 'policy')
    .addConditionalEdges('policy', state => state.policyAllowed === true ? 'supervisor' : 'denied', ['supervisor', 'denied'])
    .addEdge('supervisor', 'payroll_agent')
    .addEdge('payroll_agent', 'explanation_agent')
    .addEdge('explanation_agent', 'complete')
    .addEdge('complete', END)
    .addEdge('denied', END)
    .compile({ checkpointer: persistence.checkpointer });

  try {
    const state = await graph.invoke(
      {
        employeeId: input.employeeId,
        period: input.period,
        explain: input.explain,
        status: 'running'
      },
      {
        configurable: {
          thread_id: `${context.tenantId}:${threadId}`,
          checkpoint_ns: 'employee-payroll-summary-v1'
        }
      }
    );

    if (state.errorCode === 'AUTH_DENIED') {
      await emit('orchestrator', 'workflow.completed', 'failed', {
        type: 'error',
        agent: 'supervisor',
        message: 'Authorization denied before MCP execution.'
      });
      return {
        status: 403,
        payload: { requestId: context.requestId, runId, threadId, status: 'DENIED', code: 'AUTH_DENIED' }
      };
    }

    if (!state.factsArtifactId) throw new Error('FACTS_ARTIFACT_MISSING');
    const factsArtifact = await persistence.getArtifact(context.tenantId, state.factsArtifactId);
    if (!factsArtifact) throw new Error('FACTS_ARTIFACT_NOT_FOUND');
    const facts = factsArtifact.payload as unknown as PayrollFacts;

    let explanation: string | undefined;
    if (state.explanationArtifactId) {
      const explanationArtifact = await persistence.getArtifact(context.tenantId, state.explanationArtifactId);
      explanation = typeof explanationArtifact?.payload?.text === 'string' ? explanationArtifact.payload.text : undefined;
    }

    const payload = {
      requestId: context.requestId,
      runId,
      threadId,
      status: 'FULL',
      facts,
      explanation
    };
    await emit('orchestrator', 'workflow.result', 'completed', {
      type: 'result',
      agent: 'supervisor',
      artifactId: state.factsArtifactId,
      payload,
      message: 'Governed result assembled from persisted artifact references.'
    });
    await emit('orchestrator', 'workflow.completed', 'completed', {
      type: 'complete',
      agent: 'supervisor',
      durationMs: Date.now() - startedAt,
      message: 'Durable workflow complete.'
    });
    return { status: 200, payload };
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEPENDENCY_UNAVAILABLE';
    await persistence.updateRun(context.tenantId, runId, {
      status: 'failed',
      currentNode: 'failed',
      errorCode: code
    });
    await emit('orchestrator', 'workflow.completed', 'failed', {
      type: 'error',
      agent: 'supervisor',
      message: code
    });
    return {
      status: 503,
      payload: { requestId: context.requestId, runId, threadId, status: 'FAILED', code: 'DEPENDENCY_UNAVAILABLE' }
    };
  }
}

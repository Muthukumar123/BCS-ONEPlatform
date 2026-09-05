import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { synthesizeGroundedArtifacts } from './azure-openai.js';
import { authorizeRead, callMcpTool } from './dependencies.js';
import type { RuntimePersistence } from './persistence.js';
import type { EventSink, SecurityContext, WorkflowEvent } from './runtime-types.js';
import type { ScenarioDefinition, ScenarioInput } from './scenarios.js';

const ScenarioState = Annotation.Root({
  scenarioId: Annotation<string>(),
  employeeId: Annotation<string>(),
  period: Annotation<string>(),
  candidateId: Annotation<string | undefined>(),
  explain: Annotation<boolean>(),
  policyAllowed: Annotation<boolean | undefined>(),
  artifactRefs: Annotation<Record<string, string>>({
    reducer: (left, right) => ({ ...(left ?? {}), ...(right ?? {}) }),
    default: () => ({})
  }),
  synthesisArtifactId: Annotation<string | undefined>(),
  status: Annotation<'running' | 'completed' | 'failed'>(),
  errorCode: Annotation<string | undefined>()
});

export type ScenarioExecutionResult = {
  status: number;
  payload: Record<string, unknown>;
};

export async function executeScenarioGraph(args: {
  scenario: ScenarioDefinition;
  input: ScenarioInput;
  context: SecurityContext;
  persistence: RuntimePersistence;
  runId: string;
  threadId: string;
  sink?: EventSink;
}): Promise<ScenarioExecutionResult> {
  const { scenario, input, context, persistence, runId, threadId, sink } = args;
  const startedAt = Date.now();
  let sequence = 0;
  let emitChain = Promise.resolve();

  const emit = (
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
    emitChain = emitChain.then(async () => {
      await persistence.appendEvent(context.tenantId, workflowEvent);
      await sink?.(workflowEvent);
    });
    return emitChain;
  };

  await persistence.createRun(context, runId, threadId, 'scenario', scenario.id);

  const policyNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'policy' });
    const policyStarted = Date.now();
    await emit('policy', 'scenario.policy.started', 'started', {
      agent: 'governance', nodeId: 'policy:scenario', parentNodeId: 'request', lane: 'governance',
      message: `${scenario.id} · ${context.purpose}`
    });
    const decision = await authorizeRead(context, { type: 'employee_context', id: input.employeeId, ownerUserId: input.employeeId });
    await emit('policy', 'scenario.policy.completed', decision.allow ? 'allowed' : 'denied', {
      agent: 'governance', nodeId: 'policy:scenario', parentNodeId: 'request', lane: 'governance',
      durationMs: Date.now() - policyStarted,
      message: decision.reason ?? (decision.allow ? 'allowed' : 'deny-by-default')
    });
    return { policyAllowed: decision.allow };
  };

  const supervisorNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'supervisor' });
    await emit('orchestrator', 'supervisor.plan.started', 'started', {
      agent: 'supervisor', nodeId: 'supervisor', parentNodeId: 'policy:scenario', lane: 'control',
      mcpCallTotal: scenario.tools.length,
      message: `Building ${scenario.mode} execution plan for ${scenario.tools.length} canonical MCP call${scenario.tools.length === 1 ? '' : 's'}.`
    });
    await emit('orchestrator', 'supervisor.plan.completed', 'completed', {
      agent: 'supervisor', nodeId: 'supervisor', parentNodeId: 'policy:scenario', lane: 'control',
      mcpCallTotal: scenario.tools.length,
      outputShape: scenario.tools.map(tool => tool.capability),
      message: 'Product routing is resolved by the MCP capability layer, not encoded in the LLM prompt.'
    });
    return {};
  };

  const federationNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'mcp_federation' });
    await emit('orchestrator', 'federation.started', 'started', {
      agent: 'supervisor', nodeId: 'federation', parentNodeId: 'supervisor', lane: 'control',
      mcpCallTotal: scenario.tools.length,
      message: scenario.tools.length === 1 ? 'Executing one governed MCP branch.' : `Executing ${scenario.tools.length} governed MCP branches in parallel.`
    });

    const entries = await Promise.all(scenario.tools.map(async (tool, index) => {
      const callIndex = index + 1;
      const callId = `${context.requestId}:${callIndex}`;
      const agentNode = `agent:${callIndex}`;
      const policyNodeId = `policy:${callIndex}`;
      const mcpNode = `mcp:${callIndex}`;
      const adapterNode = `adapter:${callIndex}`;
      const sourceNode = `source:${callIndex}`;
      const toolArgs = tool.args(input);

      await emit('orchestrator', 'agent.branch.started', 'started', {
        agent: tool.agent, nodeId: agentNode, parentNodeId: 'federation', lane: 'control',
        capability: tool.capability, tool: tool.capability, product: tool.product,
        callId, mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        message: `${tool.agent} owns ${tool.domain} capability execution.`
      });

      const decisionStarted = Date.now();
      await emit('policy', 'tool.policy.started', 'started', {
        agent: 'governance', nodeId: policyNodeId, parentNodeId: agentNode, lane: 'governance',
        capability: tool.capability, product: tool.product, callId, mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length
      });
      const decision = await authorizeRead(context, {
        type: tool.resourceType,
        id: tool.capability.startsWith('recruitment.') ? String(input.candidateId ?? 'CAND-1001') : input.employeeId,
        ownerUserId: input.employeeId
      });
      await emit('policy', 'tool.policy.completed', decision.allow ? 'allowed' : 'denied', {
        agent: 'governance', nodeId: policyNodeId, parentNodeId: agentNode, lane: 'governance',
        capability: tool.capability, product: tool.product, callId,
        mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        durationMs: Date.now() - decisionStarted,
        message: decision.reason ?? (decision.allow ? 'allowed' : 'deny-by-default')
      });
      if (!decision.allow) throw new Error(`AUTH_DENIED:${tool.capability}`);

      const mcpStarted = Date.now();
      await emit('mcp', 'tools/call.started', 'started', {
        agent: tool.agent, nodeId: mcpNode, parentNodeId: policyNodeId, lane: 'mcp',
        capability: tool.capability, tool: tool.capability, product: tool.product, callId,
        mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        inputKeys: Object.keys(toolArgs),
        message: `MCP ${tool.capability} → ${tool.product}`
      });

      const result = await callMcpTool(context, callId, tool.capability, toolArgs);
      const artifactId = await persistence.putArtifact({
        runId,
        threadId,
        tenantId: context.tenantId,
        producerAgent: tool.agent,
        artifactType: tool.artifactType,
        classification: tool.classification,
        sourceSystem: result.sourceSystem,
        capability: tool.capability,
        payload: result.data
      });

      await emit('adapter', 'adapter.roundtrip', 'completed', {
        agent: tool.agent, nodeId: adapterNode, parentNodeId: mcpNode, lane: 'data',
        capability: tool.capability, tool: tool.capability, product: result.product ?? tool.product,
        callId, mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        durationMs: result.adapterDurationMs,
        message: result.adapter ?? `${tool.product} adapter`
      });
      await emit('source', 'source.structured_data', 'completed', {
        agent: tool.agent, nodeId: sourceNode, parentNodeId: adapterNode, lane: 'data',
        capability: tool.capability, product: result.product ?? tool.product, sourceSystem: result.sourceSystem,
        callId, mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        artifactId, outputShape: result.outputShape,
        message: result.sourceSystem ?? 'Source-system structured facts'
      });
      await emit('mcp', 'tools/call.completed', 'completed', {
        agent: tool.agent, nodeId: mcpNode, parentNodeId: policyNodeId, lane: 'mcp',
        capability: tool.capability, tool: tool.capability, product: result.product ?? tool.product,
        callId, mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        artifactId, outputShape: result.outputShape, durationMs: Date.now() - mcpStarted,
        message: 'MCP structuredContent validated by the server and persisted as a governed artifact.'
      });
      await emit('orchestrator', 'agent.handoff', 'completed', {
        agent: tool.agent, nodeId: agentNode, parentNodeId: 'federation', lane: 'control',
        capability: tool.capability, product: result.product ?? tool.product, sourceSystem: result.sourceSystem,
        callId, mcpCallIndex: callIndex, mcpCallTotal: scenario.tools.length,
        artifactId,
        message: 'Agent hands an artifact reference to the supervisor; hidden reasoning is never shared.'
      });

      return [tool.capability, artifactId] as const;
    }));

    await emit('orchestrator', 'federation.completed', 'completed', {
      agent: 'supervisor', nodeId: 'federation', parentNodeId: 'supervisor', lane: 'control',
      mcpCallTotal: scenario.tools.length,
      message: `${entries.length}/${scenario.tools.length} MCP branches completed.`
    });
    return { artifactRefs: Object.fromEntries(entries) };
  };

  const synthesisNode = async (state: typeof ScenarioState.State) => {
    await persistence.updateRun(context.tenantId, runId, { currentNode: 'synthesis' });
    const evidence = [] as Array<{ capability: string; product: string; sourceSystem?: string; data: Record<string, unknown>; artifactId: string }>;

    for (const tool of scenario.tools) {
      const artifactId = state.artifactRefs[tool.capability];
      if (!artifactId) throw new Error(`ARTIFACT_MISSING:${tool.capability}`);
      const artifact = await persistence.getArtifact(context.tenantId, artifactId);
      if (!artifact) throw new Error(`ARTIFACT_NOT_FOUND:${tool.capability}`);
      evidence.push({ capability: tool.capability, product: tool.product, sourceSystem: artifact.sourceSystem, data: artifact.payload, artifactId });
      await emit('orchestrator', 'graph.edge', 'completed', {
        agent: 'supervisor', nodeId: 'merge:evidence', parentNodeId: `source:${scenario.tools.indexOf(tool) + 1}`, lane: 'control',
        capability: tool.capability, product: tool.product, artifactId,
        message: 'Validated source artifact enters the evidence merge node.'
      });
    }

    const aggregateArtifactId = await persistence.putArtifact({
      runId,
      threadId,
      tenantId: context.tenantId,
      producerAgent: 'supervisor',
      artifactType: 'scenario_evidence_manifest',
      classification: 'confidential',
      capability: `scenario.${scenario.id}`,
      payload: {
        scenarioId: scenario.id,
        artifactRefs: evidence.map(item => ({ capability: item.capability, product: item.product, artifactId: item.artifactId }))
      }
    });
    await emit('orchestrator', 'evidence.merge.completed', 'completed', {
      agent: 'supervisor', nodeId: 'merge:evidence', parentNodeId: 'federation', lane: 'control',
      artifactId: aggregateArtifactId, outputShape: evidence.map(item => item.capability),
      message: `${evidence.length} governed artifacts merged by reference; source payloads remain separately attributable.`
    });

    if (!input.explain) {
      await emit('ai', 'model.synthesis.skipped', 'skipped', {
        agent: 'synthesis-agent', nodeId: 'ai:synthesis', parentNodeId: 'merge:evidence', lane: 'ai',
        message: 'explain=false'
      });
      return {};
    }

    const aiStarted = Date.now();
    await emit('ai', 'model.synthesis.started', 'started', {
      agent: 'synthesis-agent', nodeId: 'ai:synthesis', parentNodeId: 'merge:evidence', lane: 'ai',
      inputKeys: evidence.map(item => item.capability),
      message: 'Azure OpenAI receives only governed structured evidence from completed MCP calls.'
    });
    const synthesis = await synthesizeGroundedArtifacts({
      scenarioTitle: scenario.title,
      businessQuestion: scenario.businessQuestion,
      artifacts: evidence.map(item => ({ capability: item.capability, product: item.product, sourceSystem: item.sourceSystem, data: item.data }))
    });
    if (!synthesis) throw new Error('MODEL_RETURNED_NO_SYNTHESIS');

    const synthesisArtifactId = await persistence.putArtifact({
      runId,
      threadId,
      tenantId: context.tenantId,
      producerAgent: 'synthesis-agent',
      artifactType: 'grounded_cross_product_synthesis',
      classification: 'confidential',
      capability: 'ai.cross_product_synthesis',
      payload: { text: synthesis, groundedOnArtifactIds: evidence.map(item => item.artifactId) }
    });
    await emit('ai', 'model.synthesis.completed', 'completed', {
      agent: 'synthesis-agent', nodeId: 'ai:synthesis', parentNodeId: 'merge:evidence', lane: 'ai',
      artifactId: synthesisArtifactId, durationMs: Date.now() - aiStarted,
      outputShape: ['grounded_briefing'],
      message: 'LLM synthesis persisted separately from authoritative source artifacts.'
    });
    return { synthesisArtifactId };
  };

  const completeNode = async (state: typeof ScenarioState.State) => {
    await persistence.updateRun(context.tenantId, runId, {
      status: 'completed', currentNode: 'complete',
      finalArtifactId: state.artifactRefs[scenario.tools[0]?.capability],
      explanationArtifactId: state.synthesisArtifactId
    });
    return { status: 'completed' as const };
  };

  const deniedNode = async () => {
    await persistence.updateRun(context.tenantId, runId, { status: 'failed', currentNode: 'policy_denied', errorCode: 'AUTH_DENIED' });
    return { status: 'failed' as const, errorCode: 'AUTH_DENIED' };
  };

  const graph = new StateGraph(ScenarioState)
    .addNode('policy', policyNode)
    .addNode('supervisor', supervisorNode)
    .addNode('federation', federationNode)
    .addNode('synthesis', synthesisNode)
    .addNode('complete', completeNode)
    .addNode('denied', deniedNode)
    .addEdge(START, 'policy')
    .addConditionalEdges('policy', state => state.policyAllowed === true ? 'supervisor' : 'denied', ['supervisor', 'denied'])
    .addEdge('supervisor', 'federation')
    .addEdge('federation', 'synthesis')
    .addEdge('synthesis', 'complete')
    .addEdge('complete', END)
    .addEdge('denied', END)
    .compile({ checkpointer: persistence.checkpointer });

  try {
    const state = await graph.invoke(
      {
        scenarioId: scenario.id,
        employeeId: input.employeeId,
        period: input.period,
        candidateId: input.candidateId,
        explain: input.explain,
        status: 'running'
      },
      {
        configurable: {
          thread_id: `${context.tenantId}:${threadId}`,
          checkpoint_ns: `scenario-${scenario.id}-v1`
        }
      }
    );

    if (state.errorCode === 'AUTH_DENIED') {
      await emit('orchestrator', 'workflow.completed', 'failed', {
        type: 'error', agent: 'supervisor', nodeId: 'complete', parentNodeId: 'policy:scenario', lane: 'control',
        message: 'Authorization denied before MCP execution.'
      });
      await emitChain;
      return { status: 403, payload: { requestId: context.requestId, runId, threadId, scenarioId: scenario.id, status: 'DENIED', code: 'AUTH_DENIED' } };
    }

    const facts = [] as Array<Record<string, unknown>>;
    for (const tool of scenario.tools) {
      const artifactId = state.artifactRefs[tool.capability];
      if (!artifactId) continue;
      const artifact = await persistence.getArtifact(context.tenantId, artifactId);
      if (!artifact) continue;
      facts.push({
        capability: tool.capability,
        product: tool.product,
        domain: tool.domain,
        artifactId,
        sourceSystem: artifact.sourceSystem,
        data: artifact.payload
      });
    }

    let synthesis: string | undefined;
    if (state.synthesisArtifactId) {
      const artifact = await persistence.getArtifact(context.tenantId, state.synthesisArtifactId);
      synthesis = typeof artifact?.payload?.text === 'string' ? artifact.payload.text : undefined;
    }

    const payload = {
      requestId: context.requestId,
      runId,
      threadId,
      scenarioId: scenario.id,
      scenarioTitle: scenario.title,
      mode: scenario.mode,
      status: 'FULL',
      mcpCallCount: scenario.tools.length,
      facts,
      synthesis
    };
    await emit('orchestrator', 'workflow.result', 'completed', {
      type: 'result', agent: 'supervisor', nodeId: 'result', parentNodeId: input.explain ? 'ai:synthesis' : 'merge:evidence', lane: 'control',
      mcpCallTotal: scenario.tools.length, payload,
      message: `Result assembled from ${facts.length} persisted MCP artifacts.`
    });
    await emit('orchestrator', 'workflow.completed', 'completed', {
      type: 'complete', agent: 'supervisor', nodeId: 'complete', parentNodeId: 'result', lane: 'control',
      durationMs: Date.now() - startedAt,
      message: 'Durable scenario workflow complete.'
    });
    await emitChain;
    return { status: 200, payload };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'DEPENDENCY_UNAVAILABLE';
    const denied = detail.startsWith('AUTH_DENIED:');
    await persistence.updateRun(context.tenantId, runId, {
      status: 'failed', currentNode: denied ? 'policy_denied' : 'failed', errorCode: denied ? 'AUTH_DENIED' : detail
    });
    await emit('orchestrator', 'workflow.completed', 'failed', {
      type: 'error', agent: 'supervisor', nodeId: 'complete', parentNodeId: 'federation', lane: 'control',
      message: detail
    });
    await emitChain;
    return {
      status: denied ? 403 : 503,
      payload: { requestId: context.requestId, runId, threadId, scenarioId: scenario.id, status: 'FAILED', code: denied ? 'AUTH_DENIED' : 'DEPENDENCY_UNAVAILABLE' }
    };
  }
}

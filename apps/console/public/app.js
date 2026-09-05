(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const state = {
    scenarios: [], selectedScenarioId: '', events: [], nodes: new Map(), calls: new Map(),
    tools: [], runs: [], evals: [], startedAt: 0, requestId: '', runId: '', result: null
  };

  const products = [
    { name: 'BCS HR Software', domain: 'Core HR & Payroll', capabilities: ['payroll.*'], mode: 'LIVE reference adapter' },
    { name: 'Apployed / People Inc.', domain: 'Core HR', capabilities: ['employee.*', 'organization.*'], mode: 'LIVE reference adapter' },
    { name: 'Tasper', domain: 'Benefits & Leave', capabilities: ['benefits.*', 'leave.*'], mode: 'LIVE reference adapter' },
    { name: 'MediSoft Dossier Manager', domain: 'Absence & Dossiers', capabilities: ['absence.*'], mode: 'LIVE reference adapter' },
    { name: 'Motion', domain: 'Core HR', capabilities: ['employee.contract.*'], mode: 'LIVE reference adapter' },
    { name: 'epowerhr', domain: 'Talent & Onboarding', capabilities: ['performance.*', 'onboarding.*'], mode: 'LIVE reference adapter' },
    { name: 'Online Academie / MijnLMS', domain: 'Learning & Development', capabilities: ['learning.*'], mode: 'LIVE reference adapter' },
    { name: 'CVWarehouse', domain: 'Recruitment', capabilities: ['recruitment.*'], mode: 'LIVE reference adapter' },
    { name: 'Plek', domain: 'Digital Engagement', capabilities: ['engagement.*'], mode: 'LIVE reference adapter' },
    { name: 'Timegrip', domain: 'Workforce Management', capabilities: ['workforce.*', 'time.*'], mode: 'LIVE reference adapter' }
  ];

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const text = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const fmtTime = value => value ? new Date(value).toLocaleString() : '—';
  const fmtMs = value => Number.isFinite(Number(value)) ? `${Number(value)} ms` : '—';
  const pretty = value => JSON.stringify(value, null, 2);

  text('#data-mode', config.dataMode || 'SYNTHETIC');
  text('#environment', config.environment || 'dev');

  function setView(name) {
    $$('.view').forEach(v => v.classList.toggle('active-view', v.id === `view-${name}`));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    const titles = { scenarios: 'Scenario Lab', runs: 'Agent Runs', observability: 'Observability', evaluations: 'Evaluations', mcp: 'Capability Hub', products: 'Product Landscape' };
    text('#page-title', titles[name] || 'BCS ONE');
    if (!getToken()) return;
    if (name === 'runs') void refreshRuns();
    if (name === 'evaluations') void refreshEvaluations();
    if (name === 'mcp' && state.tools.length === 0) void refreshTools();
  }
  $$('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));

  function base64Url(bytes) {
    let binary = ''; bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function sha256(input) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))); }
  function randomValue(size = 48) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return base64Url(bytes); }
  function callbackUri() { return `${window.location.origin}/auth/callback`; }

  async function login() {
    if (!config.tenantId || !config.clientId || !config.scope) { alert('Console Entra configuration is incomplete.'); return; }
    const verifier = randomValue(64), challenge = base64Url(await sha256(verifier)), loginState = randomValue(24);
    sessionStorage.setItem('bcs_pkce_verifier', verifier); sessionStorage.setItem('bcs_oauth_state', loginState);
    const params = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: callbackUri(), response_mode: 'query', scope: `openid profile offline_access ${config.scope}`, state: loginState, code_challenge: challenge, code_challenge_method: 'S256' });
    window.location.assign(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize?${params}`);
  }

  async function completeLogin() {
    const params = new URLSearchParams(window.location.search); const code = params.get('code'); if (!code) return;
    const returnedState = params.get('state'), verifier = sessionStorage.getItem('bcs_pkce_verifier'), expectedState = sessionStorage.getItem('bcs_oauth_state');
    if (!verifier || !returnedState || returnedState !== expectedState) throw new Error('OAuth state validation failed.');
    const body = new URLSearchParams({ client_id: config.clientId, grant_type: 'authorization_code', code, redirect_uri: callbackUri(), code_verifier: verifier, scope: `openid profile offline_access ${config.scope}` });
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const token = await response.json(); if (!response.ok || !token.access_token) throw new Error(token.error_description || 'Token exchange failed.');
    sessionStorage.setItem('bcs_access_token', token.access_token); sessionStorage.setItem('bcs_access_token_expires', String(Date.now() + Number(token.expires_in || 3600) * 1000));
    sessionStorage.removeItem('bcs_pkce_verifier'); sessionStorage.removeItem('bcs_oauth_state'); history.replaceState({}, '', '/');
  }

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token'), expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    return !token || (expires && expires < Date.now() + 15000) ? '' : token;
  }
  function decodeClaims(token) {
    try {
      const part = token.split('.')[1], normalized = part.replace(/-/g, '+').replace(/_/g, '/'), padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(decodeURIComponent([...atob(padded)].map(c => `%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')));
    } catch { return {}; }
  }
  function refreshIdentity() {
    const token = getToken(), loggedIn = Boolean(token);
    $('#login-button').classList.toggle('hidden', loggedIn); $('#logout-button').classList.toggle('hidden', !loggedIn); $('#identity-chip').classList.toggle('hidden', !loggedIn);
    if (!loggedIn) return;
    const claims = decodeClaims(token), roles = Array.isArray(claims.roles) ? claims.roles.map(r => String(r).toLowerCase()) : [];
    text('#identity-text', `${claims.name || claims.preferred_username || 'Entra user'} · ${roles.join(', ') || 'role unavailable'}`);
  }
  function logout() {
    sessionStorage.removeItem('bcs_access_token'); sessionStorage.removeItem('bcs_access_token_expires');
    state.scenarios = []; state.tools = []; state.runs = []; state.evals = []; refreshIdentity(); renderScenarioGrid();
  }
  $('#login-button').addEventListener('click', login); $('#logout-button').addEventListener('click', logout);

  async function api(path, options = {}) {
    const token = getToken(); if (!token) throw new Error('Sign in with Entra first.');
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    const response = await fetch(`${config.gatewayUrl}${path}`, { ...options, headers });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || `HTTP ${response.status}`);
    return body;
  }

  async function loadScenarios() {
    if (!getToken()) return;
    const payload = await api('/v1/scenarios');
    state.scenarios = Array.isArray(payload.scenarios) ? payload.scenarios : [];
    if (!state.selectedScenarioId && state.scenarios[0]) state.selectedScenarioId = state.scenarios[0].id;
    renderScenarioGrid(); selectScenario(state.selectedScenarioId);
  }

  function renderScenarioGrid() {
    const root = $('#scenario-grid'); if (!root) return;
    text('#scenario-count', `${state.scenarios.length} scenarios`);
    if (!state.scenarios.length) { root.innerHTML = '<div class="empty-state">Sign in to load executable scenarios.</div>'; return; }
    root.innerHTML = state.scenarios.map(s => `
      <button class="scenario-card ${s.id === state.selectedScenarioId ? 'selected' : ''}" data-scenario="${esc(s.id)}">
        <div class="scenario-top"><span class="scenario-mode ${s.mode === 'single-mcp' ? 'single' : 'multi'}">${s.mode === 'single-mcp' ? '1 MCP' : `${s.mcpCallCount} MCP`}</span><span class="scenario-category">${esc(s.category)}</span></div>
        <strong>${esc(s.title)}</strong><p>${esc(s.description)}</p>
        <div class="scenario-products">${[...new Set(s.tools.map(t => t.product))].slice(0, 4).map(p => `<span>${esc(p)}</span>`).join('')}</div>
      </button>`).join('');
    root.querySelectorAll('[data-scenario]').forEach(button => button.addEventListener('click', () => selectScenario(button.dataset.scenario)));
  }

  function selectedScenario() { return state.scenarios.find(s => s.id === state.selectedScenarioId); }
  function selectScenario(id) {
    const scenario = state.scenarios.find(s => s.id === id); if (!scenario) return;
    state.selectedScenarioId = id; renderScenarioGrid();
    text('#selected-scenario-mode', `${scenario.mode === 'single-mcp' ? 'Single MCP proof' : 'Multi-MCP federation'} · ${scenario.mcpCallCount} tools/call`);
    $('#selected-scenario-value').innerHTML = `<strong>${esc(scenario.businessQuestion)}</strong><span>${esc(scenario.valueStatement)}</span>`;
    text('#metric-planned-calls', scenario.mcpCallCount); text('#metric-mode', scenario.mode === 'single-mcp' ? 'single MCP' : 'multi-MCP fan-out');
    buildPlannedGraph(scenario); renderFlowGraph(); renderNodeInspector();
  }

  function resetExecution(keepPlan = true) {
    state.events = []; state.nodes = new Map(); state.calls = new Map(); state.startedAt = 0; state.requestId = ''; state.runId = ''; state.result = null;
    text('#run-status', 'READY'); $('#run-status').className = 'status neutral'; text('#run-request-id', 'request: —'); text('#event-count', '0 events');
    text('#metric-completed-calls', '0'); text('#metric-run-products', '0'); text('#metric-artifacts', '0'); text('#metric-ai', 'WAITING'); text('#mcp-proof-count', '0 calls'); text('#data-source-count', '0 sources');
    $('#mcp-proof').innerHTML = '<div class="empty-state">No MCP calls yet.</div>'; $('#structured-data').innerHTML = '<div class="empty-state">Structured source data will appear after MCP calls complete.</div>';
    $('#ai-value-panel').innerHTML = '<div class="empty-state">Run a scenario with AI synthesis enabled.</div>'; $('#trace-table').innerHTML = '<div class="empty-state">No trace events yet.</div>'; text('#workflow-error', '');
    if (keepPlan && selectedScenario()) buildPlannedGraph(selectedScenario());
    renderFlowGraph(); renderNodeInspector(); updateObservability();
  }
  $('#clear-run').addEventListener('click', () => resetExecution(true));

  function upsertNode(node) {
    if (!node?.id) return;
    const existing = state.nodes.get(node.id) || { id: node.id, parents: new Set(), status: 'planned' };
    if (node.parentId) existing.parents.add(node.parentId);
    const merged = { ...existing, ...node, parents: existing.parents };
    state.nodes.set(node.id, merged);
  }

  function buildPlannedGraph(scenario) {
    state.nodes = new Map();
    upsertNode({ id: 'request', label: 'Request', sub: scenario.title, lane: 'control' });
    upsertNode({ id: 'identity', parentId: 'request', label: 'Entra', sub: 'Identity', lane: 'control' });
    upsertNode({ id: 'gateway', parentId: 'identity', label: 'Gateway', sub: 'Trusted context', lane: 'control' });
    upsertNode({ id: 'policy:scenario', parentId: 'gateway', label: 'OPA', sub: 'Scenario policy', lane: 'control' });
    upsertNode({ id: 'supervisor', parentId: 'policy:scenario', label: 'Supervisor', sub: 'LangGraph', lane: 'control' });
    upsertNode({ id: 'federation', parentId: 'supervisor', label: 'Federation', sub: `${scenario.mcpCallCount} branches`, lane: 'control' });
    scenario.tools.forEach((tool, index) => {
      const n = index + 1;
      upsertNode({ id: `agent:${n}`, parentId: 'federation', label: tool.agent.replace('-agent',''), sub: tool.domain, lane: 'control', capability: tool.capability, product: tool.product, callIndex: n });
      upsertNode({ id: `policy:${n}`, parentId: `agent:${n}`, label: 'OPA', sub: 'Tool auth', lane: 'control', capability: tool.capability, product: tool.product, callIndex: n });
      upsertNode({ id: `mcp:${n}`, parentId: `policy:${n}`, label: 'MCP', sub: tool.capability, lane: 'mcp', capability: tool.capability, product: tool.product, callIndex: n });
      upsertNode({ id: `adapter:${n}`, parentId: `mcp:${n}`, label: 'Adapter', sub: tool.product, lane: 'data', capability: tool.capability, product: tool.product, callIndex: n });
      upsertNode({ id: `source:${n}`, parentId: `adapter:${n}`, label: 'Structured data', sub: tool.product, lane: 'data', capability: tool.capability, product: tool.product, callIndex: n });
      upsertNode({ id: 'merge:evidence', parentId: `source:${n}`, label: 'Evidence merge', sub: 'Artifact refs', lane: 'control' });
    });
    upsertNode({ id: 'ai:synthesis', parentId: 'merge:evidence', label: 'Azure OpenAI', sub: 'Grounded synthesis', lane: 'control' });
    upsertNode({ id: 'result', parentId: 'ai:synthesis', label: 'BCS ONE result', sub: 'Evidence + AI', lane: 'control' });
    upsertNode({ id: 'complete', parentId: 'result', label: 'Complete', sub: 'Durable run', lane: 'control' });
  }

  function nodePosition(node, scenario, height) {
    const cols = { request:0, identity:1, gateway:2, 'policy:scenario':3, supervisor:4, federation:5, 'merge:evidence':11, 'ai:synthesis':12, result:13, complete:14 };
    const branchMatch = node.id.match(/^(agent|policy|mcp|adapter|source):(\d+)$/);
    let col = cols[node.id];
    if (branchMatch) col = { agent:6, policy:7, mcp:8, adapter:9, source:10 }[branchMatch[1]];
    const x = 36 + (col ?? 0) * 154;
    let y = height / 2 - 28;
    if (branchMatch) y = 55 + (Number(branchMatch[2]) - 1) * 92;
    return { x, y };
  }

  function renderFlowGraph() {
    const svg = $('#flow-graph'), scenario = selectedScenario(); if (!svg || !scenario) return;
    const height = Math.max(430, scenario.mcpCallCount * 92 + 110), width = 2280;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('width', width); svg.setAttribute('height', height);
    const positions = new Map(); state.nodes.forEach(node => positions.set(node.id, nodePosition(node, scenario, height)));
    const edges = [];
    state.nodes.forEach(node => {
      const parents = node.parents || new Set(); parents.forEach(parentId => {
        const a = positions.get(parentId), b = positions.get(node.id); if (!a || !b) return;
        const green = node.lane === 'mcp' || node.lane === 'data' || String(node.id).startsWith('merge:');
        const failed = node.status === 'failed' || node.status === 'denied';
        const x1 = a.x + 126, y1 = a.y + 27, x2 = b.x, y2 = b.y + 27, mid = (x1 + x2) / 2;
        edges.push(`<path class="flow-edge ${green ? 'green' : 'blue'} ${failed ? 'failed' : ''}" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}" />`);
      });
    });
    const nodes = [...state.nodes.values()].map(node => {
      const p = positions.get(node.id), green = node.lane === 'mcp' || node.lane === 'data', status = node.status || 'planned';
      const cls = `flow-node ${green ? 'green' : 'blue'} status-${status}`;
      const label = esc(node.label || node.id), sub = esc(String(node.sub || node.capability || '').slice(0, 24));
      return `<g class="${cls}" data-node-id="${esc(node.id)}" tabindex="0" role="button"><rect x="${p.x}" y="${p.y}" width="126" height="54" rx="13"/><text x="${p.x + 63}" y="${p.y + 23}" text-anchor="middle" class="node-label">${label}</text><text x="${p.x + 63}" y="${p.y + 40}" text-anchor="middle" class="node-sub">${sub}</text></g>`;
    }).join('');
    svg.innerHTML = `<defs><filter id="nodeGlow"><feGaussianBlur stdDeviation="3.5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${edges.join('')}${nodes}`;
    svg.querySelectorAll('[data-node-id]').forEach(el => {
      const open = () => renderNodeInspector(el.getAttribute('data-node-id'));
      el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') open(); });
    });
  }

  function renderNodeInspector(nodeId) {
    const root = $('#node-inspector'); if (!root) return;
    const node = nodeId ? state.nodes.get(nodeId) : null;
    if (!node) { root.innerHTML = '<div class="empty-state">Click a graph node to inspect capability, product, call ID, data shape and persisted artifact.</div>'; return; }
    root.innerHTML = `<div class="node-detail-head"><span class="node-lane ${node.lane === 'mcp' || node.lane === 'data' ? 'green' : 'blue'}">${esc((node.lane || 'control').toUpperCase())}</span><span class="status ${['completed','allowed','skipped'].includes(node.status) ? 'success' : ['failed','denied'].includes(node.status) ? 'danger' : node.status === 'started' ? 'info' : 'neutral'}">${esc((node.status || 'planned').toUpperCase())}</span></div>
      <h3>${esc(node.label || node.id)}</h3><div class="key-values inspector-values">
      <span>Node ID</span><strong class="mono">${esc(node.id)}</strong><span>Capability</span><strong class="mono">${esc(node.capability || '—')}</strong><span>Product</span><strong>${esc(node.product || '—')}</strong><span>Call ID</span><strong class="mono">${esc(node.callId || '—')}</strong><span>Source</span><strong>${esc(node.sourceSystem || '—')}</strong><span>Duration</span><strong>${fmtMs(node.durationMs)}</strong><span>Input keys</span><strong>${esc((node.inputKeys || []).join(', ') || '—')}</strong><span>Output shape</span><strong>${esc((node.outputShape || []).join(', ') || '—')}</strong><span>Artifact</span><strong class="mono">${esc(node.artifactId || '—')}</strong></div>
      ${node.message ? `<div class="node-message">${esc(node.message)}</div>` : ''}
      ${node.artifactId && state.runId ? `<button class="button secondary artifact-load" data-artifact="${esc(node.artifactId)}">Load structured artifact</button><pre id="artifact-preview" class="json-preview hidden"></pre>` : ''}`;
    const button = root.querySelector('.artifact-load'); if (button) button.addEventListener('click', () => void loadArtifact(button.dataset.artifact));
  }

  async function loadArtifact(artifactId) {
    const preview = $('#artifact-preview'); if (!preview || !state.runId) return;
    preview.classList.remove('hidden'); preview.textContent = 'Loading governed artifact…';
    try { const payload = await api(`/v1/runs/${encodeURIComponent(state.runId)}/artifacts/${encodeURIComponent(artifactId)}`); preview.textContent = pretty(payload.artifact?.payload || payload.artifact); }
    catch (error) { preview.textContent = error.message; }
  }

  function appendTrace(event) {
    if (state.events.length === 1) $('#trace-table').innerHTML = '';
    const row = document.createElement('div'); row.className = 'trace-row';
    const bad = ['error','failed','denied'].includes(event.status), lane = event.lane === 'mcp' || event.lane === 'data' ? 'trace-green' : 'trace-blue';
    row.innerHTML = `<span class="muted">+${esc(event.elapsedMs ?? 0)} ms</span><span class="stage ${lane}">${esc(event.stage || 'system')}</span><span class="${bad ? 'trace-error' : 'trace-ok'}">${esc(event.event || event.status)}</span><span class="event">${esc([event.agent, event.capability || event.tool, event.product, event.message].filter(Boolean).join(' · '))}</span><span class="duration">${fmtMs(event.durationMs)}</span>`;
    $('#trace-table').appendChild(row); text('#event-count', `${state.events.length} events`);
  }

  function handleWorkflowEvent(event) {
    state.events.push(event); if (event.requestId) state.requestId = event.requestId; if (event.runId) state.runId = event.runId;
    text('#run-request-id', `request: ${state.requestId || '—'}`); appendTrace(event);
    if (event.nodeId) {
      const existing = state.nodes.get(event.nodeId) || { id: event.nodeId, parents: new Set() };
      if (event.parentNodeId) existing.parents.add(event.parentNodeId);
      const label = existing.label || (event.nodeId.startsWith('mcp:') ? 'MCP' : event.nodeId.startsWith('adapter:') ? 'Adapter' : event.nodeId.startsWith('source:') ? 'Structured data' : event.nodeId);
      upsertNode({ ...existing, id: event.nodeId, parentId: event.parentNodeId, label, status: event.status, lane: event.lane || existing.lane, capability: event.capability || event.tool || existing.capability, product: event.product || existing.product, sourceSystem: event.sourceSystem || existing.sourceSystem, callId: event.callId || existing.callId, durationMs: event.durationMs ?? existing.durationMs, inputKeys: event.inputKeys || existing.inputKeys, outputShape: event.outputShape || existing.outputShape, artifactId: event.artifactId || existing.artifactId, message: event.message || existing.message });
    }
    if (event.callId) {
      const call = state.calls.get(event.callId) || { callId: event.callId, status: 'started' };
      Object.assign(call, { capability: event.capability || event.tool || call.capability, product: event.product || call.product, sourceSystem: event.sourceSystem || call.sourceSystem, artifactId: event.artifactId || call.artifactId, outputShape: event.outputShape || call.outputShape, index: event.mcpCallIndex || call.index, total: event.mcpCallTotal || call.total });
      if (event.event === 'tools/call.started') call.status = 'started';
      if (event.event === 'tools/call.completed') { call.status = 'completed'; call.durationMs = event.durationMs; }
      if (['failed','error','denied'].includes(event.status)) call.status = 'failed';
      state.calls.set(event.callId, call);
    }
    if (event.type === 'result' || event.event === 'workflow.result') renderResult(event.payload || event.result || event.data);
    if (event.event === 'model.synthesis.started') text('#metric-ai', 'RUNNING');
    if (event.event === 'model.synthesis.completed') text('#metric-ai', 'COMPLETE');
    if (event.event === 'model.synthesis.skipped') text('#metric-ai', 'SKIPPED');
    if (event.type === 'complete' || event.event === 'workflow.completed') { const failed = event.status === 'failed'; text('#run-status', failed ? 'FAILED' : 'COMPLETED'); $('#run-status').className = failed ? 'status danger' : 'status success'; }
    if (event.type === 'error' || event.status === 'failed') { text('#run-status', 'FAILED'); $('#run-status').className = 'status danger'; }
    renderFlowGraph(); renderMcpProof(); updateProofMetrics(); updateObservability();
  }

  function renderMcpProof() {
    const calls = [...state.calls.values()].sort((a,b) => (a.index || 0) - (b.index || 0));
    text('#mcp-proof-count', `${calls.length} calls`);
    if (!calls.length) { $('#mcp-proof').innerHTML = '<div class="empty-state">No MCP calls yet.</div>'; return; }
    $('#mcp-proof').innerHTML = `<div class="mcp-call-table">${calls.map(call => `<div class="mcp-call-row"><span class="call-index">${esc(call.index || '—')}</span><div><strong class="mono">${esc(call.capability || 'MCP call')}</strong><small>${esc(call.product || '—')} · ${esc(call.sourceSystem || 'source pending')}</small></div><span class="call-shape">${esc((call.outputShape || []).slice(0,4).join(', ') || 'shape pending')}</span><span class="status ${call.status === 'completed' ? 'success' : call.status === 'failed' ? 'danger' : 'info'}">${esc(call.status.toUpperCase())}</span><span class="mono">${fmtMs(call.durationMs)}</span></div>`).join('')}</div>`;
  }

  function updateProofMetrics() {
    const completed = [...state.calls.values()].filter(c => c.status === 'completed');
    text('#metric-completed-calls', completed.length); text('#metric-run-products', new Set(completed.map(c => c.product).filter(Boolean)).size);
    text('#metric-artifacts', new Set(completed.map(c => c.artifactId).filter(Boolean)).size);
  }

  function renderResult(payload) {
    state.result = payload; state.runId = payload?.runId || state.runId;
    const facts = Array.isArray(payload?.facts) ? payload.facts : [];
    text('#data-source-count', `${facts.length} sources`);
    $('#structured-data').innerHTML = facts.length ? facts.map(item => `<article class="data-source-card"><div class="data-source-head"><div><span>${esc(item.product)}</span><strong class="mono">${esc(item.capability)}</strong></div><button class="data-artifact-button" data-artifact="${esc(item.artifactId)}">Artifact</button></div><div class="source-system">${esc(item.sourceSystem || 'source')}</div><pre>${esc(pretty(item.data))}</pre></article>`).join('') : '<div class="empty-state">No structured source data returned.</div>';
    $('#structured-data').querySelectorAll('[data-artifact]').forEach(button => button.addEventListener('click', () => { renderNodeInspector(); void loadArtifact(button.dataset.artifact); }));
    $('#ai-value-panel').innerHTML = payload?.synthesis ? `<div class="ai-value"><div class="ai-value-flow"><span>MCP facts</span><b>→</b><span>Evidence merge</span><b>→</b><span>Azure OpenAI</span></div><div class="ai-copy">${esc(payload.synthesis)}</div><div class="evidence-boundary">LLM value: cross-product synthesis and explanation. It does not authorize access, route tenants, calculate payroll, or replace source-system facts.</div></div>` : '<div class="empty-state">AI synthesis was not requested. The MCP/data flow remains fully observable.</div>';
    updateProofMetrics(); updateObservability();
  }

  async function consumeSse(response) {
    if (!response.body) throw new Error('Streaming response body unavailable.');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!data) continue;
        try { handleWorkflowEvent(JSON.parse(data)); } catch (error) { console.error('SSE event parse failed', error); }
      }
    }
  }

  $('#scenario-form').addEventListener('submit', async event => {
    event.preventDefault(); const scenario = selectedScenario(); if (!scenario) return;
    if (!getToken()) { text('#workflow-error', 'Sign in with Entra first.'); return; }
    resetExecution(true); state.startedAt = Date.now(); text('#run-status', 'RUNNING'); $('#run-status').className = 'status info';
    const body = { employeeId: $('#employee-id').value.trim(), period: $('#period').value.trim(), candidateId: $('#candidate-id').value.trim() || undefined, threadId: $('#thread-id').value.trim() || undefined, explain: $('#explain').checked };
    try {
      const response = await fetch(`${config.gatewayUrl}/v1/scenarios/${encodeURIComponent(scenario.id)}/stream`, { method: 'POST', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.message || detail.code || `HTTP ${response.status}`); }
      await consumeSse(response); void refreshRuns();
    } catch (error) { text('#workflow-error', error.message); text('#run-status', 'FAILED'); $('#run-status').className = 'status danger'; }
  });

  function updateObservability() {
    const duration = state.events.length ? Math.max(...state.events.map(e => Number(e.elapsedMs || 0))) : 0;
    text('#obs-duration', duration ? `${duration} ms` : '—'); text('#obs-events', state.events.length); text('#obs-tools', [...state.calls.values()].filter(c => c.status === 'completed').length);
    const denied = state.events.some(e => e.stage === 'policy' && e.status === 'denied'), allowed = state.events.some(e => e.stage === 'policy' && e.status === 'allowed');
    text('#obs-policy', denied ? 'DENY' : allowed ? 'ALLOW' : '—'); text('#obs-health', state.result ? 'COMPLETE' : state.events.length ? 'RUNNING' : 'NO RUN'); $('#obs-health').className = state.result ? 'status success' : state.events.length ? 'status info' : 'status neutral';
    const stages = new Map(); state.events.forEach(e => { if (Number.isFinite(Number(e.durationMs))) stages.set(`${e.stage}:${e.capability || e.event}`, Number(e.durationMs)); });
    const max = Math.max(1, ...stages.values()); $('#latency-list').innerHTML = stages.size ? [...stages.entries()].map(([name, ms]) => `<div class="latency-row"><span>${esc(name)}</span><div class="latency-bar"><i style="width:${Math.max(3,(ms/max)*100)}%"></i></div><strong>${ms} ms</strong></div>`).join('') : '<div class="empty-state">Run a scenario first.</div>';
    $('#evidence-list').innerHTML = `<span>Request ID</span><strong class="mono">${esc(state.requestId || '—')}</strong><span>Run ID</span><strong class="mono">${esc(state.runId || '—')}</strong><span>Scenario</span><strong>${esc(selectedScenario()?.title || '—')}</strong><span>AI invoked</span><strong>${state.events.some(e => e.event === 'model.synthesis.completed') ? 'Yes' : state.events.some(e => e.event === 'model.synthesis.skipped') ? 'No' : '—'}</strong><span>Result</span><strong>${esc(state.result?.status || '—')}</strong>`;
  }

  async function refreshRuns() {
    if (!getToken()) return;
    try {
      const payload = await api('/v1/runs?limit=50'); state.runs = payload.runs || [];
      text('#runs-total', state.runs.length); text('#runs-completed', state.runs.filter(r => r.status === 'completed').length); text('#runs-exception', state.runs.filter(r => r.status !== 'completed').length);
      $('#run-list').innerHTML = state.runs.length ? state.runs.map(run => `<button class="run-row" data-run="${esc(run.runId)}"><span class="status ${run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}">${esc(run.status.toUpperCase())}</span><div><strong>${esc(run.scenarioId || run.workflowType)}</strong><small>${esc(run.runId)} · ${esc(fmtTime(run.startedAt))}</small></div><span>${esc(run.currentNode || '—')}</span></button>`).join('') : '<div class="empty-state">No persisted runs.</div>';
      $('#run-list').querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => void inspectRun(b.dataset.run)));
    } catch (error) { $('#run-list').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  }

  async function inspectRun(runId) {
    try {
      const payload = await api(`/v1/runs/${encodeURIComponent(runId)}`), run = payload.run, artifacts = payload.artifacts || [], events = payload.events || [];
      $('#run-detail').className = 'card-body';
      $('#run-detail').innerHTML = `<div class="key-values"><span>Scenario</span><strong>${esc(run.scenarioId || run.workflowType)}</strong><span>Run ID</span><strong class="mono">${esc(run.runId)}</strong><span>Thread</span><strong class="mono">${esc(run.threadId)}</strong><span>Status</span><strong>${esc(run.status)}</strong><span>Current node</span><strong>${esc(run.currentNode || '—')}</strong><span>Events</span><strong>${events.length}</strong><span>Artifacts</span><strong>${artifacts.length}</strong></div><div class="artifact-list">${artifacts.map(a => `<button data-run-artifact="${esc(a.artifactId)}"><span>${esc(a.artifactType)}</span><strong class="mono">${esc(a.capability || '—')}</strong><small>${esc(a.sourceSystem || '—')}</small></button>`).join('')}</div><pre id="run-artifact-preview" class="json-preview hidden"></pre>`;
      $('#run-detail').querySelectorAll('[data-run-artifact]').forEach(b => b.addEventListener('click', async () => {
        const p = $('#run-artifact-preview'); p.classList.remove('hidden'); p.textContent = 'Loading…';
        try { const a = await api(`/v1/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(b.dataset.runArtifact)}`); p.textContent = pretty(a.artifact?.payload || a.artifact); } catch (error) { p.textContent = error.message; }
      }));
    } catch (error) { $('#run-detail').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  }

  async function refreshEvaluations() {
    if (!getToken()) return;
    try {
      const payload = await api('/v1/evaluations'); state.evals = payload.runs || []; const latest = state.evals[0];
      text('#eval-status', latest?.status?.toUpperCase() || '—'); text('#eval-hard-failures', latest?.hardGateFailures ?? '—'); text('#eval-suite', latest?.suiteName || '—');
      const rate = latest?.totalCases ? Math.round((latest.passedCases / latest.totalCases) * 1000) / 10 : null; text('#eval-pass-rate', rate == null ? '—' : `${rate}%`);
      $('#eval-list').innerHTML = state.evals.length ? state.evals.map(e => `<div class="eval-row"><span class="status ${e.status === 'passed' ? 'success' : 'danger'}">${esc(e.status.toUpperCase())}</span><div><strong>${esc(e.suiteName)}</strong><small>${esc(e.releaseRef)} · ${esc(fmtTime(e.startedAt))}</small></div><span>${esc(`${e.passedCases}/${e.totalCases}`)}</span><span>hard gates: ${esc(e.hardGateFailures)}</span></div>`).join('') : '<div class="empty-state">No evaluation history.</div>';
    } catch (error) { $('#eval-list').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  }

  async function refreshTools() {
    if (!getToken()) return;
    try { const payload = await api('/v1/mcp/tools'); state.tools = payload.tools || []; renderTools(); } catch (error) { $('#tool-grid').innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  }
  function renderTools(filter = '') {
    const q = filter.toLowerCase(), tools = state.tools.filter(t => !q || `${t.name} ${t.title} ${t.description} ${t._meta?.['bcsone/product']}`.toLowerCase().includes(q));
    text('#metric-tools', state.tools.length); text('#metric-live', state.tools.filter(t => t._meta?.['bcsone/status'] === 'live').length); text('#metric-products', new Set(state.tools.map(t => t._meta?.['bcsone/product']).filter(Boolean)).size);
    $('#tool-grid').innerHTML = tools.length ? tools.map(t => `<article class="tool-card ${t._meta?.['bcsone/status'] === 'live' ? 'live' : ''}"><div class="tool-top"><strong class="tool-name">${esc(t.name)}</strong><span class="status ${t._meta?.['bcsone/status'] === 'live' ? 'success' : 'neutral'}">${esc((t._meta?.['bcsone/status'] || 'catalog').toUpperCase())}</span></div><p class="tool-desc">${esc(t.description)}</p><div class="tool-meta"><span class="tag">${esc(t._meta?.['bcsone/product'] || 'BCS ONE')}</span><span class="tag">${esc(t._meta?.['bcsone/domain'] || 'Capability')}</span><span class="tag ${t._meta?.['bcsone/status'] === 'live' ? 'live' : ''}">read-only</span></div></article>`).join('') : '<div class="empty-state">No matching tools.</div>';
  }
  $('#refresh-tools').addEventListener('click', () => void refreshTools()); $('#tool-search').addEventListener('input', e => renderTools(e.target.value));
  $('#refresh-runs').addEventListener('click', () => void refreshRuns()); $('#refresh-evals').addEventListener('click', () => void refreshEvaluations());

  function renderProducts() {
    $('#product-grid').innerHTML = products.map(p => `<article class="product-card"><div class="product-domain">${esc(p.domain)}</div><h3>${esc(p.name)}</h3><p>Canonical BCS ONE capability routing keeps agents independent from product-specific APIs.</p><div class="product-capabilities">${p.capabilities.map(c => `<span class="tag">${esc(c)}</span>`).join('')}</div><div class="product-footer"><span>${esc(p.mode)}</span><span>SYNTHETIC</span></div></article>`).join('');
  }

  async function init() {
    renderProducts(); resetExecution(false);
    try { await completeLogin(); } catch (error) { console.error(error); alert(error.message); }
    refreshIdentity();
    if (getToken()) { await loadScenarios(); void refreshTools(); }
  }
  void init();
})();

(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const state = { events: [], tools: [], runs: [], evals: [], startedAt: 0, requestId: '', runId: '', result: null };
  const stageOrder = ['identity', 'gateway', 'policy', 'orchestrator', 'mcp', 'adapter', 'source', 'ai'];
  const stageDetails = {
    identity: 'Microsoft Entra ID validates the signed-in user. Tenant and roles become trusted security context.',
    gateway: 'The public gateway validates issuer, audience and tenant, then forwards only trusted internal security context.',
    policy: 'OPA performs deterministic authorization before an agent or MCP capability can access payroll data.',
    orchestrator: 'LangGraph coordinates supervisor and specialist agents with durable checkpoints and artifact-reference handoffs.',
    mcp: 'MCP exposes canonical BCS capability contracts independent of individual BCS product APIs.',
    adapter: 'The selected product adapter translates a canonical capability into a source-system request.',
    source: 'Authoritative facts are persisted as tenant-scoped governed artifacts; the model is never the system of record.',
    ai: 'Azure OpenAI receives governed source facts and produces explanation only. It never authorizes or calculates statutory payroll.'
  };
  const products = [
    { name: 'BCS HR Software', domain: 'Core HR & Payroll', description: 'Core HR, payroll and employee administration capabilities in the BCS portfolio.', capabilities: ['employee.*', 'payroll.*', 'leave.*'], mode: 'Live payroll reference path' },
    { name: 'Apployed / People Inc.', domain: 'Core HR', description: 'Core HR capability family behind canonical employee and organisation contracts.', capabilities: ['employee.*', 'organization.*', 'time.*'], mode: 'Catalog mapped' },
    { name: 'Tasper', domain: 'Flexible benefits', description: 'Flexible employment conditions and benefit, leave and time capabilities.', capabilities: ['benefits.*', 'leave.*', 'time.*'], mode: 'Catalog mapped' },
    { name: 'MediSoft Dossier Manager', domain: 'Absence & dossiers', description: 'Absence, case and dossier-management capability family.', capabilities: ['absence.*', 'case.*', 'document.*'], mode: 'Catalog mapped' },
    { name: 'Motion', domain: 'HR & Payroll', description: 'HR and payroll capability mapping from the acquired Centric HR & Payroll activities.', capabilities: ['employee.*', 'payroll.*', 'workflow.*'], mode: 'Catalog mapped' },
    { name: 'Epowerhr', domain: 'Talent development', description: 'Talent, performance, onboarding and development capability family.', capabilities: ['talent.*', 'performance.*', 'onboarding.*'], mode: 'Catalog mapped' },
    { name: 'Online Academie / MijnLMS', domain: 'Learning & Development', description: 'Learning, course progress and certification capabilities.', capabilities: ['learning.*', 'course.*', 'certification.*'], mode: 'Catalog mapped' },
    { name: 'CVWarehouse', domain: 'Recruitment', description: 'Applicant Tracking System capabilities for vacancies, candidates and recruitment workflows.', capabilities: ['recruitment.*', 'candidate.*', 'vacancy.*'], mode: 'Catalog mapped' },
    { name: 'Plek', domain: 'Digital engagement', description: 'Employee communication, onboarding, knowledge-sharing and engagement capabilities.', capabilities: ['engagement.*', 'communication.*', 'onboarding.*'], mode: 'Catalog mapped' },
    { name: 'Timegrip', domain: 'Workforce management', description: 'Workforce planning, scheduling, time tracking and operational workforce capabilities.', capabilities: ['workforce.*', 'schedule.*', 'time.*'], mode: 'Catalog mapped' }
  ];

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const text = (selector, value) => { const node = $(selector); if (node) node.textContent = value; };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const fmtTime = value => value ? new Date(value).toLocaleString() : '—';
  const apiHeaders = () => ({ Authorization: `Bearer ${getToken()}` });

  text('#data-mode', config.dataMode || 'SYNTHETIC');
  text('#environment', config.environment || 'dev');

  function setView(name) {
    $$('.view').forEach(v => v.classList.toggle('active-view', v.id === `view-${name}`));
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    const titles = { live: 'Live Workflow', runs: 'Agent Runs', observability: 'Observability', evaluations: 'Evaluations', mcp: 'Capability Hub', products: 'Product Landscape' };
    text('#page-title', titles[name] || 'BCS ONE');
    if (!getToken()) return;
    if (name === 'mcp' && state.tools.length === 0) void refreshTools();
    if (name === 'runs') void refreshRuns();
    if (name === 'evaluations') void refreshEvaluations();
  }
  $$('.nav-item').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));

  function base64Url(bytes) {
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  async function sha256(input) { return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))); }
  function randomValue(size = 48) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return base64Url(bytes); }
  function callbackUri() { return `${window.location.origin}/auth/callback`; }

  async function login() {
    if (!config.tenantId || !config.clientId || !config.scope) { alert('Console Entra configuration is incomplete.'); return; }
    const verifier = randomValue(64);
    const challenge = base64Url(await sha256(verifier));
    const loginState = randomValue(24);
    sessionStorage.setItem('bcs_pkce_verifier', verifier);
    sessionStorage.setItem('bcs_oauth_state', loginState);
    const params = new URLSearchParams({ client_id: config.clientId, response_type: 'code', redirect_uri: callbackUri(), response_mode: 'query', scope: `openid profile offline_access ${config.scope}`, state: loginState, code_challenge: challenge, code_challenge_method: 'S256' });
    window.location.assign(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/authorize?${params}`);
  }

  async function completeLogin() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (!code) return;
    const returnedState = params.get('state');
    const verifier = sessionStorage.getItem('bcs_pkce_verifier');
    const expectedState = sessionStorage.getItem('bcs_oauth_state');
    if (!verifier || !returnedState || returnedState !== expectedState) throw new Error('OAuth state validation failed.');
    const body = new URLSearchParams({ client_id: config.clientId, grant_type: 'authorization_code', code, redirect_uri: callbackUri(), code_verifier: verifier, scope: `openid profile offline_access ${config.scope}` });
    const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const token = await response.json();
    if (!response.ok || !token.access_token) throw new Error(token.error_description || 'Token exchange failed.');
    sessionStorage.setItem('bcs_access_token', token.access_token);
    sessionStorage.setItem('bcs_access_token_expires', String(Date.now() + Number(token.expires_in || 3600) * 1000));
    sessionStorage.removeItem('bcs_pkce_verifier');
    sessionStorage.removeItem('bcs_oauth_state');
    history.replaceState({}, '', '/');
  }

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token');
    const expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    if (!token || (expires && expires < Date.now() + 15000)) return '';
    return token;
  }
  function decodeClaims(token) {
    try {
      const part = token.split('.')[1];
      const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
      return JSON.parse(decodeURIComponent([...atob(padded)].map(c => `%${c.charCodeAt(0).toString(16).padStart(2,'0')}`).join('')));
    } catch { return {}; }
  }
  function refreshIdentity() {
    const token = getToken();
    const loggedIn = Boolean(token);
    $('#login-button').classList.toggle('hidden', loggedIn);
    $('#logout-button').classList.toggle('hidden', !loggedIn);
    $('#identity-chip').classList.toggle('hidden', !loggedIn);
    if (!loggedIn) { text('#role-value', '—'); text('#purpose-value', '—'); return; }
    const claims = decodeClaims(token);
    const roles = Array.isArray(claims.roles) ? claims.roles.map(r => String(r).toLowerCase()) : [];
    const role = roles.join(', ') || 'role unavailable';
    const purpose = roles.includes('payroll') ? 'payroll-processing' : roles.includes('hr') ? 'hr-service' : 'self-service';
    text('#identity-text', `${claims.name || claims.preferred_username || 'Entra user'} · ${role}`);
    text('#role-value', role); text('#purpose-value', purpose);
  }
  function logout() {
    sessionStorage.removeItem('bcs_access_token'); sessionStorage.removeItem('bcs_access_token_expires');
    state.tools = []; state.runs = []; state.evals = []; refreshIdentity();
  }
  $('#login-button').addEventListener('click', login);
  $('#logout-button').addEventListener('click', logout);

  function resetRun() {
    state.events = []; state.startedAt = 0; state.requestId = ''; state.runId = ''; state.result = null;
    $$('.metro-station').forEach(s => s.classList.remove('active', 'complete', 'failed'));
    $('#metro-progress').style.width = '0%';
    text('#run-status', 'READY'); $('#run-status').className = 'status neutral';
    text('#run-request-id', 'request: —'); text('#run-duration', '0 ms'); text('#event-count', '0 events'); text('#policy-value', 'Waiting');
    $('#facts-panel').className = 'card-body empty-state'; text('#facts-panel', 'Run the workflow to load payroll facts.');
    $('#ai-panel').className = 'card-body empty-state'; text('#ai-panel', 'AI has not been invoked.');
    $('#provenance-panel').className = 'card-body empty-state'; text('#provenance-panel', 'Source evidence will appear here.');
    $('#trace-table').innerHTML = '<div class="empty-state">No trace events yet.</div>';
    text('#workflow-error', ''); updateObservability();
  }
  $('#clear-run').addEventListener('click', resetRun);

  function setStage(stage, status) {
    const index = stageOrder.indexOf(stage); if (index < 0) return;
    const station = $(`.metro-station[data-stage="${stage}"]`); if (!station) return;
    if (status === 'started' || status === 'running') station.classList.add('active');
    if (['completed','success','allowed','skipped'].includes(status)) { station.classList.remove('active'); station.classList.add('complete'); }
    if (['error','failed','denied'].includes(status)) { station.classList.remove('active'); station.classList.add('failed'); }
    const furthest = Math.max(0, ...stageOrder.map((s, i) => { const n = $(`.metro-station[data-stage="${s}"]`); return n && (n.classList.contains('complete') || n.classList.contains('failed')) ? i : -1; }));
    $('#metro-progress').style.width = `${Math.min(88, (furthest / (stageOrder.length - 1)) * 88)}%`;
  }
  $$('.metro-station').forEach(station => station.addEventListener('click', () => text('#station-detail', stageDetails[station.dataset.stage] || '')));

  function appendTrace(event) {
    if (state.events.length === 1) $('#trace-table').innerHTML = '';
    const row = document.createElement('div'); row.className = 'trace-row';
    const relative = event.elapsedMs ?? Math.max(0, Date.now() - state.startedAt);
    const statusClass = ['error','failed','denied'].includes(event.status) ? 'trace-error' : 'trace-ok';
    row.innerHTML = `<span class="muted">+${escapeHtml(relative)} ms</span><span class="stage">${escapeHtml(event.stage || 'system')}</span><span class="${statusClass}">${escapeHtml(event.event || event.status || 'event')}</span><span class="event">${escapeHtml(event.agent ? `${event.agent} · ${event.message || event.tool || ''}` : (event.message || event.tool || ''))}</span><span class="duration">${event.durationMs == null ? '—' : `${escapeHtml(event.durationMs)} ms`}</span>`;
    $('#trace-table').appendChild(row); text('#event-count', `${state.events.length} events`);
  }

  function renderResult(payload) {
    state.result = payload; state.runId = payload?.runId || state.runId;
    const facts = payload?.facts;
    if (facts) {
      $('#facts-panel').className = 'card-body';
      const rows = [['Employee', facts.employeeId], ['Period', facts.period], ['Gross', `${facts.currency || 'EUR'} ${Number(facts.grossAmount).toFixed(2)}`], ['Net', `${facts.currency || 'EUR'} ${Number(facts.netAmount).toFixed(2)}`]];
      $('#facts-panel').innerHTML = `<div class="facts-list">${rows.map(([k,v]) => `<span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong>`).join('')}</div>`;
      $('#provenance-panel').className = 'card-body';
      $('#provenance-panel').innerHTML = `<div class="provenance"><div class="provenance-row"><i></i><div><b>Source system</b><small>${escapeHtml(facts.sourceSystem || 'unknown')}</small></div></div><div class="provenance-row"><i></i><div><b>Freshness</b><small>${escapeHtml(facts.freshness || 'unknown')}</small></div></div><div class="provenance-row"><i></i><div><b>Run ID</b><small class="mono">${escapeHtml(payload.runId || state.requestId)}</small></div></div><div class="provenance-row"><i></i><div><b>Authority boundary</b><small>Source facts and AI explanation are persisted as separate governed artifacts.</small></div></div></div>`;
    }
    $('#ai-panel').className = 'card-body';
    $('#ai-panel').innerHTML = payload?.explanation ? `<div class="ai-copy">${escapeHtml(payload.explanation)}</div>` : '<div class="empty-state">AI explanation was not requested.</div>';
    updateObservability();
  }

  function handleWorkflowEvent(event) {
    state.events.push(event);
    if (event.requestId) { state.requestId = event.requestId; text('#run-request-id', `request: ${event.requestId}`); }
    if (event.runId) state.runId = event.runId;
    setStage(event.stage, event.status || 'completed'); appendTrace(event);
    if (event.stage === 'policy' && ['completed','allowed','success'].includes(event.status)) text('#policy-value', 'ALLOW');
    if (event.stage === 'policy' && ['denied','failed','error'].includes(event.status)) text('#policy-value', 'DENY');
    if (event.type === 'result' || event.event === 'workflow.result') renderResult(event.payload || event.result || event.data);
    if (event.type === 'complete' || event.event === 'workflow.completed') { text('#run-status', event.status === 'failed' ? 'FAILED' : 'COMPLETED'); $('#run-status').className = event.status === 'failed' ? 'status danger' : 'status success'; }
    if (event.type === 'error' || event.status === 'error' || event.status === 'failed') { text('#run-status', 'FAILED'); $('#run-status').className = 'status danger'; }
    text('#run-duration', `${event.elapsedMs ?? (state.startedAt ? Date.now() - state.startedAt : 0)} ms`); updateObservability();
  }

  async function consumeSse(response) {
    if (!response.body) throw new Error('Streaming response body is unavailable.');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!data) continue;
        try { handleWorkflowEvent(JSON.parse(data)); } catch (error) { console.warn('Ignoring malformed SSE event', error); }
      }
    }
  }

  $('#workflow-form').addEventListener('submit', async event => {
    event.preventDefault();
    const token = getToken(); if (!token) { text('#workflow-error', 'Sign in with Microsoft Entra before running the live workflow.'); return; }
    const employeeId = $('#employee-id').value.trim(); const period = $('#period').value.trim(); const threadId = $('#thread-id').value.trim();
    if (!employeeId || !/^\d{4}-\d{2}$/.test(period) || !/^[A-Za-z0-9._:-]{1,128}$/.test(threadId)) { text('#workflow-error', 'Enter a valid employee ID, YYYY-MM period and safe thread ID.'); return; }
    resetRun(); state.startedAt = Date.now(); text('#run-status', 'RUNNING'); $('#run-status').className = 'status info';
    try {
      const response = await fetch(`${config.gatewayUrl}/v1/employee-summary/stream`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId, period, threadId, explain: $('#explain').checked }) });
      if (!response.ok) throw new Error(`Gateway ${response.status}: ${await response.text()}`);
      await consumeSse(response);
      if ($('#run-status').textContent === 'RUNNING') { text('#run-status', 'COMPLETED'); $('#run-status').className = 'status success'; }
      void refreshRuns();
    } catch (error) {
      text('#workflow-error', error instanceof Error ? error.message : String(error)); text('#run-status', 'FAILED'); $('#run-status').className = 'status danger';
    }
    updateObservability();
  });

  async function refreshTools() {
    const token = getToken(); if (!token) { $('#tool-grid').innerHTML = '<div class="empty-state">Sign in to query tools/list.</div>'; return; }
    $('#refresh-tools').disabled = true;
    try {
      const response = await fetch(`${config.gatewayUrl}/v1/mcp/tools`, { headers: apiHeaders() }); const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.code || `HTTP ${response.status}`);
      state.tools = payload.tools || []; renderTools();
    } catch (error) { $('#tool-grid').innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`; }
    finally { $('#refresh-tools').disabled = false; }
  }
  $('#refresh-tools').addEventListener('click', refreshTools); $('#tool-search').addEventListener('input', renderTools);
  function toolMeta(tool, key, fallback = '') { return tool?._meta?.[`bcsone/${key}`] || fallback; }
  function renderTools() {
    const query = $('#tool-search').value.trim().toLowerCase(); const filtered = state.tools.filter(tool => JSON.stringify(tool).toLowerCase().includes(query));
    const productsSet = new Set(state.tools.map(t => toolMeta(t, 'product')).filter(Boolean));
    text('#metric-tools', String(state.tools.length)); text('#metric-live', String(state.tools.filter(t => toolMeta(t, 'status') === 'live').length)); text('#metric-products', String(productsSet.size));
    if (!filtered.length) { $('#tool-grid').innerHTML = '<div class="empty-state">No matching capabilities.</div>'; return; }
    $('#tool-grid').innerHTML = filtered.map(tool => { const status = toolMeta(tool, 'status', 'catalog'); const product = toolMeta(tool, 'product', 'BCS ONE'); const domain = toolMeta(tool, 'domain', tool.name.split('.')[0]); return `<article class="tool-card ${status === 'live' ? 'live' : ''}"><div class="tool-top"><div class="tool-name">${escapeHtml(tool.name)}</div><span class="tag ${status === 'live' ? 'live' : ''}">${escapeHtml(status)}</span></div><div class="tool-desc">${escapeHtml(tool.description || '')}</div><div class="tool-meta"><span class="tag">${escapeHtml(domain)}</span><span class="tag">${escapeHtml(product)}</span>${tool.annotations?.readOnlyHint ? '<span class="tag">read-only</span>' : ''}</div></article>`; }).join('');
  }

  async function refreshRuns() {
    if (!getToken()) { $('#run-list').innerHTML = '<div class="empty-state">Sign in to load persistent runs.</div>'; return; }
    $('#refresh-runs').disabled = true;
    try {
      const response = await fetch(`${config.gatewayUrl}/v1/runs?limit=50`, { headers: apiHeaders() }); const payload = await response.json();
      if (!response.ok) throw new Error(payload.code || `HTTP ${response.status}`);
      state.runs = payload.runs || []; text('#runs-backend', payload.stateBackend === 'postgres' ? 'Postgres' : payload.stateBackend || '—'); renderRuns();
    } catch (error) { $('#run-list').innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`; }
    finally { $('#refresh-runs').disabled = false; }
  }
  $('#refresh-runs').addEventListener('click', refreshRuns);
  function renderRuns() {
    text('#runs-total', String(state.runs.length)); text('#runs-completed', String(state.runs.filter(r => r.status === 'completed').length)); text('#runs-exception', String(state.runs.filter(r => r.status !== 'completed').length));
    if (!state.runs.length) { $('#run-list').innerHTML = '<div class="empty-state">No persisted runs yet.</div>'; return; }
    $('#run-list').innerHTML = state.runs.map(run => `<button class="run-row" data-run-id="${escapeHtml(run.runId)}"><div><strong>${escapeHtml(run.workflowType)}</strong><small class="mono">${escapeHtml(run.runId)}</small></div><div><span class="status ${run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}">${escapeHtml(run.status.toUpperCase())}</span><small>${escapeHtml(fmtTime(run.startedAt))}</small></div></button>`).join('');
    $$('.run-row').forEach(row => row.addEventListener('click', () => void loadRun(row.dataset.runId)));
  }
  async function loadRun(runId) {
    $('#run-detail').className = 'card-body'; $('#run-detail').innerHTML = '<div class="empty-state">Loading run evidence…</div>';
    try {
      const response = await fetch(`${config.gatewayUrl}/v1/runs/${encodeURIComponent(runId)}`, { headers: apiHeaders() }); const payload = await response.json();
      if (!response.ok) throw new Error(payload.code || `HTTP ${response.status}`);
      const run = payload.run; const events = payload.events || []; const artifacts = payload.artifacts || [];
      $('#run-detail').innerHTML = `<div class="run-inspector"><div class="key-values"><span>Status</span><strong>${escapeHtml(run.status)}</strong><span>Thread</span><strong class="mono">${escapeHtml(run.threadId)}</strong><span>Current node</span><strong>${escapeHtml(run.currentNode || '—')}</strong><span>Started</span><strong>${escapeHtml(fmtTime(run.startedAt))}</strong><span>Completed</span><strong>${escapeHtml(fmtTime(run.completedAt))}</strong></div><h4>Agent artifacts</h4><div class="artifact-list">${artifacts.length ? artifacts.map(a => `<div class="artifact-row"><div><strong>${escapeHtml(a.artifactType)}</strong><small>${escapeHtml(a.producerAgent)} · ${escapeHtml(a.sourceSystem || 'internal')}</small></div><span class="tag">${escapeHtml(a.classification)}</span></div>`).join('') : '<div class="empty-state">No artifacts.</div>'}</div><h4>Persisted events</h4><div class="mini-events">${events.map(e => `<div><span class="mono">#${escapeHtml(e.sequence)}</span><b>${escapeHtml(e.stage)}</b><span>${escapeHtml(e.event)}</span><small>${escapeHtml(e.durationMs == null ? '—' : `${e.durationMs} ms`)}</small></div>`).join('')}</div></div>`;
    } catch (error) { $('#run-detail').innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`; }
  }

  async function refreshEvaluations() {
    if (!getToken()) return;
    $('#refresh-evals').disabled = true;
    try {
      const response = await fetch(`${config.gatewayUrl}/v1/evaluations`, { headers: apiHeaders() }); const payload = await response.json();
      if (!response.ok) throw new Error(payload.code || `HTTP ${response.status}`);
      state.evals = payload.runs || []; renderEvaluations();
    } catch (error) { $('#eval-list').innerHTML = `<div class="empty-state">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`; }
    finally { $('#refresh-evals').disabled = false; }
  }
  $('#refresh-evals').addEventListener('click', refreshEvaluations);
  function renderEvaluations() {
    const latest = state.evals[0];
    if (!latest) { text('#eval-status', '—'); text('#eval-pass-rate', '—'); text('#eval-hard-failures', '—'); text('#eval-suite', '—'); $('#eval-list').innerHTML = '<div class="empty-state">No evaluation runs have been recorded.</div>'; return; }
    const rate = latest.totalCases ? Math.round((latest.passedCases / latest.totalCases) * 1000) / 10 : 0;
    text('#eval-status', String(latest.status).toUpperCase()); text('#eval-pass-rate', `${rate}%`); text('#eval-hard-failures', String(latest.hardGateFailures)); text('#eval-suite', latest.suiteName);
    $('#eval-list').innerHTML = state.evals.map(run => { const r = run.totalCases ? Math.round((run.passedCases / run.totalCases) * 1000) / 10 : 0; return `<div class="eval-row"><div><strong>${escapeHtml(run.suiteName)}</strong><small class="mono">${escapeHtml(run.evalRunId)}</small></div><div class="eval-score"><b>${r}%</b><small>${escapeHtml(run.passedCases)}/${escapeHtml(run.totalCases)} passed</small></div><div><span class="status ${run.status === 'passed' ? 'success' : 'danger'}">${escapeHtml(String(run.status).toUpperCase())}</span><small>${escapeHtml(fmtTime(run.completedAt || run.startedAt))}</small></div><div><b>${escapeHtml(run.hardGateFailures)}</b><small>hard failures</small></div></div>`; }).join('');
  }

  function renderProducts() {
    $('#product-grid').innerHTML = products.map(product => `<article class="product-card"><div class="product-domain">${escapeHtml(product.domain)}</div><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p><div class="product-capabilities">${product.capabilities.map(c => `<span class="tag">${escapeHtml(c)}</span>`).join('')}</div><div class="product-footer"><span>${escapeHtml(product.mode)}</span><span>SYNTHETIC SHOWCASE</span></div></article>`).join('');
  }

  function updateObservability() {
    const duration = state.startedAt ? Math.max(...state.events.map(e => Number(e.elapsedMs || 0)), Date.now() - state.startedAt) : 0;
    text('#obs-duration', state.events.length ? `${duration} ms` : '—'); text('#obs-events', String(state.events.length)); text('#obs-tools', String(new Set(state.events.filter(e => e.tool).map(e => e.tool)).size));
    const policyEvent = [...state.events].reverse().find(e => e.stage === 'policy' && ['allowed','denied','failed','error'].includes(e.status));
    text('#obs-policy', policyEvent ? (['denied','failed','error'].includes(policyEvent.status) ? 'DENY' : 'ALLOW') : '—');
    text('#obs-health', state.events.length ? ($('#run-status').textContent || 'RUN') : 'NO RUN'); $('#obs-health').className = state.events.length ? ($('#run-status').className || 'status neutral') : 'status neutral';
    const durations = state.events.filter(e => e.durationMs != null && e.stage).map(e => ({ stage: e.stage, duration: Number(e.durationMs) }));
    if (durations.length) { const max = Math.max(...durations.map(d => d.duration), 1); $('#latency-list').innerHTML = durations.map(d => `<div class="latency-row"><span>${escapeHtml(d.stage)}</span><div class="latency-bar"><i style="width:${Math.max(3, d.duration / max * 100)}%"></i></div><strong>${escapeHtml(d.duration)} ms</strong></div>`).join(''); } else $('#latency-list').innerHTML = '<div class="empty-state">Run a workflow first.</div>';
    const source = state.result?.facts?.sourceSystem || '—'; const aiInvoked = Boolean(state.result?.explanation);
    $('#evidence-list').innerHTML = `<span>Request ID</span><strong class="mono">${escapeHtml(state.requestId || '—')}</strong><span>Run ID</span><strong class="mono">${escapeHtml(state.runId || '—')}</strong><span>Source</span><strong>${escapeHtml(source)}</strong><span>AI invoked</span><strong>${aiInvoked ? 'Yes' : 'No'}</strong><span>Result</span><strong>${escapeHtml($('#run-status').textContent || '—')}</strong>`;
  }

  async function init() {
    renderProducts(); resetRun();
    try { await completeLogin(); } catch (error) { console.error(error); alert(error instanceof Error ? error.message : String(error)); history.replaceState({}, '', '/'); }
    refreshIdentity();
    if (getToken()) { void refreshTools(); void refreshRuns(); void refreshEvaluations(); }
  }
  void init();
})();

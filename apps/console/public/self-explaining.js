(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const nativeFetch = window.fetch.bind(window);
  const scenarioContracts = new Map();
  const monitor = { events: [], result: null, scenarioId: '', input: null };

  const employers = [
    { id: 'SYN-NL-001', name: 'NorthSea Logistics BV', sector: 'Logistics', start: 1, end: 3000 },
    { id: 'SYN-NL-002', name: 'Delta Retail Group', sector: 'Retail', start: 3001, end: 5500 },
    { id: 'SYN-NL-003', name: 'Tulip Care Services', sector: 'Professional Services', start: 5501, end: 7500 },
    { id: 'SYN-NL-004', name: 'OrangeWorks Manufacturing', sector: 'Manufacturing', start: 7501, end: 9000 },
    { id: 'SYN-NL-005', name: 'CanalTech Services', sector: 'Technology Services', start: 9001, end: 10000 }
  ].map(item => ({ ...item, employeeCount: item.end - item.start + 1 }));

  const TOTAL_EMPLOYEES = employers.reduce((sum, item) => sum + item.employeeCount, 0);
  const firstNames = ['Sanne', 'Daan', 'Lotte', 'Bram', 'Noor', 'Sem', 'Eva', 'Milan'];
  const lastNames = ['de Vries', 'Jansen', 'Bakker', 'Smit', 'Visser', 'Meijer', 'de Boer', 'Mulder'];
  const jobTitles = ['Payroll Specialist', 'HR Business Partner', 'Finance Analyst', 'Operations Coordinator'];
  const departments = ['HR', 'Finance', 'Operations', 'Customer Success'];

  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const unique = values => [...new Set(values.filter(Boolean))];

  function addStylesheet() {
    if (document.querySelector('link[data-bcs-self-explaining]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/self-explaining.css';
    link.dataset.bcsSelfExplaining = 'true';
    document.head.appendChild(link);
  }

  function hash(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      h ^= value.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function tenantId() {
    return config.tenantId || 'synthetic-bcs-one-tenant';
  }

  function employerForIndex(index) {
    return employers.find(item => index >= item.start && index <= item.end) || employers[0];
  }

  function employeeIndex(employeeId) {
    const match = String(employeeId || '').match(/(\d+)$/);
    const value = match ? Number(match[1]) : 1001;
    return Number.isInteger(value) && value >= 1 && value <= TOTAL_EMPLOYEES ? value : 1001;
  }

  function employeeRecord(index) {
    const employeeId = `EMP-${index}`;
    const seed = hash(`${tenantId()}:${employeeId}:profile`);
    const first = firstNames[seed % firstNames.length];
    const last = lastNames[Math.floor(seed / firstNames.length) % lastNames.length];
    const employer = employerForIndex(index);
    return {
      index,
      employeeId,
      displayName: `${first} ${last}`,
      preferredName: first,
      jobTitle: jobTitles[seed % jobTitles.length],
      department: departments[Math.floor(seed / 4) % departments.length],
      managerId: `MGR-${100 + (seed % 50)}`,
      employer
    };
  }

  function currentEmployee() {
    return employeeRecord(employeeIndex($('#employee-id')?.value || 'EMP-1001'));
  }

  function searchEmployees(query, employerId) {
    const q = String(query || '').trim().toLowerCase();
    const employer = employers.find(item => item.id === employerId);
    const start = employer?.start || 1;
    const end = employer?.end || TOTAL_EMPLOYEES;
    const direct = q.match(/(?:emp-)?(\d+)$/i);
    if (direct) {
      const index = Number(direct[1]);
      if (index >= start && index <= end) return [employeeRecord(index)];
    }
    const result = [];
    for (let index = start; index <= end && result.length < 12; index += 1) {
      const record = employeeRecord(index);
      const haystack = `${record.employeeId} ${record.displayName} ${record.jobTitle} ${record.department} ${record.managerId}`.toLowerCase();
      if (!q || haystack.includes(q)) result.push(record);
    }
    return result;
  }

  function insertSelfExplainingSections() {
    const view = $('#view-scenarios');
    const hero = view?.querySelector('.hero-row');
    const scenarioLayout = view?.querySelector('.scenario-layout');
    const metrics = view?.querySelector('.proof-metrics');
    const graph = view?.querySelector('.graph-card');
    const form = $('#scenario-form');
    if (!view || !hero || !scenarioLayout || !metrics || !graph || !form || $('#enterprise-context')) return;

    const heroEyebrow = hero.querySelector('.eyebrow');
    const heroTitle = hero.querySelector('h1');
    const heroText = hero.querySelector('p');
    if (heroEyebrow) heroEyebrow.textContent = 'SELF-EXPLAINING ENTERPRISE WORKFORCE + MCP LAB';
    if (heroTitle) heroTitle.textContent = 'From an HR business question to a governed cross-product answer — with every layer visible.';
    if (heroText) heroText.textContent = 'Choose any employee from the 10,000-person synthetic workforce, select a business scenario, and watch identity, policy, MCP, product adapters, structured evidence and grounded AI produce the final response.';

    hero.insertAdjacentHTML('afterend', `
      <section id="enterprise-context" class="explain-context">
        <div class="explain-context-copy">
          <span class="explain-kicker">WHAT THIS WEBSITE PROVES</span>
          <h2>BCS ONE is a governed AI federation layer across specialist HR products.</h2>
          <p>This pilot runs on live Azure infrastructure with deterministic synthetic business data. It does not contain BCS customer payroll or HR records. A selected employee is one member of a virtual enterprise workforce, not a single hard-coded test record.</p>
        </div>
        <div class="context-metrics">
          <div><strong>${TOTAL_EMPLOYEES.toLocaleString()}</strong><span>synthetic employees</span></div>
          <div><strong>${employers.length}</strong><span>synthetic employers</span></div>
          <div><strong>10</strong><span>BCS product domains</span></div>
          <div><strong>8</strong><span>governed scenarios</span></div>
        </div>
        <div class="truth-boundary"><b>Truth boundary</b><span>Azure, Entra, Gateway, OPA, LangGraph, PostgreSQL, MCP, adapters and Azure OpenAI execute live. Product records are synthetic reference data generated deterministically for this pilot.</span></div>
      </section>
      <section class="how-to-read card">
        <div class="card-header"><div><div class="card-title">How to read this application</div><div class="card-subtitle">The page separates the business outcome from the technical proof underneath it.</div></div></div>
        <div class="how-steps">
          <div><b>1</b><strong>Choose a business case</strong><span>The scenario defines the HR question and exact capabilities needed.</span></div>
          <div><b>2</b><strong>Execute governed data access</strong><span>Identity and OPA authorization happen before product capabilities are called.</span></div>
          <div><b>3</b><strong>Preserve evidence</strong><span>Every MCP result remains structured, source-attributable and persisted as an artifact.</span></div>
          <div><b>4</b><strong>Produce the answer</strong><span>Azure OpenAI synthesizes only the governed evidence; the graph proves how it was produced.</span></div>
        </div>
      </section>`);

    const originalEmployeeLabel = $('#employee-id')?.closest('label');
    if (originalEmployeeLabel) originalEmployeeLabel.classList.add('technical-employee-id');
    if ($('#employee-id')) $('#employee-id').readOnly = true;

    form.insertAdjacentHTML('afterbegin', `
      <div class="workforce-picker form-span-two">
        <div class="picker-head"><div><span class="explain-kicker">SYNTHETIC WORKFORCE REGISTRY</span><strong>Select a real member of the 10,000-person pilot population</strong></div><button id="random-employee" class="button secondary" type="button">Pick another employee</button></div>
        <div class="picker-grid">
          <label>Employer<select id="employer-select"></select></label>
          <label class="employee-search-label">Find employee<input id="employee-search" autocomplete="off" placeholder="Search name, ID, job, department…" /><div id="employee-options" class="employee-options hidden"></div></label>
        </div>
        <div id="selected-employee" class="selected-employee"></div>
        <div class="picker-note">The employer grouping is synthetic demo context. When the scenario runs, product facts are retrieved live from the reference adapters for the selected employee ID.</div>
      </div>`);

    scenarioLayout.insertAdjacentHTML('afterend', `
      <article id="scenario-story" class="card scenario-story">
        <div class="card-header"><div><div class="card-title">Why this scenario exists and what will happen</div><div class="card-subtitle">Dynamic explanation generated from the selected scenario contract.</div></div><span id="story-call-count" class="counter">—</span></div>
        <div id="scenario-story-body" class="card-body"><div class="empty-state">Select a scenario to see the business problem, product plan and governance boundaries.</div></div>
      </article>`);

    metrics.insertAdjacentHTML('beforebegin', `
      <article id="business-answer" class="card business-answer">
        <div class="card-header"><div><div class="card-title">Final business response</div><div class="card-subtitle">The answer a HR professional receives; technical proof remains below.</div></div><span id="answer-status" class="status neutral">NO RUN</span></div>
        <div id="business-answer-body" class="card-body business-answer-body">
          <div class="answer-placeholder"><strong>No scenario has been executed yet.</strong><span>Select an employee and scenario, then run the governed analysis. This panel will explain the result, evidence sources, AI boundary and why the response is trustworthy.</span></div>
        </div>
      </article>`);

    graph.insertAdjacentHTML('beforebegin', `
      <article id="layer-explainer" class="card layer-explainer">
        <div class="card-header"><div><div class="card-title">What happened in each layer</div><div class="card-subtitle">Updated from the actual streaming execution events — not a scripted animation.</div></div><span id="layer-progress" class="counter">0 / 9 layers</span></div>
        <div id="layer-explainer-body" class="layer-grid"></div>
      </article>`);

    populateEmployers();
    selectEmployee(currentEmployee());
    renderLayerJourney();
  }

  function populateEmployers() {
    const select = $('#employer-select');
    if (!select) return;
    select.innerHTML = `<option value="">All synthetic employers · ${TOTAL_EMPLOYEES.toLocaleString()} employees</option>` + employers.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${item.employeeCount.toLocaleString()} employees</option>`).join('');
    const current = currentEmployee();
    select.value = current.employer.id;
    select.addEventListener('change', () => {
      const employer = employers.find(item => item.id === select.value);
      if (employer) selectEmployee(employeeRecord(employer.start));
      renderEmployeeOptions($('#employee-search')?.value || '');
    });
  }

  function selectEmployee(record) {
    const input = $('#employee-id');
    const thread = $('#thread-id');
    const candidate = $('#candidate-id');
    if (input) input.value = record.employeeId;
    if (thread) thread.value = `${record.employeeId}-HR-SCENARIO`;
    if (candidate) candidate.value = `CAND-${record.index}`;
    if ($('#employer-select')) $('#employer-select').value = record.employer.id;
    if ($('#employee-search')) $('#employee-search').value = `${record.displayName} · ${record.employeeId}`;
    const target = $('#selected-employee');
    if (target) target.innerHTML = `
      <div class="employee-avatar">${esc(record.preferredName.slice(0, 1))}${esc(record.displayName.split(' ').slice(-1)[0].slice(0, 1))}</div>
      <div class="employee-main"><strong>${esc(record.displayName)}</strong><span>${esc(record.employeeId)} · ${esc(record.jobTitle)}</span></div>
      <div><span>Employer</span><strong>${esc(record.employer.name)}</strong></div>
      <div><span>Department</span><strong>${esc(record.department)}</strong></div>
      <div><span>Manager ID</span><strong>${esc(record.managerId)}</strong></div>`;
    $('#employee-options')?.classList.add('hidden');
    renderScenarioStory();
  }

  function renderEmployeeOptions(query) {
    const root = $('#employee-options');
    if (!root) return;
    const records = searchEmployees(query, $('#employer-select')?.value || '');
    root.innerHTML = records.length ? records.map(record => `
      <button type="button" data-employee-index="${record.index}"><strong>${esc(record.displayName)}</strong><span>${esc(record.employeeId)} · ${esc(record.jobTitle)} · ${esc(record.department)}</span></button>`).join('') : '<div class="employee-no-result">No employee matched that search.</div>';
    root.classList.remove('hidden');
    root.querySelectorAll('[data-employee-index]').forEach(button => button.addEventListener('click', () => selectEmployee(employeeRecord(Number(button.dataset.employeeIndex)))));
  }

  function wireWorkforcePicker() {
    const search = $('#employee-search');
    if (!search || search.dataset.wired) return;
    search.dataset.wired = 'true';
    search.addEventListener('focus', () => renderEmployeeOptions(search.value));
    search.addEventListener('input', () => renderEmployeeOptions(search.value));
    $('#random-employee')?.addEventListener('click', () => {
      const employer = employers.find(item => item.id === $('#employer-select')?.value);
      const start = employer?.start || 1;
      const end = employer?.end || TOTAL_EMPLOYEES;
      const index = start + Math.floor(Math.random() * (end - start + 1));
      selectEmployee(employeeRecord(index));
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.employee-search-label')) $('#employee-options')?.classList.add('hidden');
    });
  }

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token');
    const expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    return token && (!expires || expires > Date.now() + 15000) ? token : '';
  }

  async function refreshScenarioContracts() {
    const token = getToken();
    if (!token || !config.gatewayUrl) return;
    try {
      const response = await nativeFetch(`${config.gatewayUrl}/v1/scenarios`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return;
      const payload = await response.json();
      rememberScenarios(payload);
    } catch { /* the primary application owns connectivity errors */ }
  }

  function rememberScenarios(payload) {
    const scenarios = Array.isArray(payload?.scenarios) ? payload.scenarios : [];
    scenarios.forEach(item => scenarioContracts.set(item.id, item));
    renderScenarioStory();
  }

  function selectedScenarioId() {
    return $('.scenario-card.selected[data-scenario]')?.dataset.scenario || monitor.scenarioId || '';
  }

  function renderScenarioStory() {
    const root = $('#scenario-story-body');
    if (!root) return;
    const scenario = scenarioContracts.get(selectedScenarioId());
    if (!scenario) {
      root.innerHTML = '<div class="empty-state">Sign in and select a scenario to load its executable contract.</div>';
      return;
    }
    const products = unique((scenario.tools || []).map(tool => tool.product));
    $('#story-call-count').textContent = `${scenario.mcpCallCount} MCP call${scenario.mcpCallCount === 1 ? '' : 's'}`;
    root.innerHTML = `
      <div class="story-grid">
        <section><span class="story-label">BUSINESS QUESTION</span><h3>${esc(scenario.businessQuestion)}</h3><p>${esc(scenario.description)}</p></section>
        <section><span class="story-label">WHY BCS ONE</span><h3>${esc(scenario.valueStatement)}</h3><p>The model is not connected directly to vendor APIs. The supervisor invokes stable canonical capabilities and the MCP layer resolves the product path.</p></section>
      </div>
      <div class="planned-journey">
        <div class="planned-step"><b>1</b><span><strong>Entra + Gateway</strong><small>Establish user, tenant, roles and business purpose.</small></span></div>
        <div class="planned-step"><b>2</b><span><strong>OPA policy</strong><small>Authorize the scenario and each capability before data retrieval.</small></span></div>
        <div class="planned-step"><b>3</b><span><strong>LangGraph supervisor</strong><small>Build the ${esc(scenario.mode)} execution plan.</small></span></div>
        <div class="planned-step accent"><b>${scenario.mcpCallCount}</b><span><strong>MCP tools/call</strong><small>${esc(products.join(' · '))}</small></span></div>
        <div class="planned-step"><b>5</b><span><strong>Structured evidence</strong><small>Persist source-attributable artifacts before AI synthesis.</small></span></div>
        <div class="planned-step"><b>6</b><span><strong>Azure OpenAI</strong><small>Synthesize only governed evidence into the business response.</small></span></div>
      </div>
      <div class="tool-plan">${(scenario.tools || []).map((tool, index) => `<div><span class="plan-index">${index + 1}</span><span><strong class="mono">${esc(tool.capability)}</strong><small>${esc(tool.domain)} · ${esc(tool.product)} · ${esc(tool.agent)}</small></span></div>`).join('')}</div>
      <div class="scenario-boundary"><strong>AI boundary</strong><span>The LLM may summarize and explain the evidence. It does not grant access, choose the tenant, authorize the capability, calculate statutory payroll, invent regulated facts or replace the source systems.</span></div>`;
  }

  function formatValue(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    return 'structured object';
  }

  function evidenceRows(fact) {
    const data = fact?.data && typeof fact.data === 'object' ? fact.data : {};
    return Object.entries(data)
      .filter(([key, value]) => !['employeeId', 'freshness', 'sourceSystem'].includes(key) && ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 4)
      .map(([key, value]) => `<div><span>${esc(key.replace(/([A-Z])/g, ' $1').replace(/^./, ch => ch.toUpperCase()))}</span><strong>${esc(formatValue(value))}</strong></div>`)
      .join('');
  }

  function formatNarrative(value) {
    const text = String(value || '').trim();
    if (!text) return '<p>No AI synthesis was requested for this run.</p>';
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const bullets = lines.filter(line => /^[-*•]\s+/.test(line));
    if (bullets.length >= 2) {
      const intro = lines.filter(line => !/^[-*•]\s+/.test(line));
      return `${intro.map(line => `<p>${esc(line)}</p>`).join('')}<ul>${bullets.map(line => `<li>${esc(line.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
    }
    return lines.map(line => `<p>${esc(line)}</p>`).join('');
  }

  function renderBusinessAnswer(payload) {
    monitor.result = payload;
    const root = $('#business-answer-body');
    if (!root) return;
    const scenario = scenarioContracts.get(payload?.scenarioId || monitor.scenarioId || selectedScenarioId());
    const employee = currentEmployee();
    const facts = Array.isArray(payload?.facts) ? payload.facts : [];
    const products = unique(facts.map(item => item.product));
    const artifacts = unique(facts.map(item => item.artifactId));
    const synthesis = payload?.synthesis;
    $('#answer-status').textContent = payload?.status || 'COMPLETE';
    $('#answer-status').className = `status ${payload?.status === 'FULL' ? 'success' : 'info'}`;
    root.innerHTML = `
      <div class="answer-identity"><div><span class="story-label">BUSINESS OUTCOME</span><h2>${esc(scenario?.title || payload?.scenarioTitle || 'BCS ONE result')}</h2><p>${esc(employee.displayName)} · ${esc(employee.employeeId)} · ${esc(employee.employer.name)} · ${esc(employee.jobTitle)}</p></div><div class="answer-proof"><strong>${facts.length}</strong><span>source artifacts</span><strong>${products.length}</strong><span>products reached</span></div></div>
      <div class="answer-narrative"><span class="story-label">FINAL RESPONSE FOR HR</span>${formatNarrative(synthesis)}</div>
      <div class="answer-evidence"><span class="story-label">EVIDENCE USED TO PRODUCE THIS RESPONSE</span><div class="answer-evidence-grid">${facts.map(fact => `<article><div class="answer-source-head"><strong>${esc(fact.product || 'Product')}</strong><span class="mono">${esc(fact.capability || '')}</span></div><small>${esc(fact.sourceSystem || 'source system')}</small><div class="answer-facts">${evidenceRows(fact) || '<div><span>Payload</span><strong>Structured data available below</strong></div>'}</div></article>`).join('')}</div></div>
      <div class="answer-explanation">
        <div><strong>What happened</strong><span>${facts.length} governed MCP result${facts.length === 1 ? '' : 's'} were persisted as ${artifacts.length} attributable artifact${artifacts.length === 1 ? '' : 's'} and then ${synthesis ? 'provided to Azure OpenAI for grounded synthesis' : 'returned without model synthesis'}.</span></div>
        <div><strong>Why trust it</strong><span>The source facts remain visible below. AI text is a separate artifact and cannot silently overwrite payroll, leave, absence, learning or workforce records.</span></div>
        <div><strong>Data boundary</strong><span>This is deterministic synthetic reference data. No production BCS customer or employee data is used in this website.</span></div>
      </div>`;
    renderLayerJourney();
  }

  const layerDefinitions = [
    { id: 'identity', title: '1 · Identity', match: event => event.stage === 'identity', explain: 'Microsoft Entra validates who the user is and which application roles are present.' },
    { id: 'gateway', title: '2 · Trusted gateway context', match: event => event.stage === 'gateway', explain: 'Gateway creates trusted tenant, user, role, purpose and request correlation headers. The model cannot supply these values.' },
    { id: 'policy', title: '3 · OPA governance', match: event => event.stage === 'policy', explain: 'Deterministic policy authorizes the scenario and every capability before sensitive HR data is retrieved.' },
    { id: 'orchestrator', title: '4 · Agent orchestration', match: event => event.stage === 'orchestrator' && !['workflow.result', 'workflow.completed'].includes(event.event), explain: 'LangGraph supervisor plans the scenario, delegates capability branches and merges artifact references.' },
    { id: 'mcp', title: '5 · MCP capability calls', match: event => event.stage === 'mcp', explain: 'Canonical MCP tools/call operations decouple the AI workflow from product-specific APIs.' },
    { id: 'adapter', title: '6 · Product adapters', match: event => event.stage === 'adapter', explain: 'Adapters translate the canonical capability contract into the specialist product boundary.' },
    { id: 'source', title: '7 · Structured source evidence', match: event => event.stage === 'source', explain: 'Source-system shaped JSON returns with product, source, output shape and artifact provenance.' },
    { id: 'ai', title: '8 · Grounded AI', match: event => event.stage === 'ai', explain: 'Azure OpenAI receives only the governed evidence and produces a separate synthesis artifact.' },
    { id: 'result', title: '9 · Business response', match: event => event.event === 'workflow.result' || event.event === 'workflow.completed', explain: 'BCS ONE assembles the final business response while preserving all underlying evidence and trace IDs.' }
  ];

  function renderLayerJourney() {
    const root = $('#layer-explainer-body');
    if (!root) return;
    let completedLayers = 0;
    root.innerHTML = layerDefinitions.map(layer => {
      const events = monitor.events.filter(layer.match);
      const failed = events.some(event => ['failed', 'denied', 'error'].includes(event.status));
      const completed = events.some(event => ['completed', 'allowed', 'skipped'].includes(event.status));
      const started = events.length > 0;
      if (completed && !failed) completedLayers += 1;
      const calls = unique(events.map(event => event.callId));
      const products = unique(events.map(event => event.product));
      const capabilities = unique(events.map(event => event.capability || event.tool));
      const durations = events.map(event => Number(event.durationMs)).filter(Number.isFinite);
      const duration = durations.length ? `${Math.max(...durations)} ms` : '—';
      const status = failed ? 'failed' : completed ? 'complete' : started ? 'running' : 'waiting';
      const detail = layer.id === 'mcp' && calls.length ? `${calls.length} call${calls.length === 1 ? '' : 's'} · ${capabilities.slice(0, 3).join(', ')}${capabilities.length > 3 ? '…' : ''}` : products.length ? products.join(' · ') : events.at(-1)?.message || 'Waiting for this layer.';
      return `<article class="layer-item ${status}"><div class="layer-top"><span class="layer-dot"></span><strong>${esc(layer.title)}</strong><span class="layer-status">${status.toUpperCase()}</span></div><p>${esc(layer.explain)}</p><div class="layer-actual"><span>Actual run</span><strong>${esc(detail)}</strong><small>${esc(duration)}</small></div></article>`;
    }).join('');
    $('#layer-progress').textContent = `${completedLayers} / ${layerDefinitions.length} layers`;
  }

  function resetMonitoredRun(scenarioId, input) {
    monitor.events = [];
    monitor.result = null;
    monitor.scenarioId = scenarioId || selectedScenarioId();
    monitor.input = input || null;
    $('#answer-status').textContent = 'RUNNING';
    $('#answer-status').className = 'status info';
    if ($('#business-answer-body')) $('#business-answer-body').innerHTML = `<div class="answer-placeholder running"><strong>Governed execution is running for ${esc(currentEmployee().displayName)}.</strong><span>The final response will appear here after policy, MCP, product adapters, structured evidence and optional Azure OpenAI synthesis complete.</span></div>`;
    renderLayerJourney();
  }

  function handleMonitoredEvent(event) {
    monitor.events.push(event);
    if (event?.payload?.scenarioId) monitor.scenarioId = event.payload.scenarioId;
    if (event.type === 'result' || event.event === 'workflow.result') renderBusinessAnswer(event.payload || event.result || event.data || {});
    if ((event.type === 'error' || event.status === 'failed') && $('#answer-status')) {
      $('#answer-status').textContent = 'FAILED';
      $('#answer-status').className = 'status danger';
    }
    renderLayerJourney();
  }

  async function monitorSse(response) {
    if (!response.body) return;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
        if (!data) continue;
        try { handleMonitoredEvent(JSON.parse(data)); } catch { /* primary console owns SSE diagnostics */ }
      }
    }
  }

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const isScenarioStream = method === 'POST' && /\/v1\/scenarios\/[^/]+\/stream(?:\?|$)/.test(url);
    if (isScenarioStream) {
      const match = url.match(/\/v1\/scenarios\/([^/]+)\/stream/);
      let body;
      try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; } catch { body = null; }
      resetMonitoredRun(match ? decodeURIComponent(match[1]) : selectedScenarioId(), body);
    }
    const response = await nativeFetch(input, init);
    if (method === 'GET' && /\/v1\/scenarios(?:\?|$)/.test(url)) response.clone().json().then(rememberScenarios).catch(() => {});
    if (isScenarioStream) void monitorSse(response.clone());
    return response;
  };

  function observeScenarioSelection() {
    const grid = $('#scenario-grid');
    if (!grid) return;
    grid.addEventListener('click', () => setTimeout(renderScenarioStory, 0));
    const observer = new MutationObserver(() => {
      renderScenarioStory();
      if (scenarioContracts.size === 0) void refreshScenarioContracts();
    });
    observer.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  function initialize() {
    addStylesheet();
    insertSelfExplainingSections();
    wireWorkforcePicker();
    observeScenarioSelection();
    renderScenarioStory();
    void refreshScenarioContracts();
    setTimeout(() => void refreshScenarioContracts(), 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();

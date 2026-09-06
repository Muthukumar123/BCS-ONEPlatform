(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const state = {
    scenarios: [],
    tools: [],
    runs: [],
    evals: [],
    workforce: null,
    scenarioId: '',
    lens: 'product',
    runDetails: null,
    loading: false
  };

  const businessContracts = {
    'single-payroll-summary': {
      actor: 'Payroll or HR specialist',
      outcome: 'Explain a payroll summary without copying payroll calculation authority into the AI layer.',
      decision: 'Answer a payroll question using one governed source and prove exactly where the figures came from.',
      productValue: 'Lowest-complexity proof that an AI experience can use a stable canonical capability instead of embedding product-specific API logic.',
      analystFocus: 'Employee + period inputs, payroll authorization, source provenance, structured amounts and the boundary between payroll facts and AI explanation.',
      exceptions: ['Employee is outside the caller scope', 'Payroll period is invalid', 'Payroll adapter is unavailable', 'AI explanation is unavailable while source facts remain authoritative']
    },
    'employee-360': {
      actor: 'HR business partner',
      outcome: 'Create one governed employee briefing from multiple BCS product domains.',
      decision: 'Understand the employee context without manually opening six separate products.',
      productValue: 'Demonstrates the BCS ONE product thesis after acquisitions: one business workflow remains stable while specialist products stay systems of record.',
      analystFocus: 'Cross-product identity correlation, six data contracts, source attribution, policy per capability and grounded synthesis rules.',
      exceptions: ['One product has no record', 'A capability is denied by policy', 'Source data is stale or incomplete', 'AI synthesis must state insufficient evidence rather than inventing a conclusion']
    },
    'manager-meeting-prep': {
      actor: 'HR partner or people manager',
      outcome: 'Prepare an evidence-backed employee conversation while protecting restricted absence information.',
      decision: 'Identify the topics worth discussing and distinguish evidence from interpretation.',
      productValue: 'Turns fragmented HR, team, absence, performance and learning context into one preparation workflow.',
      analystFocus: 'Role/purpose access, restricted absence handling, manager/team context, actionable evidence and prohibited medical inference.',
      exceptions: ['Absence access denied', 'Learning data missing', 'Performance goals unavailable', 'No evidence-backed action is required']
    },
    'onboarding-control-tower': {
      actor: 'HR operations or onboarding owner',
      outcome: 'Reconcile onboarding readiness across contract, HR, talent, engagement and learning systems.',
      decision: 'Know what is complete, what remains open and which product owns the outstanding item.',
      productValue: 'Provides a cross-product control tower without replacing the acquired systems that own each onboarding step.',
      analystFocus: 'Lifecycle identity, completion semantics, cross-system status differences, source ownership and exception classification.',
      exceptions: ['Employee exists in HR but not talent onboarding', 'Contract exists but engagement journey is incomplete', 'Required learning remains outstanding', 'Conflicting completion statuses across products']
    },
    'workforce-day-view': {
      actor: 'Workforce operations or manager',
      outcome: 'Combine profile, schedule, recorded time and leave data for an operational workforce view.',
      decision: 'Detect schedule, time-registration or availability issues before they become operational exceptions.',
      productValue: 'Shows how Timegrip and adjacent BCS capabilities can participate in one operational workflow through canonical contracts.',
      analystFocus: 'Period handling, schedule/time reconciliation, leave context, exception rules and authoritative ownership of each fact.',
      exceptions: ['Recorded time differs from approved time', 'Schedule is unavailable', 'Leave context conflicts with planned work', 'Employee is not active']
    },
    'leave-absence-context': {
      actor: 'Authorized HR specialist',
      outcome: 'Provide permitted leave, absence-status and schedule context without exposing or inferring medical detail.',
      decision: 'Support HR handling using only the information the role and purpose are allowed to see.',
      productValue: 'Demonstrates governance across sensitive specialist products, not merely technical federation.',
      analystFocus: 'Purpose limitation, restricted absence status, medical-data prohibition, leave units, schedule context and evidence boundaries.',
      exceptions: ['Absence status is restricted', 'No active case exists', 'Leave balance is unavailable', 'The model attempts a medical or legal inference and must be prevented']
    },
    'offboarding-readiness': {
      actor: 'HR operations or offboarding owner',
      outcome: 'Check whether contract, payroll, benefits, learning and time prerequisites are ready for an offboarding process.',
      decision: 'Identify outstanding source-system items before a future governed write workflow is proposed.',
      productValue: 'Provides the read-side foundation for a later propose → approve → re-authorize → execute pattern.',
      analystFocus: 'Readiness criteria, outstanding-item ownership, no automatic termination action, period rules and future approval boundaries.',
      exceptions: ['Benefits remain active', 'Time entries are not approved', 'Payroll period has unresolved data', 'The employee is not eligible for the next workflow step']
    },
    'recruitment-to-onboarding': {
      actor: 'Talent acquisition or HR operations',
      outcome: 'Trace a candidate handoff from recruitment into post-hire onboarding products.',
      decision: 'Know whether the hire has propagated through the onboarding ecosystem and where the handoff stopped.',
      productValue: 'Demonstrates a canonical cross-product lifecycle that spans pre-hire and employee systems.',
      analystFocus: 'Candidate-to-employee correlation, handoff state, lifecycle transitions, missing-system records and ownership of remediation.',
      exceptions: ['Candidate is not yet hired', 'Employee onboarding record is missing', 'Engagement journey was not created', 'Learning assignment has not propagated']
    }
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const unique = values => [...new Set(values.filter(Boolean))];
  const fmtMs = value => Number.isFinite(Number(value)) ? `${Math.round(Number(value))} ms` : '—';
  const fmtTime = value => value ? new Date(value).toLocaleString() : '—';

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token');
    const expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    return token && (!expires || expires > Date.now() + 15000) ? token : '';
  }

  async function api(path) {
    const token = getToken();
    if (!token) throw new Error('Sign in with Entra to load live business blueprint data.');
    const response = await fetch(`${config.gatewayUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || `HTTP ${response.status}`);
    return body;
  }

  async function optionalApi(path) {
    try { return await api(path); } catch { return null; }
  }

  function injectPage() {
    if ($('#view-business-blueprint')) return;
    const nav = $('.nav');
    const main = $('.main');
    if (!nav || !main) return;

    const firstGroup = nav.querySelector('.nav-group');
    firstGroup?.insertAdjacentHTML('afterend', `
      <div class="nav-group business-nav-group"><div class="nav-label">BUSINESS DESIGN</div>
        <button class="nav-item" id="business-blueprint-nav" data-view="business-blueprint">Product Owner + BA View</button>
      </div>`);

    const firstView = $('#view-scenarios');
    firstView?.insertAdjacentHTML('afterend', `
      <section id="view-business-blueprint" class="page view business-blueprint-view">
        <div class="hero-row blueprint-hero">
          <div>
            <div class="eyebrow">BUSINESS + PRODUCT BLUEPRINT</div>
            <h1>Understand the business outcome, requirements, product dependencies and live data flow without reading implementation code.</h1>
            <p>This page translates the same executable BCS ONE scenarios into Product Owner and Business Analyst language, then overlays the latest real runtime evidence from Azure.</p>
          </div>
          <div class="hero-status"><span id="blueprint-live-status" class="status neutral">NOT LOADED</span><button id="refresh-blueprint" class="button secondary blueprint-refresh">Refresh live data</button></div>
        </div>

        <article class="card blueprint-truth">
          <div class="blueprint-truth-grid">
            <div><span class="bp-kicker">BUSINESS PURPOSE</span><strong>Federate specialist BCS products into governed workforce outcomes.</strong><p>BCS ONE coordinates access and evidence; it does not replace HR, payroll, workforce, talent or recruitment systems of record.</p></div>
            <div><span class="bp-kicker">WHAT IS LIVE</span><strong>Identity, policy, orchestration, MCP, adapters, persistence and Azure OpenAI.</strong><p>Runtime metrics on this page come from authenticated APIs and persisted execution events.</p></div>
            <div><span class="bp-kicker">WHAT IS SYNTHETIC</span><strong>Employer, employee and reference product business records.</strong><p>No production BCS customer HR/payroll records are represented by this pilot.</p></div>
          </div>
        </article>

        <div id="blueprint-metrics" class="metric-grid blueprint-metrics">
          <div class="metric"><span>Workforce population</span><strong id="bp-workforce">—</strong><small>synthetic reference population</small></div>
          <div class="metric"><span>Executable scenarios</span><strong id="bp-scenarios">—</strong><small>business workflows</small></div>
          <div class="metric"><span>Portfolio products</span><strong id="bp-products">—</strong><small>mapped by selected scenarios</small></div>
          <div class="metric accent-green"><span>MCP tools discovered</span><strong id="bp-tools">—</strong><small>live tools/list catalog</small></div>
          <div class="metric accent-blue"><span>Latest release gate</span><strong id="bp-eval">—</strong><small>enterprise evaluation suite</small></div>
        </div>

        <div class="blueprint-controls card">
          <div class="card-body bp-control-grid">
            <label>Business scenario<select id="bp-scenario-select"></select></label>
            <div class="bp-lens-control"><span>Audience lens</span><div class="bp-lens-buttons"><button type="button" class="button secondary active" data-bp-lens="product">Product Owner</button><button type="button" class="button secondary" data-bp-lens="analyst">Business Analyst</button></div></div>
            <div class="bp-live-run"><span>Latest matching live run</span><strong id="bp-run-reference">No run loaded</strong></div>
          </div>
        </div>

        <div class="grid two-col bp-summary-grid">
          <article class="card"><div class="card-header"><div><div class="card-title" id="bp-lens-title">Product Owner view</div><div class="card-subtitle">Why this capability should exist and what value it creates.</div></div></div><div id="bp-lens-body" class="card-body"></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Business requirement</div><div class="card-subtitle">User story, decision, scope and success outcome for the selected scenario.</div></div></div><div id="bp-requirement" class="card-body"></div></article>
        </div>

        <article class="card bp-flow-card">
          <div class="card-header"><div><div class="card-title">Detailed business data flow</div><div class="card-subtitle">Every row connects a business need to a canonical capability, source product, governance rule and latest runtime proof.</div></div><span id="bp-flow-count" class="counter">—</span></div>
          <div id="bp-data-flow" class="card-body"></div>
        </article>

        <div class="grid two-col bp-analysis-grid">
          <article class="card"><div class="card-header"><div><div class="card-title">Business rules and controls</div><div class="card-subtitle">Rules a BA can turn into requirements and test cases.</div></div></div><div id="bp-rules" class="card-body"></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Acceptance criteria + live evidence</div><div class="card-subtitle">Planned criteria become PASS/FAIL/WAITING when a matching run exists.</div></div></div><div id="bp-acceptance" class="card-body"></div></article>
        </div>

        <article class="card bp-runtime-card">
          <div class="card-header"><div><div class="card-title">Runtime journey in business language</div><div class="card-subtitle">The latest matching run is translated from persisted events into nine understandable stages.</div></div><span id="bp-runtime-progress" class="counter">0 / 9</span></div>
          <div id="bp-runtime-journey" class="card-body bp-runtime-journey"></div>
        </article>

        <div class="grid two-col bp-analysis-grid">
          <article class="card"><div class="card-header"><div><div class="card-title">Exception paths</div><div class="card-subtitle">Conditions the business process must handle explicitly.</div></div></div><div id="bp-exceptions" class="card-body"></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Ownership and change impact</div><div class="card-subtitle">Who owns what, and what changes when a product or acquisition changes underneath BCS ONE.</div></div></div><div id="bp-ownership" class="card-body"></div></article>
        </div>

        <article class="card bp-contract-card"><div class="card-header"><div><div class="card-title">Data contract inspection</div><div class="card-subtitle">Input requirements and actual output shapes from the latest persisted MCP execution.</div></div></div><div id="bp-contracts" class="card-body"></div></article>
      </section>`);

    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = '/product-ba.css';
    style.dataset.bcsProductBa = 'true';
    document.head.appendChild(style);

    $('#business-blueprint-nav')?.addEventListener('click', () => {
      $$('.view').forEach(view => view.classList.toggle('active-view', view.id === 'view-business-blueprint'));
      $$('.nav-item').forEach(item => item.classList.toggle('active', item.id === 'business-blueprint-nav'));
      const title = $('#page-title'); if (title) title.textContent = 'Product Owner + BA View';
      void refreshBlueprint();
    });
    $('#refresh-blueprint')?.addEventListener('click', () => void refreshBlueprint(true));
    $('#bp-scenario-select')?.addEventListener('change', event => {
      state.scenarioId = event.target.value;
      void loadLatestRun();
      renderAll();
    });
    $$('[data-bp-lens]').forEach(button => button.addEventListener('click', () => {
      state.lens = button.dataset.bpLens;
      $$('[data-bp-lens]').forEach(item => item.classList.toggle('active', item === button));
      renderLens();
    }));
  }

  function selectedScenario() {
    return state.scenarios.find(item => item.id === state.scenarioId) || state.scenarios[0];
  }

  function selectedContract() {
    const scenario = selectedScenario();
    return businessContracts[scenario?.id] || {
      actor: 'Authorized business user', outcome: scenario?.description || 'Execute a governed BCS ONE workflow.',
      decision: scenario?.businessQuestion || 'Use governed evidence to support a business decision.',
      productValue: scenario?.valueStatement || 'Federate product capabilities without coupling the AI directly to product APIs.',
      analystFocus: 'Inputs, authorization, canonical capabilities, source ownership, exceptions and acceptance criteria.',
      exceptions: ['Authorization denied', 'Source unavailable', 'Evidence incomplete', 'AI synthesis unavailable']
    };
  }

  async function refreshBlueprint(force = false) {
    if (state.loading) return;
    if (!force && state.scenarios.length && state.tools.length) { renderAll(); return; }
    state.loading = true;
    const status = $('#blueprint-live-status');
    if (status) { status.textContent = 'LOADING'; status.className = 'status info'; }
    try {
      const [scenarioPayload, toolPayload, runPayload, workforcePayload, evalPayload] = await Promise.all([
        api('/v1/scenarios'),
        api('/v1/mcp/tools'),
        api('/v1/runs?limit=200'),
        optionalApi('/v1/workforce/overview'),
        optionalApi('/v1/evaluations')
      ]);
      state.scenarios = scenarioPayload.scenarios || [];
      state.tools = toolPayload.tools || [];
      state.runs = runPayload.runs || [];
      state.workforce = workforcePayload;
      state.evals = evalPayload?.runs || [];
      if (!state.scenarioId || !state.scenarios.some(item => item.id === state.scenarioId)) {
        state.scenarioId = state.scenarios.find(item => item.id === 'employee-360')?.id || state.scenarios[0]?.id || '';
      }
      populateScenarioSelect();
      await loadLatestRun();
      renderAll();
      if (status) { status.textContent = 'LIVE DATA'; status.className = 'status success'; }
    } catch (error) {
      if (status) { status.textContent = 'SIGN IN REQUIRED'; status.className = 'status warning'; }
      renderSignedOut(error.message);
    } finally {
      state.loading = false;
    }
  }

  function populateScenarioSelect() {
    const select = $('#bp-scenario-select');
    if (!select) return;
    select.innerHTML = state.scenarios.map(item => `<option value="${esc(item.id)}">${esc(item.title)} · ${item.mcpCallCount} MCP</option>`).join('');
    select.value = state.scenarioId;
  }

  async function loadLatestRun() {
    state.runDetails = null;
    const latest = state.runs.find(run => run.scenarioId === state.scenarioId);
    const ref = $('#bp-run-reference');
    if (!latest) {
      if (ref) ref.textContent = 'No matching persisted run yet';
      return;
    }
    if (ref) ref.textContent = `${latest.status?.toUpperCase() || 'RUN'} · ${fmtTime(latest.startedAt)}`;
    const payload = await optionalApi(`/v1/runs/${encodeURIComponent(latest.runId)}`);
    state.runDetails = payload;
  }

  function renderSignedOut(message) {
    ['#bp-lens-body','#bp-requirement','#bp-data-flow','#bp-rules','#bp-acceptance','#bp-runtime-journey','#bp-exceptions','#bp-ownership','#bp-contracts'].forEach(selector => {
      const node = $(selector); if (node) node.innerHTML = `<div class="bp-empty"><strong>Sign in to load live blueprint data.</strong><span>${esc(message)}</span><span>The page intentionally does not expose tenant run metadata without the existing Entra/Gateway security context.</span></div>`;
    });
  }

  function runtimeStats() {
    const details = state.runDetails;
    const events = details?.events || [];
    const artifacts = details?.artifacts || [];
    const completedCalls = events.filter(event => event.event === 'tools/call.completed');
    const denied = events.some(event => event.status === 'denied');
    const synthesis = events.find(event => event.event === 'model.synthesis.completed');
    const synthesisSkipped = events.find(event => event.event === 'model.synthesis.skipped');
    const timestamps = events.map(event => Date.parse(event.timestamp)).filter(Number.isFinite);
    const durationMs = timestamps.length > 1 ? Math.max(...timestamps) - Math.min(...timestamps) : undefined;
    return {
      events, artifacts, completedCalls, denied, synthesis, synthesisSkipped, durationMs,
      products: unique(completedCalls.map(event => event.product)),
      runStatus: details?.run?.status || 'waiting'
    };
  }

  function renderAll() {
    if (!state.scenarios.length) return;
    renderMetrics();
    renderLens();
    renderRequirement();
    renderDataFlow();
    renderRules();
    renderAcceptance();
    renderRuntimeJourney();
    renderExceptions();
    renderOwnership();
    renderContracts();
  }

  function renderMetrics() {
    const products = unique(state.scenarios.flatMap(s => (s.tools || []).map(tool => tool.product)));
    const liveTools = state.tools.filter(tool => tool?._meta?.['bcsone/status'] === 'live' || tool?.metadata?.status === 'live' || tool?.status === 'live');
    const latestEval = state.evals[0];
    const workforce = state.workforce?.totalEmployees;
    $('#bp-workforce').textContent = workforce ? Number(workforce).toLocaleString() : 'Restricted';
    $('#bp-scenarios').textContent = state.scenarios.length;
    $('#bp-products').textContent = products.length;
    $('#bp-tools').textContent = liveTools.length ? `${liveTools.length} live / ${state.tools.length}` : state.tools.length;
    $('#bp-eval').textContent = latestEval?.status ? String(latestEval.status).toUpperCase() : 'Not available';
  }

  function renderLens() {
    const scenario = selectedScenario();
    const contract = selectedContract();
    const stats = runtimeStats();
    if (!scenario) return;
    const title = $('#bp-lens-title');
    const root = $('#bp-lens-body');
    if (!root) return;
    if (state.lens === 'product') {
      if (title) title.textContent = 'Product Owner view';
      root.innerHTML = `<div class="bp-lens-stack">
        <div class="bp-callout"><span>Outcome to own</span><strong>${esc(contract.outcome)}</strong></div>
        <div class="bp-callout"><span>Why it belongs in the product</span><strong>${esc(contract.productValue)}</strong></div>
        <div class="bp-kpi-grid"><div><span>Products coordinated</span><strong>${unique(scenario.tools.map(tool => tool.product)).length}</strong></div><div><span>Canonical calls</span><strong>${scenario.mcpCallCount}</strong></div><div><span>Latest runtime</span><strong>${esc(stats.runStatus.toUpperCase())}</strong></div><div><span>Observed latency</span><strong>${fmtMs(stats.durationMs)}</strong></div></div>
        <div class="bp-note"><b>Product decision:</b> prioritize the business outcome and stable capability contract. Product-specific API changes should be absorbed by adapters rather than forcing the experience or AI workflow to be redesigned.</div>
      </div>`;
    } else {
      if (title) title.textContent = 'Business Analyst view';
      root.innerHTML = `<div class="bp-lens-stack">
        <div class="bp-callout"><span>Analysis focus</span><strong>${esc(contract.analystFocus)}</strong></div>
        <div class="bp-callout"><span>Primary decision</span><strong>${esc(contract.decision)}</strong></div>
        <div class="bp-kpi-grid"><div><span>Data contracts</span><strong>${scenario.tools.length}</strong></div><div><span>Policy gates</span><strong>${scenario.tools.length + 1}</strong></div><div><span>Persisted artifacts</span><strong>${stats.artifacts.length || '—'}</strong></div><div><span>Trace events</span><strong>${stats.events.length || '—'}</strong></div></div>
        <div class="bp-note"><b>Analysis rule:</b> define each required fact, its owning system, authorization purpose, canonical capability, expected output shape, exception behavior and acceptance evidence independently of the LLM wording.</div>
      </div>`;
    }
  }

  function renderRequirement() {
    const scenario = selectedScenario();
    const contract = selectedContract();
    if (!scenario) return;
    $('#bp-requirement').innerHTML = `<div class="bp-requirement-stack">
      <div><span>Actor</span><strong>${esc(contract.actor)}</strong></div>
      <div><span>User story</span><strong>As a ${esc(contract.actor.toLowerCase())}, I want BCS ONE to ${esc(scenario.businessQuestion.charAt(0).toLowerCase() + scenario.businessQuestion.slice(1))} so that I can ${esc(contract.decision.charAt(0).toLowerCase() + contract.decision.slice(1))}</strong></div>
      <div><span>Business question</span><strong>${esc(scenario.businessQuestion)}</strong></div>
      <div><span>Success outcome</span><strong>${esc(contract.outcome)}</strong></div>
      <div><span>Scope</span><strong>Read, reconcile, explain and preserve evidence. Source-system writes are intentionally outside these current scenarios.</strong></div>
    </div>`;
  }

  function sensitivity(tool) {
    const cap = tool.capability || '';
    if (cap.startsWith('payroll.') || cap.startsWith('absence.') || cap.includes('contract')) return 'Restricted';
    return 'Confidential';
  }

  function runtimeForTool(tool, index) {
    const stats = runtimeStats();
    const matching = stats.events.filter(event => event.tool === tool.capability || event.product === tool.product);
    const complete = matching.find(event => event.event === 'tools/call.completed');
    const source = matching.find(event => event.sourceSystem)?.sourceSystem;
    const shape = matching.find(event => Array.isArray(event.outputShape) && event.outputShape.length)?.outputShape || [];
    const denied = matching.find(event => event.status === 'denied');
    return {
      status: denied ? 'DENIED' : complete ? 'COMPLETE' : state.runDetails ? 'WAITING' : 'PLANNED',
      durationMs: complete?.durationMs,
      source,
      shape,
      callId: complete?.callId || matching.find(event => event.callId)?.callId,
      index
    };
  }

  function renderDataFlow() {
    const scenario = selectedScenario();
    if (!scenario) return;
    $('#bp-flow-count').textContent = `${scenario.tools.length} capability flows`;
    $('#bp-data-flow').innerHTML = `<div class="bp-flow-header"><span>#</span><span>Business fact needed</span><span>Canonical MCP capability</span><span>Source product / owner</span><span>Governance</span><span>Latest live proof</span></div>
      <div class="bp-flow-table">${scenario.tools.map((tool, index) => {
        const runtime = runtimeForTool(tool, index + 1);
        const statusClass = runtime.status === 'COMPLETE' ? 'success' : runtime.status === 'DENIED' ? 'danger' : 'neutral';
        return `<div class="bp-flow-row">
          <span class="bp-step">${index + 1}</span>
          <div><strong>${esc(tool.title)}</strong><small>${esc(tool.domain)} · ${esc(tool.agent)}</small></div>
          <div><strong class="mono">${esc(tool.capability)}</strong><small>Stable AI-facing contract</small></div>
          <div><strong>${esc(tool.product)}</strong><small>${esc(runtime.source || 'System of record via reference adapter')}</small></div>
          <div><strong>${sensitivity(tool)}</strong><small>OPA before call · tenant trusted out-of-band</small></div>
          <div><span class="status ${statusClass}">${runtime.status}</span><small>${runtime.durationMs ? fmtMs(runtime.durationMs) : 'Run scenario to observe'}${runtime.shape.length ? ` · ${runtime.shape.slice(0,4).map(esc).join(', ')}` : ''}</small></div>
        </div>`;
      }).join('')}</div>
      <div class="bp-flow-footer"><b>After the branches:</b><span>Structured results are persisted as governed artifacts → evidence references are merged → Azure OpenAI may synthesize only those facts → the final business response remains traceable to each product.</span></div>`;
  }

  function renderRules() {
    const scenario = selectedScenario();
    if (!scenario) return;
    const rules = [
      ['Identity before data', 'The Entra-authenticated user, tenant, roles and purpose must exist before any scenario capability executes.'],
      ['Policy before every capability', `The scenario has ${scenario.tools.length} product capability calls and each is independently subject to deterministic OPA authorization.`],
      ['Source remains authoritative', 'BCS ONE can normalize, correlate and explain facts but cannot make the LLM the system of record.'],
      ['Canonical contract over vendor coupling', 'Agents call MCP capabilities. Product-specific API details remain behind adapters.'],
      ['No silent conflict resolution', 'If products disagree or evidence is missing, the response must preserve the conflict or state insufficient evidence.'],
      ['AI is downstream', 'Azure OpenAI may summarize or explain governed artifacts; it does not authorize access, calculate statutory payroll, diagnose absence causes or approve actions.'],
      ['Tenant isolation is mandatory', 'Persisted runs, events and artifacts are tenant-scoped and PostgreSQL RLS is part of the release gate.'],
      ['Writes require another control pattern', 'High-risk source changes require propose → approve → re-authorize → idempotent execute → reconcile. These current scenarios are read-oriented.']
    ];
    $('#bp-rules').innerHTML = `<div class="bp-rule-list">${rules.map(([title, body], index) => `<div><span>${String(index + 1).padStart(2,'0')}</span><div><strong>${esc(title)}</strong><p>${esc(body)}</p></div></div>`).join('')}</div>`;
  }

  function criterion(label, pass, pendingText) {
    const hasRun = Boolean(state.runDetails);
    const value = !hasRun ? 'WAITING' : pass ? 'PASS' : 'FAIL';
    const cls = !hasRun ? 'neutral' : pass ? 'success' : 'danger';
    return `<div class="bp-criterion"><span class="status ${cls}">${value}</span><div><strong>${esc(label)}</strong><small>${esc(!hasRun ? pendingText : pass ? 'Observed in latest persisted run.' : 'Latest persisted run does not satisfy this criterion.')}</small></div></div>`;
  }

  function renderAcceptance() {
    const scenario = selectedScenario();
    const stats = runtimeStats();
    if (!scenario) return;
    const policyEvents = stats.events.filter(event => event.stage === 'policy');
    const sourceEvents = stats.events.filter(event => event.stage === 'source' && ['completed','available'].includes(event.status));
    const hasSynthesisResult = Boolean(stats.synthesis || stats.synthesisSkipped);
    const completed = stats.runStatus === 'completed';
    $('#bp-acceptance').innerHTML = `<div class="bp-criteria-list">
      ${criterion(`Exactly ${scenario.mcpCallCount} canonical MCP calls complete`, stats.completedCalls.length === scenario.mcpCallCount, 'Execute this scenario to verify actual MCP call count.')}
      ${criterion('No policy decision denies the authorized path', !stats.denied && policyEvents.length > 0, 'Policy decisions will be evaluated at runtime.')}
      ${criterion(`At least ${scenario.mcpCallCount} source evidence artifacts are persisted`, stats.artifacts.length >= scenario.mcpCallCount, 'Artifact metadata is read from durable PostgreSQL state.')}
      ${criterion('Structured source evidence remains attributable', sourceEvents.length >= scenario.mcpCallCount || stats.completedCalls.every(call => call.product), 'Source/product attribution will be inspected from execution events.')}
      ${criterion('AI stage is explicitly completed or skipped', hasSynthesisResult, 'The run must make AI usage explicit rather than hidden.')}
      ${criterion('Scenario finishes as a durable completed run', completed, 'Run state will be checked after execution.')}
    </div>`;
  }

  function stageStatus(predicate) {
    if (!state.runDetails) return 'PLANNED';
    const events = runtimeStats().events;
    const matched = events.filter(predicate);
    if (matched.some(event => ['failed','denied','error'].includes(event.status))) return 'FAILED';
    if (matched.some(event => ['completed','allowed','skipped'].includes(event.status))) return 'COMPLETE';
    if (matched.some(event => event.status === 'started')) return 'RUNNING';
    return 'WAITING';
  }

  function renderRuntimeJourney() {
    const stats = runtimeStats();
    const stages = [
      ['1', 'Identity', 'Who is asking?', 'Entra validates the user token and roles.', stageStatus(event => event.stage === 'identity')],
      ['2', 'Gateway', 'Create trusted context', 'Tenant, user, roles, purpose and correlation ID are passed out-of-band.', stageStatus(event => event.stage === 'gateway')],
      ['3', 'Policy', 'May this data be used?', 'OPA makes deterministic authorization decisions before scenario/tool access.', stageStatus(event => event.stage === 'policy')],
      ['4', 'Orchestration', 'What capabilities are required?', 'LangGraph coordinates supervisor and domain-agent execution.', stageStatus(event => event.stage === 'orchestrator' || event.agent === 'supervisor')],
      ['5', 'MCP federation', 'Call stable business capabilities', `${selectedScenario()?.mcpCallCount || 0} canonical tools/call branches are planned.`, stageStatus(event => event.stage === 'mcp')],
      ['6', 'Product adapters', 'Translate to product-specific integration', 'Adapters isolate BCS ONE from vendor/API implementation differences.', stageStatus(event => event.stage === 'adapter')],
      ['7', 'Evidence', 'Preserve structured source facts', 'Source outputs are validated, attributed and persisted as governed artifacts.', stageStatus(event => event.stage === 'source')],
      ['8', 'Grounded AI', 'Explain across products', 'Azure OpenAI receives governed evidence only and may synthesize a business briefing.', stageStatus(event => event.stage === 'ai')],
      ['9', 'Business response', 'Return an accountable outcome', 'Answer + provenance + run/event/artifact evidence remain available for inspection.', stats.runStatus === 'completed' ? 'COMPLETE' : state.runDetails ? 'WAITING' : 'PLANNED']
    ];
    const complete = stages.filter(item => item[4] === 'COMPLETE').length;
    $('#bp-runtime-progress').textContent = `${complete} / ${stages.length}`;
    $('#bp-runtime-journey').innerHTML = stages.map(([n,title,question,description,status]) => `<div class="bp-runtime-stage ${status.toLowerCase()}"><span class="bp-runtime-number">${n}</span><div><div class="bp-runtime-title"><strong>${esc(title)}</strong><span class="status ${status === 'COMPLETE' ? 'success' : status === 'FAILED' ? 'danger' : status === 'RUNNING' ? 'info' : 'neutral'}">${status}</span></div><b>${esc(question)}</b><p>${esc(description)}</p></div></div>`).join('');
    if (state.runDetails) {
      $('#bp-runtime-journey').insertAdjacentHTML('beforeend', `<div class="bp-runtime-summary"><strong>Latest runtime evidence</strong><span>${stats.completedCalls.length} MCP calls · ${stats.products.length} products · ${stats.artifacts.length} artifacts · ${stats.events.length} events · ${fmtMs(stats.durationMs)}</span></div>`);
    }
  }

  function renderExceptions() {
    const contract = selectedContract();
    const generic = ['Authentication or tenant context is missing', 'A source system or adapter is temporarily unavailable', 'A required fact is missing or conflicts with another product', 'The AI dependency is unavailable after source evidence has been collected'];
    const items = unique([...(contract.exceptions || []), ...generic]);
    $('#bp-exceptions').innerHTML = `<div class="bp-exception-list">${items.map((item,index) => `<div><span>${index + 1}</span><strong>${esc(item)}</strong></div>`).join('')}</div><div class="bp-note"><b>BA expectation:</b> each exception must have an explicit business outcome (deny, partial result, insufficient evidence, retry, human review or future approval flow). No exception should be silently converted into a confident AI answer.</div>`;
  }

  function renderOwnership() {
    const scenario = selectedScenario();
    if (!scenario) return;
    const products = unique(scenario.tools.map(tool => tool.product));
    $('#bp-ownership').innerHTML = `<div class="bp-owner-table">
      <div><span>Product Owner</span><strong>Outcome, priority, adoption, KPI and roadmap for ${esc(scenario.title)}</strong></div>
      <div><span>Business Analyst</span><strong>Actors, rules, mappings, exceptions, acceptance criteria and data semantics</strong></div>
      <div><span>BCS ONE platform</span><strong>Canonical MCP contracts, orchestration, evidence, observability and adapter boundaries</strong></div>
      <div><span>Security / Governance</span><strong>Entra trust, OPA policy, purpose limitation, tenant isolation and audit requirements</strong></div>
      <div><span>Source product teams</span><strong>${products.map(esc).join(' · ')} remain owners of authoritative business data and product APIs</strong></div>
      <div><span>Azure OpenAI</span><strong>Grounded synthesis only; no authorization, source ownership or approval authority</strong></div>
    </div>
    <div class="bp-change-impact"><strong>Acquisition/change impact</strong><p>If one of the ${products.length} underlying products changes API or is replaced, the preferred change boundary is its adapter. The scenario's business question and canonical MCP capability can remain stable unless the business semantics themselves change.</p></div>`;
  }

  function renderContracts() {
    const scenario = selectedScenario();
    if (!scenario) return;
    const candidateNeeded = scenario.tools.some(tool => tool.capability.startsWith('recruitment.'));
    $('#bp-contracts').innerHTML = `<div class="bp-input-contract"><strong>Scenario inputs</strong><span><b>employeeId</b> required · tenant-scoped subject</span><span><b>period</b> YYYY-MM calendar period</span>${candidateNeeded ? '<span><b>candidateId</b> required for recruitment correlation</span>' : ''}<span><b>explain</b> controls grounded Azure OpenAI synthesis</span><span><b>threadId</b> optional durable conversation/run grouping</span></div>
      <div class="bp-contract-grid">${scenario.tools.map((tool,index) => {
        const runtime = runtimeForTool(tool,index + 1);
        return `<div class="bp-contract-item"><div><span>${index + 1}</span><strong class="mono">${esc(tool.capability)}</strong></div><p><b>Business object:</b> ${esc(tool.title)}<br/><b>Product:</b> ${esc(tool.product)}<br/><b>Classification:</b> ${sensitivity(tool)}</p><div class="bp-shape"><span>Observed output shape</span><strong>${runtime.shape.length ? runtime.shape.map(esc).join(' · ') : 'Run scenario to inspect live structuredContent shape'}</strong></div>${runtime.callId ? `<small class="mono">call: ${esc(runtime.callId)}</small>` : ''}</div>`;
      }).join('')}</div>`;
  }

  function init() {
    injectPage();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

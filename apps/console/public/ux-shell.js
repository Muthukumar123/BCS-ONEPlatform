(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => number(value).toLocaleString();
  const pct = value => `${(number(value) * 100).toFixed(1)}%`;
  const fmtTime = value => value ? new Date(value).toLocaleString() : '—';

  const state = {
    activeView: '',
    lastRunStatus: '',
    modalReturnFocus: null,
    homeLoading: false,
    ctoTab: 'overview',
    businessTab: 'outcome',
    normalizedNav: false
  };

  const viewMeta = {
    home: { title: 'Platform Overview', group: 'Overview', description: 'Start here for the business story, live platform status and the right path for each audience.', icon: 'HM' },
    'cto-dashboard': { title: 'CTO Dashboard', group: 'Overview', description: 'Platform scale, agent activity, MCP performance, token consumption and AI economics.', icon: 'CT' },
    scenarios: { title: 'Scenario Lab', group: 'Workflows', description: 'Execute governed employee and cross-product workflows and inspect the business answer.', icon: 'SC' },
    'business-blueprint': { title: 'Product Owner + BA', group: 'Workflows', description: 'Translate executable scenarios into business requirements, data flows and acceptance evidence.', icon: 'BA' },
    runs: { title: 'Agent Runs', group: 'Operations', description: 'Inspect durable workflow history, persisted events and governed artifacts.', icon: 'AR' },
    observability: { title: 'Observability', group: 'Operations', description: 'Inspect runtime latency, correlated evidence and operational health.', icon: 'OB' },
    evaluations: { title: 'Evaluations', group: 'Operations', description: 'Review enterprise release gates for policy, MCP, schema, grounding and tenant isolation.', icon: 'EV' },
    mcp: { title: 'Capability Hub', group: 'Platform', description: 'Explore canonical MCP capabilities independent of product-specific APIs.', icon: 'MC' },
    products: { title: 'Product Landscape', group: 'Platform', description: 'Understand the BCS product federation behind the canonical capability layer.', icon: 'PL' }
  };

  const helpContent = {
    home: {
      intro: 'This is the executive starting point. It combines the platform story with live tenant-scoped runtime evidence so a viewer can understand BCS ONE before opening technical detail.',
      bullets: ['Choose an audience path instead of hunting through menus.', 'Confirm the synthetic data boundary and latest release posture.', 'See recent durable runs and the nine-layer execution model.'],
      source: 'Live values are loaded from authenticated BCS ONE APIs. Business workforce records remain synthetic reference data.'
    },
    'cto-dashboard': {
      intro: 'Use this page to answer whether the platform is reliable, governed and economically measurable at scale.',
      bullets: ['Overview shows run volume, success, federation intensity and control posture.', 'Agent and MCP tabs expose operational ownership and capability performance.', 'AI Economics shows measured token usage and estimated token cost; it does not fabricate Azure invoice spend.'],
      source: 'Runs, MCP activity, tokens and latency come from persisted tenant-scoped execution events.'
    },
    scenarios: {
      intro: 'Scenario Lab executes a real governed workflow against deterministic synthetic reference systems and explains both the final business response and the technical proof.',
      bullets: ['Choose a scenario and employee.', 'Run the governed analysis and read the business response first.', 'Open full technical proof only when you need MCP, graph, artifact or trace evidence.'],
      source: 'Identity, OPA, LangGraph, MCP, adapters, PostgreSQL and Azure OpenAI are live. Employer and employee business records are synthetic.'
    },
    'business-blueprint': {
      intro: 'This page converts the same executable runtime into Product Owner and Business Analyst language.',
      bullets: ['Outcome explains user value and decision support.', 'Data Flow maps business facts to capabilities and source owners.', 'Runtime and Contracts turn execution evidence into acceptance proof.'],
      source: 'Requirements are scenario definitions; runtime status is derived from the latest persisted matching run.'
    },
    runs: {
      intro: 'Agent Runs is the durable operational ledger for workflow executions.',
      bullets: ['Select a historical run after refresh or container restart.', 'Inspect events and artifacts without rerunning the workflow.', 'Use run IDs to correlate business outcomes with technical evidence.'],
      source: 'Stored in tenant-isolated PostgreSQL state with LangGraph checkpoints.'
    },
    observability: {
      intro: 'Observability focuses on execution evidence and stage latency for the latest workflow.',
      bullets: ['Inspect end-to-end duration and MCP fan-out.', 'Confirm policy and artifact evidence.', 'Correlate request, run, call and artifact identifiers.'],
      source: 'Derived from live and persisted execution events.'
    },
    evaluations: {
      intro: 'Evaluations are the release-quality gate for the enterprise pilot.',
      bullets: ['Check the latest suite status.', 'Treat hard-gate failures as release blockers.', 'Use the suite to prove policy, tenant isolation, MCP and grounding behavior.'],
      source: 'Evaluation runs are persisted independently of interactive scenario execution.'
    },
    mcp: {
      intro: 'Capability Hub is the AI-facing contract surface for the BCS product portfolio.',
      bullets: ['Discover canonical capabilities.', 'See which capabilities are executable in the live reference environment.', 'Keep agent orchestration independent of vendor-specific product APIs.'],
      source: 'Loaded from the live MCP tools catalog.'
    },
    products: {
      intro: 'Product Landscape explains which specialist BCS products sit behind the canonical capability layer.',
      bullets: ['Understand product ownership by domain.', 'See why adapters isolate acquisition-specific APIs.', 'Use this page to explain how BCS ONE federates rather than replaces systems of record.'],
      source: 'Product mapping is pilot architecture metadata; product business records are synthetic references.'
    }
  };

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token');
    const expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    return token && (!expires || expires > Date.now() + 15000) ? token : '';
  }

  async function api(path) {
    const token = getToken();
    if (!token) throw new Error('Sign in securely to load live tenant-scoped data.');
    const response = await fetch(`${config.gatewayUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || `HTTP ${response.status}`);
    return body;
  }

  async function optionalApi(path) {
    try { return await api(path); } catch { return null; }
  }

  function injectChrome() {
    if (!$('#ux-toast-region')) document.body.insertAdjacentHTML('beforeend', '<div id="ux-toast-region" class="ux-toast-region" role="region" aria-label="Notifications" aria-live="polite"></div>');
    if (!$('#ux-modal-backdrop')) document.body.insertAdjacentHTML('beforeend', `
      <div id="ux-modal-backdrop" class="ux-modal-backdrop" aria-hidden="true">
        <section class="ux-modal" role="dialog" aria-modal="true" aria-labelledby="ux-modal-title">
          <header class="ux-modal-header"><div><span id="ux-modal-kicker" class="ux-modal-kicker">DETAILS</span><h2 id="ux-modal-title" class="ux-modal-title">Details</h2></div><button id="ux-modal-close" class="ux-modal-close" type="button" aria-label="Close dialog">×</button></header>
          <div id="ux-modal-body" class="ux-modal-body"></div>
          <footer class="ux-modal-footer"><button id="ux-modal-done" class="button primary" type="button">Done</button></footer>
        </section>
      </div>`);

    const sidebar = $('.sidebar');
    if (sidebar && !$('#ux-sidebar-collapse')) sidebar.insertAdjacentHTML('beforeend', '<button id="ux-sidebar-collapse" class="ux-sidebar-collapse" type="button" aria-label="Collapse navigation" title="Collapse navigation">‹</button>');
    if (!$('#ux-nav-scrim')) document.body.insertAdjacentHTML('beforeend', '<div id="ux-nav-scrim" class="ux-nav-scrim" aria-hidden="true"></div>');

    const topbar = $('.topbar');
    const titleBlock = topbar?.firstElementChild;
    if (titleBlock && !$('#ux-breadcrumb')) {
      titleBlock.classList.add('ux-topbar-copy');
      const textWrap = document.createElement('div');
      while (titleBlock.firstChild) textWrap.appendChild(titleBlock.firstChild);
      titleBlock.appendChild(textWrap);
      textWrap.insertAdjacentHTML('beforeend', '<div id="ux-breadcrumb" class="ux-breadcrumb">Overview / Platform Overview</div>');
      titleBlock.insertAdjacentHTML('afterbegin', '<button id="ux-mobile-menu" class="button secondary ux-mobile-menu" type="button" aria-label="Open navigation">☰</button>');
    }
    const actions = $('.topbar-actions');
    if (actions && !$('#ux-help-button')) actions.insertAdjacentHTML('afterbegin', '<div class="ux-topbar-tools"><button id="ux-help-button" class="button secondary ux-icon-button ux-help-button" type="button">Help</button><button id="ux-share-button" class="button secondary ux-icon-button ux-share-button" type="button">Share view</button></div>');

    $('#ux-sidebar-collapse')?.addEventListener('click', () => {
      document.body.classList.toggle('ux-sidebar-collapsed');
      const collapsed = document.body.classList.contains('ux-sidebar-collapsed');
      try { localStorage.setItem('bcs_sidebar_collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ }
    });
    try { if (localStorage.getItem('bcs_sidebar_collapsed') === '1') document.body.classList.add('ux-sidebar-collapsed'); } catch { /* ignore */ }

    $('#ux-mobile-menu')?.addEventListener('click', () => document.body.classList.add('ux-mobile-nav-open'));
    $('#ux-nav-scrim')?.addEventListener('click', closeMobileNav);
    $('#ux-help-button')?.addEventListener('click', () => openHelp());
    $('#ux-share-button')?.addEventListener('click', () => void shareCurrentView());
    $('#ux-modal-close')?.addEventListener('click', closeModal);
    $('#ux-modal-done')?.addEventListener('click', closeModal);
    $('#ux-modal-backdrop')?.addEventListener('click', event => { if (event.target.id === 'ux-modal-backdrop') closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#ux-modal-backdrop')?.classList.contains('open')) closeModal(); });
  }

  function closeMobileNav() { document.body.classList.remove('ux-mobile-nav-open'); }

  function toast(message, options = {}) {
    const root = $('#ux-toast-region');
    if (!root) return;
    const type = options.type || 'info';
    const icon = type === 'success' ? '✓' : type === 'error' ? '!' : type === 'warning' ? '!' : 'i';
    const node = document.createElement('div');
    node.className = `ux-toast ${type}`;
    node.innerHTML = `<div class="ux-toast-icon">${icon}</div><div><strong>${esc(options.title || (type === 'success' ? 'Completed' : type === 'error' ? 'Action required' : type === 'warning' ? 'Attention' : 'BCS ONE'))}</strong><p>${esc(message)}</p></div><button class="ux-toast-close" type="button" aria-label="Dismiss notification">×</button>`;
    root.appendChild(node);
    const remove = () => { if (!node.isConnected) return; node.classList.add('ux-toast-out'); setTimeout(() => node.remove(), 190); };
    node.querySelector('.ux-toast-close')?.addEventListener('click', remove);
    setTimeout(remove, Number(options.duration || (type === 'error' ? 6500 : 4200)));
  }

  function openModal({ title, kicker = 'DETAILS', html = '', footerLabel = 'Done' }) {
    const backdrop = $('#ux-modal-backdrop');
    if (!backdrop) return;
    state.modalReturnFocus = document.activeElement;
    $('#ux-modal-title').textContent = title;
    $('#ux-modal-kicker').textContent = kicker;
    $('#ux-modal-body').innerHTML = html;
    $('#ux-modal-done').textContent = footerLabel;
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ux-modal-open');
    setTimeout(() => $('#ux-modal-close')?.focus(), 20);
  }

  function closeModal() {
    const backdrop = $('#ux-modal-backdrop');
    if (!backdrop) return;
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ux-modal-open');
    if (state.modalReturnFocus instanceof HTMLElement) state.modalReturnFocus.focus();
  }

  function openHelp() {
    const meta = viewMeta[state.activeView] || viewMeta.home;
    const help = helpContent[state.activeView] || helpContent.home;
    openModal({
      title: meta.title,
      kicker: 'HOW TO USE THIS PAGE',
      html: `<p>${esc(help.intro)}</p><h3>What to do here</h3><ul>${help.bullets.map(item => `<li>${esc(item)}</li>`).join('')}</ul><h3>Evidence boundary</h3><p>${esc(help.source)}</p>`
    });
  }

  async function shareCurrentView() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set('view', state.activeView || 'home');
    if (state.activeView === 'cto-dashboard') url.searchParams.set('section', state.ctoTab);
    if (state.activeView === 'business-blueprint') url.searchParams.set('section', state.businessTab);
    try {
      await navigator.clipboard.writeText(url.toString());
      toast('A direct link to the current view was copied to your clipboard.', { type: 'success', title: 'View link copied' });
    } catch {
      openModal({ title: 'Share this view', kicker: 'DIRECT LINK', html: `<p>Copy this link:</p><p class="mono">${esc(url.toString())}</p>` });
    }
  }

  function injectHome() {
    if ($('#view-home')) return;
    const scenarios = $('#view-scenarios');
    if (!scenarios) return;
    scenarios.insertAdjacentHTML('beforebegin', `
      <section id="view-home" class="page view ux-home-view">
        <div class="hero-row ux-home-hero">
          <div class="ux-home-hero-copy"><div class="eyebrow">BCS ONE · ENTERPRISE AI + MCP</div><h1>One governed AI layer across fragmented HR, payroll and workforce products.</h1><p>Start with the business outcome, then go as deep as you need—from executive economics to Product Owner requirements, live employee scenarios, MCP federation and durable runtime proof.</p></div>
          <aside class="ux-home-callout"><span>WHAT THIS PILOT PROVES</span><strong>AI can coordinate BCS product capabilities without replacing their systems of record.</strong><p>Identity and policy execute before data access. Canonical MCP capabilities route to product adapters. Structured evidence is persisted. Azure OpenAI synthesizes only governed evidence.</p><div class="ux-home-actions"><button class="button primary" type="button" data-ux-go="scenarios">Run a scenario</button><button class="button secondary" type="button" data-ux-go="cto-dashboard">Open CTO view</button></div></aside>
        </div>
        <div id="ux-home-status" class="ux-home-boundary">Sign in securely to replace the placeholders below with live tenant-scoped runtime evidence. Employer and employee business records remain explicitly synthetic.</div>
        <div id="ux-live-strip" class="ux-live-strip">
          <div class="ux-live-card info"><span>Synthetic workforce</span><strong id="ux-home-workforce">—</strong><small>reference employees across virtual employers</small></div>
          <div class="ux-live-card"><span>Executable scenarios</span><strong id="ux-home-scenarios">—</strong><small>governed business workflows</small></div>
          <div class="ux-live-card"><span>Live MCP capabilities</span><strong id="ux-home-tools">—</strong><small>discoverable AI-facing contracts</small></div>
          <div class="ux-live-card positive"><span>Latest release gate</span><strong id="ux-home-gate">—</strong><small>enterprise evaluation status</small></div>
        </div>
        <div class="ux-section-heading"><div><h2>Choose the right view for your role</h2><p>The same platform is explained differently for executives, product teams and engineers.</p></div></div>
        <div class="ux-audience-grid">
          <button class="ux-audience-card" type="button" data-ux-go="cto-dashboard"><span class="ux-audience-icon">CT</span><strong>CTO / Technology Leadership</strong><p>Scale, agents, MCP performance, tokens, cost, governance and release posture.</p><span class="ux-card-link">Open executive dashboard →</span></button>
          <button class="ux-audience-card" type="button" data-ux-go="business-blueprint"><span class="ux-audience-icon">BA</span><strong>Product Owner / Business Analyst</strong><p>Business outcome, user story, rules, data flow, acceptance criteria and ownership.</p><span class="ux-card-link">Open business blueprint →</span></button>
          <button class="ux-audience-card" type="button" data-ux-go="scenarios"><span class="ux-audience-icon">HR</span><strong>HR / Business User</strong><p>Select an employee, execute a business scenario and read the grounded final response.</p><span class="ux-card-link">Open Scenario Lab →</span></button>
          <button class="ux-audience-card" type="button" data-ux-go="observability"><span class="ux-audience-icon">EN</span><strong>Architect / Engineer</strong><p>Durable runs, execution evidence, MCP calls, artifacts, latency and platform controls.</p><span class="ux-card-link">Open runtime evidence →</span></button>
        </div>
        <div class="ux-section-heading"><div><h2>Live operational snapshot</h2><p>Recent runs and control posture are loaded from the same tenant-scoped runtime used by the application.</p></div><button id="ux-home-refresh" class="button secondary" type="button">Refresh live snapshot</button></div>
        <div class="ux-home-grid">
          <article class="card"><div class="card-header"><div><div class="card-title">Recent durable runs</div><div class="card-subtitle">Latest workflow executions visible to the signed-in security context.</div></div><span id="ux-home-run-count" class="counter">—</span></div><div id="ux-home-runs" class="card-body"><div class="empty-state">Sign in to load recent runs.</div></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Platform readiness</div><div class="card-subtitle">Fast evidence for reliability, governance and state.</div></div></div><div id="ux-home-readiness" class="card-body"><div class="empty-state">Sign in to load readiness evidence.</div></div></article>
        </div>
        <div class="ux-section-heading"><div><h2>How one request moves through BCS ONE</h2><p>This is the common runtime path behind every business scenario.</p></div></div>
        <div class="ux-architecture-ribbon">
          ${[['01','Identity','Who is asking?'],['02','Gateway','Trusted context'],['03','OPA','Can they access it?'],['04','LangGraph','Plan the workflow'],['05','MCP','Invoke capability'],['06','Adapter','Route to product'],['07','Source','Return facts'],['08','Azure AI','Grounded synthesis'],['09','Result','Business answer']].map(([n,t,s]) => `<div class="ux-architecture-step"><b>${n}</b><strong>${t}</strong><span>${s}</span></div>`).join('')}
        </div>
        <div class="ux-home-boundary"><strong>Truth boundary:</strong> the pilot runs on live Azure infrastructure and live BCS ONE orchestration, governance, MCP, persistence and Azure OpenAI. The employer, employee and product business records used for demonstration are deterministic synthetic reference data, not production customer data.</div>
      </section>`);
    $('#ux-home-refresh')?.addEventListener('click', () => void loadHome(true));
    $$('[data-ux-go]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.uxGo)));
  }

  function normalizeNavigation() {
    const nav = $('.nav');
    if (!nav || state.normalizedNav || !$('#business-blueprint-nav') || !$('#cto-dashboard-nav')) return false;
    let home = $('#ux-home-nav');
    if (!home) {
      home = document.createElement('button');
      home.type = 'button'; home.id = 'ux-home-nav'; home.className = 'nav-item'; home.dataset.view = 'home'; home.textContent = 'Platform Overview'; home.addEventListener('click', () => activateHome());
    }
    const buttons = { home, 'cto-dashboard': $('#cto-dashboard-nav'), scenarios: $('.nav-item[data-view="scenarios"]'), 'business-blueprint': $('#business-blueprint-nav'), runs: $('.nav-item[data-view="runs"]'), observability: $('.nav-item[data-view="observability"]'), evaluations: $('.nav-item[data-view="evaluations"]'), mcp: $('.nav-item[data-view="mcp"]'), products: $('.nav-item[data-view="products"]') };
    Object.entries(buttons).forEach(([key, button]) => { if (button) { button.dataset.uiIcon = viewMeta[key]?.icon || '•'; button.title = viewMeta[key]?.description || ''; } });
    nav.querySelectorAll('.nav-group').forEach(group => group.remove());
    const groups = [
      ['OVERVIEW',['home','cto-dashboard']],
      ['WORKFLOWS',['scenarios','business-blueprint']],
      ['OPERATIONS',['runs','observability','evaluations']],
      ['PLATFORM',['mcp','products']]
    ];
    groups.forEach(([label, keys]) => {
      const group = document.createElement('div'); group.className = 'nav-group'; group.innerHTML = `<div class="nav-label">${label}</div>`;
      keys.forEach(key => { const button = buttons[key]; if (button) group.appendChild(button); });
      nav.appendChild(group);
    });
    nav.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => closeMobileNav()));
    state.normalizedNav = true;
    return true;
  }

  function activateHome() {
    $$('.view').forEach(view => view.classList.toggle('active-view', view.id === 'view-home'));
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === 'home'));
    $('#page-title').textContent = 'Platform Overview';
    setActiveView('home');
    void loadHome();
  }

  function navigate(name, options = {}) {
    if (!name) return;
    if (name === 'home') { activateHome(); return; }
    const button = $(`.nav-item[data-view="${CSS.escape(name)}"]`);
    if (button) button.click();
    else {
      $$('.view').forEach(view => view.classList.toggle('active-view', view.id === `view-${name}`));
      $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === name));
      $('#page-title').textContent = viewMeta[name]?.title || 'BCS ONE';
    }
    setTimeout(() => setActiveView(name, options.section), 20);
  }

  function setActiveView(name, section) {
    if (!name || !viewMeta[name]) return;
    state.activeView = name;
    const meta = viewMeta[name];
    const breadcrumb = $('#ux-breadcrumb'); if (breadcrumb) breadcrumb.textContent = `${meta.group} / ${meta.title}`;
    if ($('#page-title') && name === 'home') $('#page-title').textContent = meta.title;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('code')) {
      url.search = '';
      url.searchParams.set('view', name);
      if (section) url.searchParams.set('section', section);
      history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
    if (name === 'home') void loadHome();
  }

  async function loadHome(force = false) {
    if (state.homeLoading) return;
    if (!getToken()) {
      $('#ux-home-status').innerHTML = '<strong>Sign in to load live evidence.</strong> The page remains useful as an architecture guide, but no tenant-scoped runtime values are shown before authentication.';
      return;
    }
    if (!force && $('#ux-home-status')?.dataset.loaded === 'true') return;
    state.homeLoading = true;
    $('#ux-home-status').textContent = 'Loading live tenant-scoped platform evidence…';
    ['#ux-home-workforce','#ux-home-scenarios','#ux-home-tools','#ux-home-gate'].forEach(selector => $(selector)?.classList.add('ux-loading-shimmer'));
    const [workforce, scenarios, tools, runs, evaluations, cto] = await Promise.all([
      optionalApi('/v1/workforce/overview'), optionalApi('/v1/scenarios'), optionalApi('/v1/mcp/tools'), optionalApi('/v1/runs?limit=6'), optionalApi('/v1/evaluations'), optionalApi('/v1/dashboard/cto?days=7')
    ]);
    const scenarioList = Array.isArray(scenarios?.scenarios) ? scenarios.scenarios : [];
    const toolList = Array.isArray(tools?.tools) ? tools.tools : [];
    const runList = Array.isArray(runs?.runs) ? runs.runs : [];
    const evalList = Array.isArray(evaluations?.runs) ? evaluations.runs : [];
    const latestEval = evalList[0] || cto?.latestEvaluation;
    $('#ux-home-workforce').textContent = workforce?.totalEmployees ? fmt(workforce.totalEmployees) : 'Restricted';
    $('#ux-home-scenarios').textContent = fmt(scenarioList.length);
    $('#ux-home-tools').textContent = fmt(toolList.filter(tool => tool.executable !== false && tool.runtimeMode !== 'catalog-only').length || toolList.length);
    $('#ux-home-gate').textContent = latestEval?.status ? String(latestEval.status).toUpperCase() : 'No data';
    ['#ux-home-workforce','#ux-home-scenarios','#ux-home-tools','#ux-home-gate'].forEach(selector => $(selector)?.classList.remove('ux-loading-shimmer'));
    $('#ux-home-run-count').textContent = `${runList.length} recent`;
    $('#ux-home-runs').innerHTML = runList.length ? `<div class="ux-recent-list">${runList.map(run => `<div class="ux-recent-run"><div><strong>${esc(run.scenarioId || run.workflowType || 'Workflow')}</strong><small>${esc(run.runId)} · ${esc(fmtTime(run.startedAt))}</small></div><span class="status ${run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'warning'}">${esc(String(run.status || 'unknown').toUpperCase())}</span><small>${esc(run.currentNode || '—')}</small></div>`).join('')}</div>` : '<div class="empty-state">No durable runs are visible for this security context yet.</div>';
    const successRate = cto?.executive?.successRate;
    const stateBackend = cto?.azure?.stateBackend || scenarios?.runtime?.state || 'PostgreSQL + LangGraph';
    const hardGates = latestEval?.hardGateFailures;
    $('#ux-home-readiness').innerHTML = `<div class="ux-readiness"><div class="ux-readiness-item"><span>Release gate</span><strong>${esc(latestEval?.status ? String(latestEval.status).toUpperCase() : 'No data')}</strong><i class="ux-dot ${latestEval?.status === 'passed' ? 'good' : latestEval?.status === 'failed' ? 'bad' : 'warn'}"></i></div><div class="ux-readiness-item"><span>Hard gates</span><strong>${Number.isFinite(Number(hardGates)) ? fmt(hardGates) : '—'}</strong><i class="ux-dot ${Number(hardGates) === 0 ? 'good' : 'warn'}"></i></div><div class="ux-readiness-item"><span>Run success</span><strong>${Number.isFinite(Number(successRate)) ? pct(successRate) : '—'}</strong><i class="ux-dot ${Number(successRate) >= .95 ? 'good' : Number.isFinite(Number(successRate)) ? 'warn' : ''}"></i></div><div class="ux-readiness-item"><span>Durable state</span><strong>${esc(stateBackend)}</strong><i class="ux-dot good"></i></div><div class="ux-readiness-item"><span>Data mode</span><strong>${esc(config.dataMode || 'SYNTHETIC')}</strong><i class="ux-dot good"></i></div></div>`;
    $('#ux-home-status').dataset.loaded = 'true';
    $('#ux-home-status').innerHTML = `<strong>Live evidence loaded.</strong> ${fmt(runList.length)} recent runs, ${fmt(toolList.length)} discovered MCP tools and ${fmt(scenarioList.length)} executable scenarios are visible to this signed-in security context. Business workforce records remain synthetic.`;
    state.homeLoading = false;
  }

  function setupCtoTabs() {
    const view = $('#view-cto-dashboard');
    const hero = view?.querySelector('.hero-row');
    if (!view || !hero || $('#ux-cto-subnav')) return false;
    hero.insertAdjacentHTML('afterend', '<nav id="ux-cto-subnav" class="ux-subnav" aria-label="CTO dashboard sections"><button type="button" data-ux-cto-tab="overview" class="active">Overview</button><button type="button" data-ux-cto-tab="agents">Agents</button><button type="button" data-ux-cto-tab="mcp">MCP federation</button><button type="button" data-ux-cto-tab="economics">AI economics</button></nav>');
    const mark = (element, tab) => { if (element) element.dataset.uxCtoTab = tab; };
    mark($('#cto-kpis'),'overview'); mark($('#cto-insights'),'overview'); mark($('#cto-trend')?.closest('.cto-section-grid'),'overview');
    mark($('#cto-agents')?.closest('article'),'agents'); mark($('#cto-mcp')?.closest('article'),'mcp');
    mark($('#cto-ai-cost')?.closest('article'),'economics'); mark($('#cto-scenarios')?.closest('.cto-section-grid'),'economics');
    $$('[data-ux-cto-tab]').forEach(button => button.addEventListener('click', () => applyCtoTab(button.dataset.uxCtoTab)));
    const queryTab = new URLSearchParams(location.search).get('section');
    applyCtoTab(['overview','agents','mcp','economics'].includes(queryTab) ? queryTab : 'overview');
    return true;
  }

  function applyCtoTab(tab) {
    state.ctoTab = tab;
    $$('#view-cto-dashboard [data-ux-cto-tab]').forEach(element => {
      if (element.matches('button')) element.classList.toggle('active', element.dataset.uxCtoTab === tab);
      else element.classList.toggle('ux-tab-hidden', element.dataset.uxCtoTab !== tab);
    });
    if (state.activeView === 'cto-dashboard') setActiveView('cto-dashboard', tab);
  }

  function setupBusinessTabs() {
    const view = $('#view-business-blueprint');
    const hero = view?.querySelector('.hero-row');
    if (!view || !hero || $('#ux-business-subnav')) return false;
    hero.insertAdjacentHTML('afterend', '<nav id="ux-business-subnav" class="ux-subnav" aria-label="Business blueprint sections"><button type="button" data-ux-business-tab="outcome" class="active">Outcome + requirements</button><button type="button" data-ux-business-tab="data">Business data flow</button><button type="button" data-ux-business-tab="runtime">Runtime + exceptions</button><button type="button" data-ux-business-tab="contracts">Data contracts</button></nav>');
    const mark = (element, tab) => { if (element) element.dataset.uxBusinessTab = tab; };
    mark($('#bp-lens-body')?.closest('.bp-summary-grid'),'outcome'); mark($('#bp-rules')?.closest('.bp-analysis-grid'),'outcome');
    mark($('.bp-flow-card'),'data'); mark($('.bp-runtime-card'),'runtime'); mark($('#bp-exceptions')?.closest('.bp-analysis-grid'),'runtime'); mark($('.bp-contract-card'),'contracts');
    $$('[data-ux-business-tab]').forEach(button => button.addEventListener('click', () => applyBusinessTab(button.dataset.uxBusinessTab)));
    const queryTab = new URLSearchParams(location.search).get('section');
    applyBusinessTab(['outcome','data','runtime','contracts'].includes(queryTab) ? queryTab : 'outcome');
    return true;
  }

  function applyBusinessTab(tab) {
    state.businessTab = tab;
    $$('#view-business-blueprint [data-ux-business-tab]').forEach(element => {
      if (element.matches('button')) element.classList.toggle('active', element.dataset.uxBusinessTab === tab);
      else element.classList.toggle('ux-tab-hidden', element.dataset.uxBusinessTab !== tab);
    });
    if (state.activeView === 'business-blueprint') setActiveView('business-blueprint', tab);
  }

  function wireStatusToasts() {
    const status = $('#run-status');
    if (status && !status.dataset.uxObserved) {
      status.dataset.uxObserved = 'true';
      const emit = () => {
        const next = status.textContent.trim().toUpperCase();
        if (!next || next === state.lastRunStatus) return;
        state.lastRunStatus = next;
        if (next.includes('RUN') || next.includes('START')) toast('The governed workflow is executing. Live events will update the page as each layer completes.', { title: 'Analysis started' });
        else if (next.includes('FULL') || next.includes('COMPLETE') || next.includes('SUCCESS')) toast('The business response and technical evidence are ready to inspect.', { type: 'success', title: 'Analysis completed' });
        else if (next.includes('FAIL') || next.includes('DENIED') || next.includes('ERROR')) toast('The workflow did not complete successfully. Review the visible error and persisted run evidence.', { type: 'error', title: next });
      };
      new MutationObserver(emit).observe(status, { childList: true, characterData: true, subtree: true });
    }
    const error = $('#workflow-error');
    if (error && !error.dataset.uxObserved) {
      error.dataset.uxObserved = 'true';
      let last = '';
      new MutationObserver(() => { const message = error.textContent.trim(); if (message && message !== last) { last = message; toast(message, { type: 'error', title: 'Scenario error' }); } }).observe(error, { childList: true, characterData: true, subtree: true });
    }
  }

  function wireCtoDetailModals() {
    const root = $('#view-cto-dashboard');
    if (!root || root.dataset.uxDetailObserved) return;
    root.dataset.uxDetailObserved = 'true';
    root.addEventListener('click', event => {
      const agent = event.target.closest('.cto-agent');
      if (agent) {
        const name = agent.querySelector('.cto-agent-name')?.textContent || 'Agent';
        const metrics = [...agent.querySelectorAll('.cto-agent-metrics div')].map(item => [item.querySelector('span')?.textContent || '', item.querySelector('strong')?.textContent || '']);
        openModal({ title: name, kicker: 'AGENT OPERATIONS', html: `<p>This view is derived from persisted execution events for the selected CTO dashboard window.</p><table class="ux-modal-table">${metrics.map(([k,v]) => `<tr><td>${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`).join('')}</table>` });
        return;
      }
      const row = event.target.closest('#cto-mcp tbody tr');
      if (row) {
        const cells = [...row.querySelectorAll('td')].map(cell => cell.innerText.trim());
        const labels = ['Canonical capability','Product / source','Calls','Success','Average latency','P95 latency','Evidence'];
        openModal({ title: cells[0] || 'MCP capability', kicker: 'MCP FEDERATION', html: `<p>This capability row is aggregated from completed MCP execution events in the selected time window.</p><table class="ux-modal-table">${labels.map((label,index) => `<tr><td>${esc(label)}</td><td><strong>${esc(cells[index] || '—')}</strong></td></tr>`).join('')}</table>` });
      }
    });
    const decorate = () => { root.querySelectorAll('.cto-agent,#cto-mcp tbody tr').forEach(node => { node.classList.add('ux-click-detail'); node.title ||= 'Click for details'; }); };
    new MutationObserver(decorate).observe(root, { childList: true, subtree: true }); decorate();
  }

  function watchViews() {
    const root = $('.main');
    if (!root || root.dataset.uxViewObserved) return;
    root.dataset.uxViewObserved = 'true';
    const sync = () => {
      const active = $('.view.active-view');
      const name = active?.id?.replace(/^view-/, '');
      if (name && name !== state.activeView) setActiveView(name);
    };
    new MutationObserver(sync).observe(root, { subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  }

  function restoreRequestedView() {
    if (new URLSearchParams(location.search).has('code')) return;
    const requested = new URLSearchParams(location.search).get('view') || 'home';
    const section = new URLSearchParams(location.search).get('section') || undefined;
    navigate(viewMeta[requested] ? requested : 'home', { section });
    if (requested === 'cto-dashboard' && section) setTimeout(() => applyCtoTab(section), 80);
    if (requested === 'business-blueprint' && section) setTimeout(() => applyBusinessTab(section), 80);
  }

  function init() {
    injectChrome();
    injectHome();
    wireStatusToasts();
    watchViews();
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const navReady = normalizeNavigation();
      const ctoReady = setupCtoTabs();
      const businessReady = setupBusinessTabs();
      wireStatusToasts(); wireCtoDetailModals();
      if ((state.normalizedNav || navReady) && ($('#ux-cto-subnav') || ctoReady) && ($('#ux-business-subnav') || businessReady)) {
        clearInterval(timer);
        setTimeout(restoreRequestedView, 80);
      } else if (attempts > 50) {
        clearInterval(timer);
        restoreRequestedView();
      }
    }, 120);
  }

  window.BcsUX = { toast, openModal, closeModal, navigate, refreshHome: () => loadHome(true) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

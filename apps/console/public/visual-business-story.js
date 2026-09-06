/*
 * BCS ONE visual business-story interaction layer.
 *
 * Feedback from external reviewers was consistent: the platform proof was strong,
 * but the business objective was buried under too much explanatory text. This
 * module makes the default experience visual and outcome-led while preserving all
 * existing technical evidence behind progressive disclosure.
 *
 * It also adds Integration Health & Activity and an Approval Center. Approval
 * actions are intentionally NOT faked: the current pilot remains read-only and
 * the page explicitly shows the governed write path required for future actions.
 */
(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => num(value).toLocaleString();
  const pct = value => `${(num(value) * 100).toFixed(1)}%`;
  const ms = value => num(value) >= 1000 ? `${(num(value) / 1000).toFixed(2)} s` : `${Math.round(num(value))} ms`;

  const state = {
    initialized: false,
    integrationLoaded: false,
    activeView: '',
    menuBuilt: false
  };

  const pageCopy = {
    home: {
      eyebrow: 'BCS ONE · EMPLOYEE JOURNEY AI',
      title: 'One employee journey. Many specialist products. One governed AI layer.',
      subtitle: 'BCS ONE helps HR teams get one traceable answer across recruitment, HR, payroll, time, learning, benefits and engagement.'
    },
    'cto-dashboard': {
      eyebrow: 'EXECUTIVE VIEW',
      title: 'Is the platform reliable, governed and economically measurable?',
      subtitle: 'See workflow reliability, agent activity, product federation and AI economics in one place.'
    },
    scenarios: {
      eyebrow: 'SEE IT WORK',
      title: 'Choose a business question. BCS ONE coordinates the right products.',
      subtitle: 'Run one governed workflow, then read the business answer first. Technical proof is available only when you need it.'
    },
    'business-blueprint': {
      eyebrow: 'BUSINESS DESIGN',
      title: 'Turn a working AI workflow into a clear product requirement.',
      subtitle: 'Connect business outcome, rules, data, runtime evidence and acceptance criteria without reading implementation code.'
    },
    architecture: {
      eyebrow: 'HOW IT WORKS',
      title: 'How does one HR question become one governed answer?',
      subtitle: 'Identity and policy come first; source products remain authoritative; AI works only on governed evidence.'
    },
    'integration-health': {
      eyebrow: 'INTEGRATION HEALTH & ACTIVITY',
      title: 'Which product routes are being used, and how are they performing?',
      subtitle: 'Observed MCP activity shows which BCS product integrations participate in real workflows and how those calls behave.'
    },
    mcp: {
      eyebrow: 'AI CAPABILITIES',
      title: 'Which business capabilities can AI use?',
      subtitle: 'Agents call stable business capabilities instead of being tightly coupled to every product API.'
    },
    products: {
      eyebrow: 'BCS PRODUCT SUITE',
      title: 'Which specialist products remain the systems of record?',
      subtitle: 'BCS ONE coordinates the employee journey without replacing the products that own HR, payroll and workforce facts.'
    },
    'trust-readiness': {
      eyebrow: 'TRUST & READINESS',
      title: 'Can we trust the platform to use HR data responsibly?',
      subtitle: 'Access is controlled before data use, evidence is preserved, and the pilot-to-production boundary stays explicit.'
    },
    approvals: {
      eyebrow: 'HUMAN-IN-THE-LOOP CONTROL',
      title: 'How will sensitive HR actions stay under human control?',
      subtitle: 'High-risk writes must be proposed, approved, re-authorized, executed idempotently and audited.'
    },
    evaluations: {
      eyebrow: 'RELEASE QUALITY',
      title: 'Did this release still pass the enterprise controls?',
      subtitle: 'Policy, tenant isolation, MCP contracts and grounding are checked independently of the live user experience.'
    },
    runs: {
      eyebrow: 'WORKFLOW HISTORY',
      title: 'What happened in previous AI workflows?',
      subtitle: 'Inspect durable runs and evidence without rerunning the business process.'
    },
    observability: {
      eyebrow: 'OPERATIONS',
      title: 'Where did time, failures or dependencies affect the workflow?',
      subtitle: 'Follow stage latency and correlated runtime evidence for the latest execution.'
    }
  };

  const purpose = {
    'cto-dashboard': 'Decide whether BCS ONE is reliable, governed and economically measurable.',
    scenarios: 'Answer one HR question across the right products without making the user switch between systems.',
    'business-blueprint': 'Translate a proven workflow into requirements a Product Owner and Business Analyst can review.',
    architecture: 'Show how a user request reaches source systems safely and returns as one grounded answer.',
    'integration-health': 'Make product-federation activity visible without pretending observed traffic is a synthetic heartbeat.',
    mcp: 'Expose stable AI-facing business capabilities while product-specific APIs remain behind adapters.',
    products: 'Keep specialist BCS products authoritative while connecting them into one employee journey.',
    'trust-readiness': 'Prove that identity, policy, evidence and AI behaviour are controlled and reviewable.',
    approvals: 'Keep sensitive changes under explicit human approval and deterministic re-authorization.',
    evaluations: 'Prevent a release from shipping when enterprise AI controls fail.',
    runs: 'Give operators a durable record of what each workflow did.',
    observability: 'Help engineers find latency and failure points quickly.'
  };

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token');
    const expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    return token && (!expires || expires > Date.now() + 15000) ? token : '';
  }

  async function api(path) {
    const token = getToken();
    if (!token) throw new Error('Sign in securely to load tenant-scoped runtime evidence.');
    const response = await fetch(`${config.gatewayUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || `HTTP ${response.status}`);
    return body;
  }

  async function optionalApi(path) {
    try { return await api(path); } catch { return null; }
  }

  function currentView() {
    return $('.view.active-view')?.id?.replace(/^view-/, '') || '';
  }

  function simplifyHero(viewName) {
    const meta = pageCopy[viewName];
    const view = $(`#view-${CSS.escape(viewName)}`);
    const hero = view?.querySelector('.hero-row');
    if (!meta || !hero || hero.dataset.storySimplified) return false;
    const eyebrow = hero.querySelector('.eyebrow');
    const h1 = hero.querySelector('h1');
    const p = hero.querySelector('p');
    if (eyebrow) eyebrow.textContent = meta.eyebrow;
    if (h1) h1.textContent = meta.title;
    if (p) p.textContent = meta.subtitle;
    hero.dataset.storySimplified = 'true';
    return true;
  }

  function addPurpose(viewName) {
    if (!purpose[viewName]) return;
    const view = $(`#view-${CSS.escape(viewName)}`);
    const hero = view?.querySelector('.hero-row');
    if (!view || !hero || view.querySelector('.story-purpose')) return;
    hero.insertAdjacentHTML('afterend', `<div class="story-purpose"><b>Business objective</b><span>${esc(purpose[viewName])}</span></div>`);
  }

  function injectHomeStory() {
    const view = $('#view-home');
    const hero = view?.querySelector('.hero-row');
    if (!view || !hero || $('#story-home-objective')) return false;

    const callout = view.querySelector('.ux-home-callout');
    if (callout) {
      callout.innerHTML = `
        <span>SEE THE BUSINESS VALUE</span>
        <strong>Ask once. Coordinate the right BCS products. Return one traceable answer.</strong>
        <p>Start with a live employee scenario. Open the architecture, controls or CTO economics only when the audience needs more proof.</p>
        <div class="ux-home-actions"><button id="story-home-run" class="button primary" type="button">Run a live scenario</button><button id="story-home-how" class="button secondary" type="button">See how it works</button></div>`;
    }

    hero.insertAdjacentHTML('afterend', `
      <section id="story-home-objective" class="story-objective" aria-labelledby="story-objective-title">
        <div class="story-objective-title"><h2 id="story-objective-title">The business problem BCS ONE solves</h2><span>Designed around BCS's integrated employee-journey proposition.</span></div>
        <div class="story-business-map">
          <article class="story-map-card problem"><div class="story-map-icon">1</div><small>Today</small><strong>HR work spans specialist products</strong><p>People assemble context across recruitment, HR, payroll, time, learning, benefits and engagement.</p></article>
          <div class="story-map-arrow" aria-hidden="true">→</div>
          <article class="story-map-card platform"><div class="story-map-icon">B1</div><small>BCS ONE</small><strong>Coordinate the journey with governed AI</strong><p>Identity, policy, agents and MCP select the right capabilities while source products keep ownership of facts.</p></article>
          <div class="story-map-arrow" aria-hidden="true">→</div>
          <article class="story-map-card outcome"><div class="story-map-icon">✓</div><small>Outcome</small><strong>One answer with evidence</strong><p>HR, managers and employees get a useful result without losing product provenance or control.</p></article>
        </div>
      </section>`);

    $('#story-home-run')?.addEventListener('click', () => $('.nav-item[data-view="scenarios"]')?.click());
    $('#story-home-how')?.addEventListener('click', () => $('#ia-architecture-nav')?.click());
    return true;
  }

  function injectScenarioOrientation() {
    const view = $('#view-scenarios');
    const purposeNode = view?.querySelector('.story-purpose');
    if (!view || !purposeNode || $('#story-scenario-steps')) return false;
    purposeNode.insertAdjacentHTML('afterend', `
      <div id="story-scenario-steps" class="story-three-step" aria-label="How to use Scenario Lab">
        <div class="story-step"><b>1</b><strong>Choose the question</strong><span>Select a business scenario and employee.</span></div>
        <div class="story-step"><b>2</b><strong>BCS ONE coordinates</strong><span>Policy, agents and MCP reach the required products.</span></div>
        <div class="story-step"><b>3</b><strong>Read one answer</strong><span>Start with the business response; open proof only if needed.</span></div>
      </div>`);
    return true;
  }

  function injectArchitectureSummary() {
    const view = $('#view-architecture');
    const purposeNode = view?.querySelector('.story-purpose');
    if (!view || !purposeNode || $('#story-architecture-simple')) return false;
    purposeNode.insertAdjacentHTML('afterend', `
      <div class="story-federation" aria-label="BCS ONE product federation">
        <div class="story-product-cloud" aria-label="Specialist BCS product domains">
          ${['Recruitment','Onboarding','HR','Payroll','Time','Learning','Benefits','Engagement'].map(label => `<span class="story-product-chip">${label}</span>`).join('')}
        </div>
        <div class="story-orchestrator"><div><b>BCS ONE</b><span>AGENTS + MCP + POLICY</span></div></div>
        <div class="story-result"><small>BUSINESS EXPERIENCE</small><strong>One governed answer</strong><span>Source ownership stays with the specialist products.</span></div>
      </div>
      <div id="story-architecture-simple" class="story-architecture-simple">
        <div class="story-arch-stage"><b>1</b><strong>Who is asking?</strong><span>Entra establishes identity and tenant.</span></div>
        <div class="story-arch-stage"><b>2</b><strong>May they access it?</strong><span>OPA makes the deterministic decision.</span></div>
        <div class="story-arch-stage"><b>3</b><strong>Which products hold the facts?</strong><span>Agents select canonical MCP capabilities.</span></div>
        <div class="story-arch-stage"><b>4</b><strong>What evidence returned?</strong><span>Adapters retrieve facts and preserve provenance.</span></div>
        <div class="story-arch-stage"><b>5</b><strong>What should the user know?</strong><span>Azure OpenAI synthesizes governed evidence.</span></div>
      </div>`);
    return true;
  }

  function injectTrustSummary() {
    const view = $('#view-trust-readiness');
    const purposeNode = view?.querySelector('.story-purpose');
    if (!view || !purposeNode || $('#story-trust-promises')) return false;
    purposeNode.insertAdjacentHTML('afterend', `
      <div id="story-trust-promises" class="story-trust-promises">
        <div class="story-trust-card"><i>1</i><strong>Only allowed data</strong><span>Identity and deterministic policy execute before governed capabilities.</span></div>
        <div class="story-trust-card"><i>2</i><strong>Evidence before AI</strong><span>Source facts and provenance exist before grounded synthesis is allowed.</span></div>
        <div class="story-trust-card"><i>3</i><strong>No uncontrolled writes</strong><span>Sensitive changes require human approval, re-authorization and audit.</span></div>
      </div>`);
    return true;
  }

  function markDetails() {
    const groups = {
      home: ['.bcs-journey', '.ux-section-heading', '.ux-audience-grid', '.ux-home-grid', '.ux-architecture-ribbon', '.ux-home-boundary:last-child'],
      scenarios: ['#enterprise-context', '#scenario-story', '#layer-explainer', '.proof-metrics', '.graph-card', '.proof-grid', '.data-card', '.trace-card'],
      architecture: ['.ia-flow-card', '.ia-grid', '.ia-contract-card', '.ia-truth-grid'],
      'trust-readiness': ['.ia-grid', '.ia-readiness-card', '.ia-principles-card']
    };
    Object.entries(groups).forEach(([viewName, selectors]) => {
      const view = $(`#view-${CSS.escape(viewName)}`);
      if (!view) return;
      let count = 0;
      selectors.forEach(selector => view.querySelectorAll(selector).forEach(node => { node.classList.add('story-detail-section'); if (viewName === 'home') node.classList.add('story-home-detail'); count += 1; }));
      if (count) {
        view.classList.add('story-has-details');
        ensureDetailToggle(viewName);
      }
    });
  }

  function ensureDetailToggle(viewName) {
    const view = $(`#view-${CSS.escape(viewName)}`);
    if (!view || view.querySelector('.story-detail-toggle-row')) return;
    const detail = view.querySelector('.story-detail-section');
    if (!detail) return;
    const row = document.createElement('div');
    row.className = 'story-detail-toggle-row';
    row.innerHTML = `<span>Need architecture, controls or execution proof?</span><button class="button secondary story-detail-toggle" type="button">Show deeper detail</button>`;
    detail.parentNode.insertBefore(row, detail);
    const button = row.querySelector('button');
    button.addEventListener('click', () => {
      const open = !view.classList.contains('story-details-open');
      view.classList.toggle('story-details-open', open);
      button.textContent = open ? 'Hide deeper detail' : 'Show deeper detail';
      button.setAttribute('aria-expanded', String(open));
    });
    button.setAttribute('aria-expanded', 'false');
  }

  function injectNewPages() {
    if ($('#view-integration-health') || !$('#view-architecture') || !$('#view-evaluations')) return false;

    $('#view-architecture').insertAdjacentHTML('afterend', `
      <section id="view-integration-health" class="page view story-page">
        <div class="hero-row"><div><div class="eyebrow">INTEGRATION HEALTH & ACTIVITY</div><h1>Which product routes are being used, and how are they performing?</h1><p>Observed runtime activity, not a fabricated heartbeat.</p></div><div class="hero-status"><button id="story-integration-refresh" class="button primary" type="button">Refresh</button></div></div>
        <div class="story-purpose"><b>Business objective</b><span>Make product-federation activity visible without pretending observed traffic is a synthetic heartbeat.</span></div>
        <div id="story-integration-status" class="ia-boundary"><strong>Integration view ready.</strong> Sign in and run scenarios to observe product routes.</div>
        <div class="metric-grid">
          <div class="metric accent-blue"><span>Observed products</span><strong id="story-int-products">—</strong><small>product routes in window</small></div>
          <div class="metric accent-green"><span>MCP calls</span><strong id="story-int-calls">—</strong><small>completed capability traffic</small></div>
          <div class="metric"><span>Live capabilities</span><strong id="story-int-tools">—</strong><small>executable MCP tools</small></div>
          <div class="metric"><span>Observed success</span><strong id="story-int-success">—</strong><small>weighted completed-call rate</small></div>
        </div>
        <div class="ux-section-heading"><div><h2>Product routes observed in real workflows</h2><p>“Observed” means persisted runtime events exist for the selected 30-day window.</p></div></div>
        <div id="story-integration-grid" class="story-integration-grid"><div class="empty-state">No runtime integration evidence loaded yet.</div></div>
        <article class="card"><div class="card-header"><div><div class="card-title">Platform connections</div><div class="card-subtitle">Azure services used by the architecture. These chips describe configured components, not synthetic availability checks.</div></div></div><div class="card-body"><div id="story-platform-chips" class="story-platform-chips"></div></div></article>
      </section>`);

    $('#view-evaluations').insertAdjacentHTML('beforebegin', `
      <section id="view-approvals" class="page view story-page">
        <div class="hero-row"><div><div class="eyebrow">HUMAN-IN-THE-LOOP CONTROL</div><h1>How will sensitive HR actions stay under human control?</h1><p>BCS ONE separates AI proposals from authorization and execution.</p></div><span class="status warning">PILOT READ-ONLY</span></div>
        <div class="story-purpose"><b>Business objective</b><span>Keep sensitive changes under explicit human approval and deterministic re-authorization.</span></div>
        <div class="story-approval-boundary"><i>!</i><div><strong>No fake approval actions are enabled in this pilot.</strong><span>The current environment proves read and synthesis workflows. A real write path must implement the controls below before an Approve button is enabled.</span></div></div>
        <div class="story-approval-flow" aria-label="Governed approval lifecycle">
          <div class="story-approval-stage"><b>01 · PROPOSE</b><strong>Agent proposes</strong><span>AI may recommend a change with evidence and reason.</span></div>
          <div class="story-approval-stage"><b>02 · REVIEW</b><strong>Human reviews</strong><span>An authorized person sees impact, evidence and risk.</span></div>
          <div class="story-approval-stage"><b>03 · RE-AUTHORIZE</b><strong>Policy checks again</strong><span>Approval does not bypass identity, role or purpose controls.</span></div>
          <div class="story-approval-stage"><b>04 · EXECUTE</b><strong>Idempotent write</strong><span>The product adapter performs one controlled system-of-record action.</span></div>
          <div class="story-approval-stage"><b>05 · RECONCILE</b><strong>Audit the result</strong><span>Execution outcome and authoritative state are reconciled and persisted.</span></div>
        </div>
        <div class="story-approval-controls">
          <div class="story-approval-control"><strong>AI cannot approve itself</strong><span>The model can plan or propose, but authorization remains deterministic and human-controlled.</span></div>
          <div class="story-approval-control"><strong>Approval is not execution</strong><span>A fresh authorization decision is required immediately before the write.</span></div>
          <div class="story-approval-control"><strong>Every write must reconcile</strong><span>The source system result must be checked and preserved as audit evidence.</span></div>
        </div>
      </section>`);

    $('#story-integration-refresh')?.addEventListener('click', () => void loadIntegration(true));
    return true;
  }

  function createNavButton(id, viewName, label, icon, title) {
    let button = $(`#${id}`);
    if (button) return button;
    button = document.createElement('button');
    button.id = id;
    button.type = 'button';
    button.className = 'nav-item';
    button.dataset.view = viewName;
    button.dataset.uiIcon = icon;
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', () => activateNewPage(viewName));
    return button;
  }

  function rebuildMenu() {
    const nav = $('.nav');
    const required = ['#ux-home-nav','#cto-dashboard-nav','#business-blueprint-nav','#ia-architecture-nav','#ia-trust-nav'];
    if (!nav || required.some(selector => !$(selector))) return false;

    const integration = createNavButton('story-integration-nav', 'integration-health', 'Integrations', 'IN', 'Observed product routes, calls, success and platform connections.');
    const approvals = createNavButton('story-approvals-nav', 'approvals', 'Approval Center', 'AP', 'Human-in-the-loop control pattern for high-risk writes.');
    const buttons = {
      home: $('#ux-home-nav'),
      'cto-dashboard': $('#cto-dashboard-nav'),
      scenarios: $('.nav-item[data-view="scenarios"]'),
      'business-blueprint': $('#business-blueprint-nav'),
      architecture: $('#ia-architecture-nav'),
      'integration-health': integration,
      mcp: $('.nav-item[data-view="mcp"]'),
      products: $('.nav-item[data-view="products"]'),
      'trust-readiness': $('#ia-trust-nav'),
      approvals,
      evaluations: $('.nav-item[data-view="evaluations"]'),
      runs: $('.nav-item[data-view="runs"]'),
      observability: $('.nav-item[data-view="observability"]')
    };
    const labels = {
      home:'Home', 'cto-dashboard':'CTO Dashboard', scenarios:'Live Scenarios', 'business-blueprint':'Business Design',
      architecture:'How It Works', 'integration-health':'Integrations', mcp:'Capabilities', products:'Products',
      'trust-readiness':'Trust & Readiness', approvals:'Approval Center', evaluations:'Evaluations', runs:'Runs', observability:'Observability'
    };
    Object.entries(buttons).forEach(([key, button]) => { if (button) button.textContent = labels[key]; });

    nav.querySelectorAll('.nav-group').forEach(group => group.remove());
    const groups = [
      ['OVERVIEW',['home','cto-dashboard']],
      ['BUSINESS',['scenarios','business-blueprint']],
      ['PLATFORM',['architecture','integration-health','mcp','products']],
      ['TRUST & CONTROL',['trust-readiness','approvals','evaluations']],
      ['OPERATIONS',['runs','observability']]
    ];
    groups.forEach(([label, keys]) => {
      const group = document.createElement('div');
      group.className = 'nav-group';
      group.innerHTML = `<div class="nav-label">${label}</div>`;
      keys.forEach(key => { if (buttons[key]) group.appendChild(buttons[key]); });
      nav.appendChild(group);
    });
    nav.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => document.body.classList.remove('ux-mobile-nav-open')));
    nav.dataset.storyOrdered = 'true';
    state.menuBuilt = true;
    return true;
  }

  function activateNewPage(viewName) {
    if (!['integration-health','approvals'].includes(viewName)) return;
    $$('.view').forEach(view => view.classList.toggle('active-view', view.id === `view-${viewName}`));
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === viewName));
    const meta = pageCopy[viewName];
    if ($('#page-title')) $('#page-title').textContent = viewName === 'integration-health' ? 'Integration Health' : 'Approval Center';
    if ($('#ux-breadcrumb')) $('#ux-breadcrumb').textContent = `${viewName === 'integration-health' ? 'Platform' : 'Trust & Control'} / ${viewName === 'integration-health' ? 'Integration Health' : 'Approval Center'}`;
    state.activeView = viewName;
    document.body.classList.remove('ux-mobile-nav-open');
    const url = new URL(location.href);
    if (!url.searchParams.has('code')) {
      url.search = '';
      url.searchParams.set('view', viewName);
      history.replaceState({}, '', `${url.pathname}${url.search}`);
    }
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    simplifyHero(viewName);
    addPurpose(viewName);
    if (viewName === 'integration-health') void loadIntegration();
    if (meta) document.title = `BCS ONE | ${meta.title}`;
  }

  async function loadIntegration(force = false) {
    if (state.integrationLoaded && !force) return;
    const status = $('#story-integration-status');
    if (!getToken()) {
      if (status) status.innerHTML = '<strong>Sign in to load observed integration activity.</strong> No tenant-scoped product traffic is shown before authentication.';
      return;
    }
    if (status) status.textContent = 'Loading observed product-federation activity…';
    const [cto, toolsBody] = await Promise.all([optionalApi('/v1/dashboard/cto?days=30'), optionalApi('/v1/mcp/tools')]);
    const rows = Array.isArray(cto?.mcp) ? cto.mcp : [];
    const tools = Array.isArray(toolsBody?.tools) ? toolsBody.tools : [];
    const liveTools = tools.filter(tool => tool.executable !== false && tool.runtimeMode !== 'catalog-only');
    const grouped = new Map();
    rows.forEach(row => {
      const product = row.product || row.sourceSystem || 'Unmapped route';
      const current = grouped.get(product) || { product, sourceSystem: row.sourceSystem || '', calls: 0, weightedSuccess: 0, avgWeighted: 0, p95: 0, capabilities: new Set() };
      const calls = num(row.calls);
      current.calls += calls;
      current.weightedSuccess += num(row.successRate) * calls;
      current.avgWeighted += num(row.avgDurationMs) * calls;
      current.p95 = Math.max(current.p95, num(row.p95DurationMs));
      if (row.capability) current.capabilities.add(row.capability);
      grouped.set(product, current);
    });
    const integrations = [...grouped.values()].sort((a,b) => b.calls - a.calls);
    const totalCalls = integrations.reduce((sum,item) => sum + item.calls, 0);
    const weightedSuccess = totalCalls ? integrations.reduce((sum,item) => sum + item.weightedSuccess, 0) / totalCalls : 0;

    $('#story-int-products').textContent = fmt(integrations.length || cto?.executive?.productsReached || 0);
    $('#story-int-calls').textContent = fmt(totalCalls || cto?.executive?.mcpCalls || 0);
    $('#story-int-tools').textContent = fmt(liveTools.length || tools.length);
    $('#story-int-success').textContent = totalCalls ? pct(weightedSuccess) : 'No activity';

    const grid = $('#story-integration-grid');
    if (grid) {
      grid.innerHTML = integrations.length ? integrations.map(item => {
        const success = item.calls ? item.weightedSuccess / item.calls : 0;
        const avg = item.calls ? item.avgWeighted / item.calls : 0;
        const stateClass = success >= .99 ? 'good' : success >= .9 ? 'warn' : 'neutral';
        const stateText = success >= .99 ? 'Observed · strong' : success >= .9 ? 'Observed · review' : 'Observed';
        return `<article class="story-integration-card"><div class="story-integration-card-head"><div><strong>${esc(item.product)}</strong><small>${esc(item.sourceSystem || 'Product route')}</small></div><span class="story-state ${stateClass}">${esc(stateText)}</span></div><div class="story-integration-metrics"><div><span>Calls</span><b>${fmt(item.calls)}</b></div><div><span>Success</span><b>${pct(success)}</b></div><div><span>Avg latency</span><b>${ms(avg)}</b></div></div><small>${fmt(item.capabilities.size)} canonical capabilities observed · P95 ${ms(item.p95)}</small></article>`;
      }).join('') : '<div class="empty-state">No product routes have been observed in this 30-day window. Run a live scenario to create evidence.</div>';
    }

    const components = Array.isArray(cto?.azure?.components) && cto.azure.components.length
      ? cto.azure.components
      : ['Azure Container Apps','Azure OpenAI','PostgreSQL Flexible Server','Log Analytics','Azure Container Registry','Service Bus','Storage'];
    if ($('#story-platform-chips')) $('#story-platform-chips').innerHTML = components.map(component => `<span class="story-platform-chip">${esc(typeof component === 'string' ? component : component.name || String(component))}</span>`).join('');
    if (status) status.innerHTML = `<strong>Observed runtime activity loaded.</strong> ${fmt(integrations.length)} product routes and ${fmt(totalCalls)} completed MCP calls are visible in the selected tenant window. Status reflects persisted activity, not a synthetic availability probe. Azure billing remains ${esc(cto?.azure?.billingConnection || 'not connected')}.`;
    state.integrationLoaded = true;
  }

  function updateAllPages() {
    Object.keys(pageCopy).forEach(viewName => {
      simplifyHero(viewName);
      if (viewName !== 'home') addPurpose(viewName);
    });
    injectHomeStory();
    injectScenarioOrientation();
    injectArchitectureSummary();
    injectTrustSummary();
    markDetails();
  }

  function wireViewObserver() {
    const main = $('.main');
    if (!main || main.dataset.storyObserved) return;
    main.dataset.storyObserved = 'true';
    const sync = () => {
      const next = currentView();
      if (!next) return;
      state.activeView = next;
      simplifyHero(next);
      if (next !== 'home') addPurpose(next);
      if (next === 'integration-health') void loadIntegration();
      if (pageCopy[next]) document.title = `BCS ONE | ${pageCopy[next].title}`;
    };
    new MutationObserver(sync).observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });
    sync();
  }

  function openExistingModal(title, kicker, html) {
    const backdrop = $('#ux-modal-backdrop');
    if (!backdrop) return false;
    if ($('#ux-modal-title')) $('#ux-modal-title').textContent = title;
    if ($('#ux-modal-kicker')) $('#ux-modal-kicker').textContent = kicker;
    if ($('#ux-modal-body')) $('#ux-modal-body').innerHTML = html;
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ux-modal-open');
    window.setTimeout(() => $('#ux-modal-close')?.focus(), 20);
    return true;
  }

  function wireNewPageTools() {
    const help = $('#ux-help-button');
    const share = $('#ux-share-button');
    if (help && !help.dataset.storyNewPage) {
      help.dataset.storyNewPage = 'true';
      help.addEventListener('click', event => {
        const active = currentView();
        if (!['integration-health','approvals'].includes(active)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const html = active === 'integration-health'
          ? '<p><strong>What this page answers:</strong> which product routes have actually participated in persisted workflows, how many calls were observed, and how those completed calls performed.</p><p>The status is activity-derived. It is not presented as an active synthetic uptime check.</p>'
          : '<p><strong>What this page answers:</strong> how sensitive HR/payroll writes must remain human-controlled.</p><p>The pilot is intentionally read-only. No approval button is shown until a real write workflow implements proposal, approval, re-authorization, idempotency and reconciliation.</p>';
        openExistingModal(active === 'integration-health' ? 'Integration Health' : 'Approval Center', 'HOW TO READ THIS PAGE', html);
      }, true);
    }
    if (share && !share.dataset.storyNewPage) {
      share.dataset.storyNewPage = 'true';
      share.addEventListener('click', event => {
        const active = currentView();
        if (!['integration-health','approvals'].includes(active)) return;
        event.preventDefault(); event.stopImmediatePropagation();
        const url = new URL(location.href); url.search = ''; url.searchParams.set('view', active);
        navigator.clipboard?.writeText(url.toString()).catch(() => openExistingModal('Share this view','DIRECT LINK',`<p class="mono">${esc(url.toString())}</p>`));
      }, true);
    }
  }

  function restoreRequestedPage() {
    const requested = new URLSearchParams(location.search).get('view');
    if (requested === 'integration-health' || requested === 'approvals') window.setTimeout(() => activateNewPage(requested), 80);
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    document.body.classList.add('story-simplified');
    wireViewObserver();

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      injectNewPages();
      rebuildMenu();
      updateAllPages();
      wireNewPageTools();
      if (attempts === 8) restoreRequestedPage();
      if (attempts > 90) window.clearInterval(timer);
    }, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

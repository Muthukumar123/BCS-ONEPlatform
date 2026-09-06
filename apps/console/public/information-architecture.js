/*
 * BCS ONE information architecture layer.
 *
 * Adds two self-explanatory review pages and reorganizes the primary navigation
 * around the way an executive or reviewer consumes the platform:
 * Why -> Business value -> Architecture -> Governance -> Operations.
 *
 * This file does not change runtime orchestration or security behavior. Dynamic
 * values are read from the same authenticated tenant-scoped APIs used elsewhere
 * in the Console.
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

  const requestedView = new URLSearchParams(location.search).get('view');
  const state = { architectureLoaded: false, trustLoaded: false, menuReady: false };

  const pageMeta = {
    architecture: {
      title: 'Architecture & Data Flow',
      group: 'Architecture',
      icon: 'AX',
      help: 'Use this page to understand how a request moves from identity and policy through agents, MCP, adapters, source systems, evidence persistence and grounded AI. Live metrics come from the authenticated runtime; the layer descriptions explain the implemented architecture.'
    },
    'trust-readiness': {
      title: 'Trust & Readiness',
      group: 'Governance',
      icon: 'TR',
      help: 'Use this page to review security controls, release quality, evidence durability and the explicit boundary between what this pilot proves today and what still belongs in a production-hardening programme.'
    }
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

  function injectPages() {
    if ($('#view-architecture')) return;
    const anchor = $('#view-runs') || $('#view-mcp');
    if (!anchor) return false;

    anchor.insertAdjacentHTML('beforebegin', `
      <section id="view-architecture" class="page view ia-page">
        <div class="hero-row ia-hero">
          <div><div class="eyebrow">PLATFORM ARCHITECTURE</div><h1>See exactly how identity, agents, MCP and BCS product data become one governed business response.</h1><p>This page separates control-plane responsibilities from business data flow. Counts and federation activity are loaded from the live tenant-scoped runtime; employer and employee business records remain synthetic reference data.</p></div>
          <div class="hero-status"><button id="ia-architecture-refresh" class="button primary" type="button">Refresh live evidence</button></div>
        </div>

        <div id="ia-architecture-status" class="ia-boundary"><strong>Architecture guide ready.</strong> Sign in to overlay live scenario, MCP, product and agent activity.</div>

        <div class="metric-grid ia-kpis">
          <div class="metric accent-blue"><span>Runtime layers</span><strong>9</strong><small>identity to business response</small></div>
          <div class="metric"><span>Executable scenarios</span><strong id="ia-scenario-count">—</strong><small>business workflows</small></div>
          <div class="metric accent-green"><span>Live MCP tools</span><strong id="ia-tool-count">—</strong><small>canonical capability surface</small></div>
          <div class="metric"><span>Observed product routes</span><strong id="ia-product-count">—</strong><small>tenant activity window</small></div>
          <div class="metric accent-blue"><span>Observed agents</span><strong id="ia-agent-count">—</strong><small>persisted runtime events</small></div>
        </div>

        <article class="card ia-flow-card">
          <div class="card-header"><div><div class="card-title">End-to-end governed data flow</div><div class="card-subtitle">Read left to right: authority is established before business data is retrieved or AI is invoked.</div></div><span class="counter">9 layers</span></div>
          <div class="card-body">
            <div class="ia-flow" aria-label="BCS ONE architecture flow">
              <div class="ia-stage control"><span>01</span><strong>Identity</strong><small>Microsoft Entra authenticates the user.</small></div>
              <div class="ia-stage control"><span>02</span><strong>Gateway</strong><small>Trusted tenant, user, role and purpose context.</small></div>
              <div class="ia-stage govern"><span>03</span><strong>OPA Policy</strong><small>Deterministic authorization before capability access.</small></div>
              <div class="ia-stage agent"><span>04</span><strong>Agent orchestration</strong><small>LangGraph plans and coordinates the workflow.</small></div>
              <div class="ia-stage mcp"><span>05</span><strong>MCP federation</strong><small>Canonical tools/call contracts, not vendor-specific prompts.</small></div>
              <div class="ia-stage data"><span>06</span><strong>Product adapter</strong><small>Maps canonical capability to the underlying product API shape.</small></div>
              <div class="ia-stage data"><span>07</span><strong>Source + evidence</strong><small>Authoritative facts return and evidence is persisted.</small></div>
              <div class="ia-stage ai"><span>08</span><strong>Azure OpenAI</strong><small>Grounded synthesis operates only on governed evidence.</small></div>
              <div class="ia-stage result"><span>09</span><strong>Business response</strong><small>Human-readable answer with provenance and audit trail.</small></div>
            </div>
          </div>
        </article>

        <div class="grid two-col ia-grid">
          <article class="card"><div class="card-header"><div><div class="card-title">Live MCP federation</div><div class="card-subtitle">Observed capability-to-product routing from persisted runtime events.</div></div><span id="ia-mcp-observed" class="counter">—</span></div><div id="ia-mcp-table" class="card-body"><div class="empty-state">Sign in and run scenarios to populate federation evidence.</div></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Responsibility boundaries</div><div class="card-subtitle">What each platform layer is allowed to own.</div></div></div><div class="card-body ia-responsibility">
            <div><span>Source products</span><strong>Authoritative HR, payroll and workforce facts</strong></div>
            <div><span>BCS ONE policy</span><strong>Who may access which capability and purpose</strong></div>
            <div><span>MCP</span><strong>Canonical AI-facing capability contract</strong></div>
            <div><span>Product adapters</span><strong>Acquisition/product-specific API translation</strong></div>
            <div><span>Agents</span><strong>Plan, coordinate and explain workflows</strong></div>
            <div><span>Azure OpenAI</span><strong>Synthesize governed evidence; never become system of record</strong></div>
          </div></article>
        </div>

        <article class="card ia-contract-card"><div class="card-header"><div><div class="card-title">Canonical contract pattern</div><div class="card-subtitle">Why acquired products can change underneath BCS ONE without rewriting every agent workflow.</div></div></div><div class="card-body"><div class="ia-contract-flow"><span>Business intent</span><b>→</b><span>Canonical MCP capability</span><b>→</b><span>Product adapter</span><b>→</b><span>System of record</span><b>→</b><span>Structured evidence</span><b>→</b><span>Grounded AI</span></div><p class="ia-note">API connects software to a product. MCP gives AI a governed, discoverable capability contract across products. The product API still performs the underlying system integration.</p></div></article>

        <div class="ia-truth-grid"><div><span>LIVE PLATFORM</span><strong>Entra · Gateway · OPA · LangGraph · MCP · PostgreSQL · Azure OpenAI</strong></div><div><span>SYNTHETIC BUSINESS DATA</span><strong>Virtual employers, employees and product records used for this pilot</strong></div></div>
      </section>

      <section id="view-trust-readiness" class="page view ia-page">
        <div class="hero-row ia-hero trust-hero">
          <div><div class="eyebrow">TRUST · SECURITY · PRODUCTION READINESS</div><h1>Show what is controlled today, what is independently evaluated, and what still belongs in production hardening.</h1><p>This page avoids a false “production ready” claim. It combines live control evidence with an explicit readiness boundary so security, architecture and executive reviewers can see both strengths and remaining work.</p></div>
          <div class="hero-status"><button id="ia-trust-refresh" class="button primary" type="button">Refresh control evidence</button></div>
        </div>

        <div id="ia-trust-status" class="ia-boundary"><strong>Control model ready.</strong> Sign in to load the latest release gate and tenant-scoped runtime posture.</div>

        <div class="metric-grid ia-kpis trust-kpis">
          <div class="metric accent-green"><span>Latest release gate</span><strong id="ia-release-gate">—</strong><small>enterprise evaluation suite</small></div>
          <div class="metric"><span>Hard-gate failures</span><strong id="ia-hard-gates">—</strong><small>release blockers</small></div>
          <div class="metric accent-blue"><span>Runtime success</span><strong id="ia-success-rate">—</strong><small>selected evidence window</small></div>
          <div class="metric"><span>Policy denials</span><strong id="ia-policy-denials">—</strong><small>explicit governance outcomes</small></div>
          <div class="metric"><span>Governed artifacts</span><strong id="ia-artifacts">—</strong><small>persisted evidence</small></div>
        </div>

        <div class="grid two-col ia-grid">
          <article class="card"><div class="card-header"><div><div class="card-title">Control matrix</div><div class="card-subtitle">Runtime evidence and implemented platform controls.</div></div></div><div id="ia-control-matrix" class="card-body ia-control-list"></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Evidence posture</div><div class="card-subtitle">What a reviewer can verify from this tenant context.</div></div></div><div id="ia-evidence-posture" class="card-body ia-evidence-posture"></div></article>
        </div>

        <article class="card ia-readiness-card"><div class="card-header"><div><div class="card-title">Pilot → production readiness</div><div class="card-subtitle">A transparent separation between demonstrated capabilities and the remaining enterprise programme.</div></div><span class="status info">NO FALSE GREEN</span></div><div class="card-body ia-readiness-grid">
          <section><div class="ia-readiness-head ready">PROVEN IN THE LIVE PILOT</div><ul><li>Entra-authenticated application access</li><li>OPA policy before governed capabilities</li><li>Canonical MCP federation and product adapters</li><li>Durable PostgreSQL run/event/artifact state with tenant controls</li><li>Grounded Azure OpenAI synthesis with measured token usage</li><li>Independent enterprise evaluation gate</li></ul></section>
          <section><div class="ia-readiness-head next">REQUIRED BEFORE CUSTOMER PRODUCTION</div><ul><li>Replace reference adapters with contracted product APIs and identity mappings</li><li>Complete privacy/DPIA, retention, DSAR and customer data-governance controls</li><li>Private endpoints, perimeter/WAF/API-management and production network hardening</li><li>Production HA/backup/restore, DR objectives, SLOs and capacity/load validation</li><li>Full distributed tracing/redaction/operational alerting and incident runbooks</li><li>Approval/re-authorization/outbox controls for high-risk write workflows</li></ul></section>
        </div></article>

        <article class="card ia-principles-card"><div class="card-header"><div><div class="card-title">Non-negotiable AI control principles</div><div class="card-subtitle">These rules are architectural boundaries, not presentation statements.</div></div></div><div class="card-body ia-principles"><div><b>01</b><span>LLM may plan, summarize and explain; it does not authorize access.</span></div><div><b>02</b><span>Source HR/payroll/workforce products remain systems of record.</span></div><div><b>03</b><span>Policy executes before request, tool or action access.</span></div><div><b>04</b><span>Conflicts and missing evidence are surfaced explicitly; no silent invention.</span></div><div><b>05</b><span>High-risk writes follow propose → approve → re-authorize → idempotent execute → reconcile/audit.</span></div></div></article>
      </section>`);

    $('#ia-architecture-refresh')?.addEventListener('click', () => void loadArchitecture(true));
    $('#ia-trust-refresh')?.addEventListener('click', () => void loadTrust(true));
    return true;
  }

  function createNavButton(id, view, label, icon, title) {
    let button = $(`#${id}`);
    if (button) return button;
    button = document.createElement('button');
    button.type = 'button';
    button.id = id;
    button.className = 'nav-item';
    button.dataset.view = view;
    button.dataset.uiIcon = icon;
    button.textContent = label;
    button.title = title;
    button.addEventListener('click', () => activate(view));
    return button;
  }

  function rebuildMenu() {
    const nav = $('.nav');
    const home = $('#ux-home-nav');
    const cto = $('#cto-dashboard-nav');
    const business = $('#business-blueprint-nav');
    if (!nav || !home || !cto || !business) return false;
    if (nav.dataset.iaOrdered === 'true') return true;

    const architecture = createNavButton('ia-architecture-nav', 'architecture', 'Architecture & Data Flow', 'AX', 'Understand end-to-end control, data flow and product federation.');
    const trust = createNavButton('ia-trust-nav', 'trust-readiness', 'Trust & Readiness', 'TR', 'Review security controls, release quality and production-readiness boundaries.');
    const buttons = {
      home,
      'cto-dashboard': cto,
      scenarios: $('.nav-item[data-view="scenarios"]'),
      'business-blueprint': business,
      architecture,
      mcp: $('.nav-item[data-view="mcp"]'),
      products: $('.nav-item[data-view="products"]'),
      'trust-readiness': trust,
      evaluations: $('.nav-item[data-view="evaluations"]'),
      runs: $('.nav-item[data-view="runs"]'),
      observability: $('.nav-item[data-view="observability"]')
    };

    nav.querySelectorAll('.nav-group').forEach(group => group.remove());
    const groups = [
      ['OVERVIEW', ['home','cto-dashboard']],
      ['BUSINESS', ['scenarios','business-blueprint']],
      ['ARCHITECTURE', ['architecture','mcp','products']],
      ['GOVERNANCE', ['trust-readiness','evaluations']],
      ['OPERATIONS', ['runs','observability']]
    ];

    groups.forEach(([label, keys]) => {
      const group = document.createElement('div');
      group.className = 'nav-group';
      group.innerHTML = `<div class="nav-label">${label}</div>`;
      keys.forEach(key => { if (buttons[key]) group.appendChild(buttons[key]); });
      nav.appendChild(group);
    });
    nav.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => document.body.classList.remove('ux-mobile-nav-open')));
    nav.dataset.iaOrdered = 'true';
    state.menuReady = true;

    if (requestedView === 'architecture' || requestedView === 'trust-readiness') window.setTimeout(() => activate(requestedView), 30);
    return true;
  }

  function activate(view) {
    const meta = pageMeta[view];
    if (!meta) return;
    $$('.view').forEach(node => node.classList.toggle('active-view', node.id === `view-${view}`));
    $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
    const title = $('#page-title'); if (title) title.textContent = meta.title;
    const breadcrumb = $('#ux-breadcrumb'); if (breadcrumb) breadcrumb.textContent = `${meta.group} / ${meta.title}`;
    const url = new URL(location.href); url.search = ''; url.searchParams.set('view', view); history.replaceState({}, '', `${url.pathname}${url.search}`);
    document.body.classList.remove('ux-mobile-nav-open');
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (view === 'architecture') void loadArchitecture(); else void loadTrust();
  }

  function inferredProduct(tool) {
    return tool?.product || tool?.productName || tool?.annotations?.product || tool?.metadata?.product || tool?.sourceSystem || tool?.annotations?.sourceSystem || 'Mapped adapter';
  }

  async function loadArchitecture(force = false) {
    if (state.architectureLoaded && !force) return;
    const status = $('#ia-architecture-status');
    if (!getToken()) {
      if (status) status.innerHTML = '<strong>Architecture guide ready.</strong> Sign in securely to overlay tenant-scoped runtime evidence. The architecture explanation remains available without exposing tenant data.';
      return;
    }
    if (status) status.textContent = 'Loading live tenant-scoped architecture evidence…';
    const [scenariosBody, toolsBody, cto] = await Promise.all([optionalApi('/v1/scenarios'), optionalApi('/v1/mcp/tools'), optionalApi('/v1/dashboard/cto?days=30')]);
    const scenarios = Array.isArray(scenariosBody?.scenarios) ? scenariosBody.scenarios : [];
    const tools = Array.isArray(toolsBody?.tools) ? toolsBody.tools : [];
    const liveTools = tools.filter(tool => tool.executable !== false && tool.runtimeMode !== 'catalog-only');
    const mcpRows = Array.isArray(cto?.mcp) ? cto.mcp : [];
    const products = new Set(mcpRows.map(row => row.product).filter(Boolean));
    const agents = Array.isArray(cto?.agents) ? cto.agents : [];

    $('#ia-scenario-count').textContent = fmt(scenarios.length);
    $('#ia-tool-count').textContent = fmt(liveTools.length || tools.length);
    $('#ia-product-count').textContent = fmt(products.size || cto?.executive?.productsReached || 0);
    $('#ia-agent-count').textContent = fmt(agents.length);
    $('#ia-mcp-observed').textContent = `${fmt(cto?.executive?.mcpCalls || 0)} calls`;

    if (mcpRows.length) {
      $('#ia-mcp-table').innerHTML = `<div class="ia-table-wrap"><table class="ia-table"><thead><tr><th>Canonical capability</th><th>Product / source</th><th>Calls</th><th>Success</th><th>Avg latency</th></tr></thead><tbody>${mcpRows.slice(0,14).map(row => `<tr><td><strong class="mono">${esc(row.capability)}</strong></td><td><strong>${esc(row.product || '—')}</strong><small>${esc(row.sourceSystem || '')}</small></td><td>${fmt(row.calls)}</td><td>${pct(row.successRate)}</td><td>${ms(row.avgDurationMs)}</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tools.length) {
      $('#ia-mcp-table').innerHTML = `<div class="ia-capability-list">${tools.slice(0,14).map(tool => `<div><strong class="mono">${esc(tool.name || tool.capability || 'capability')}</strong><span>${esc(inferredProduct(tool))}</span><small>${tool.executable === false || tool.runtimeMode === 'catalog-only' ? 'CATALOG' : 'LIVE TOOL'}</small></div>`).join('')}</div>`;
    } else {
      $('#ia-mcp-table').innerHTML = '<div class="empty-state">No MCP catalog is visible to this security context.</div>';
    }

    if (status) status.innerHTML = `<strong>Live architecture evidence loaded.</strong> ${fmt(scenarios.length)} scenarios, ${fmt(liveTools.length || tools.length)} MCP tools, ${fmt(cto?.executive?.mcpCalls || 0)} observed MCP calls and ${fmt(agents.length)} observed agents are visible in this tenant context. Business records remain synthetic.`;
    state.architectureLoaded = true;
  }

  function controlRow(label, stateText, cssClass, evidence) {
    return `<div class="ia-control-row"><div><strong>${esc(label)}</strong><small>${esc(evidence)}</small></div><span class="status ${cssClass}">${esc(stateText)}</span></div>`;
  }

  async function loadTrust(force = false) {
    if (state.trustLoaded && !force) return;
    const status = $('#ia-trust-status');
    if (!getToken()) {
      renderTrustWithoutRuntime();
      if (status) status.innerHTML = '<strong>Control model visible.</strong> Sign in securely to add tenant-scoped release, policy and evidence metrics.';
      return;
    }
    if (status) status.textContent = 'Loading latest tenant-scoped control evidence…';
    const [cto, evaluations, runsBody] = await Promise.all([optionalApi('/v1/dashboard/cto?days=30'), optionalApi('/v1/evaluations'), optionalApi('/v1/runs?limit=12')]);
    const evalRuns = Array.isArray(evaluations?.runs) ? evaluations.runs : [];
    const latestEval = cto?.latestEvaluation || evalRuns[0] || null;
    const executive = cto?.executive || {};
    const gate = latestEval?.status ? String(latestEval.status).toUpperCase() : 'NO DATA';
    const hardGates = num(latestEval?.hardGateFailures);
    const success = num(executive.successRate);
    const runs = Array.isArray(runsBody?.runs) ? runsBody.runs : [];

    $('#ia-release-gate').textContent = gate;
    $('#ia-hard-gates').textContent = latestEval ? fmt(hardGates) : '—';
    $('#ia-success-rate').textContent = Number.isFinite(Number(executive.successRate)) ? pct(success) : '—';
    $('#ia-policy-denials').textContent = fmt(executive.policyDenials || 0);
    $('#ia-artifacts').textContent = fmt(executive.artifacts || 0);

    const gateClass = gate === 'PASSED' ? 'success' : gate === 'FAILED' ? 'danger' : 'neutral';
    const runtimeClass = success >= .95 ? 'success' : success > 0 ? 'warning' : 'neutral';
    const tokenEvidence = num(executive.totalTokens) > 0;
    const mcpEvidence = num(executive.mcpCalls) > 0;
    $('#ia-control-matrix').innerHTML = [
      controlRow('Identity boundary', 'ACTIVE', 'success', 'Current page is authenticated with a tenant-scoped Entra access token.'),
      controlRow('Deterministic authorization', 'ACTIVE', 'success', `OPA policy outcomes are preserved; ${fmt(executive.policyDenials || 0)} denials observed in the selected window.`),
      controlRow('Release quality gate', gate, gateClass, latestEval ? `${fmt(hardGates)} hard-gate failures in the latest persisted suite.` : 'No evaluation record is visible yet.'),
      controlRow('Durable evidence state', cto?.azure?.stateBackend ? 'ACTIVE' : 'IMPLEMENTED', cto?.azure?.stateBackend ? 'success' : 'info', cto?.azure?.stateBackend || 'PostgreSQL + LangGraph persistence architecture.'),
      controlRow('MCP federation evidence', mcpEvidence ? 'OBSERVED' : 'WAITING', mcpEvidence ? 'success' : 'neutral', `${fmt(executive.mcpCalls || 0)} MCP calls observed in the selected window.`),
      controlRow('AI token observability', tokenEvidence ? 'MEASURED' : 'WAITING', tokenEvidence ? 'success' : 'neutral', `${fmt(executive.totalTokens || 0)} Azure OpenAI tokens persisted from runtime responses.`)
    ].join('');

    $('#ia-evidence-posture').innerHTML = `<div class="ia-evidence-stat"><span>Durable runs visible</span><strong>${fmt(runs.length)}</strong></div><div class="ia-evidence-stat"><span>Artifacts persisted</span><strong>${fmt(executive.artifacts || 0)}</strong></div><div class="ia-evidence-stat"><span>MCP calls observed</span><strong>${fmt(executive.mcpCalls || 0)}</strong></div><div class="ia-evidence-stat"><span>AI calls observed</span><strong>${fmt(executive.aiCalls || cto?.ai?.calls || 0)}</strong></div><div class="ia-evidence-stat"><span>State backend</span><strong>${esc(cto?.azure?.stateBackend || 'PostgreSQL + LangGraph')}</strong></div><div class="ia-evidence-stat"><span>Azure invoice feed</span><strong>${cto?.azure?.billingConnected ? 'CONNECTED' : 'NOT CONNECTED'}</strong></div>`;

    if (status) status.innerHTML = `<strong>Live control evidence loaded.</strong> Latest release gate: ${esc(gate)} · ${fmt(hardGates)} hard-gate failures · ${Number.isFinite(Number(executive.successRate)) ? pct(success) : 'no runtime rate'} run success · ${fmt(executive.artifacts || 0)} governed artifacts.`;
    state.trustLoaded = true;
    $('#ia-release-gate')?.closest('.metric')?.classList.toggle('ia-danger-metric', gate === 'FAILED');
    $('#ia-success-rate')?.closest('.metric')?.classList.toggle('ia-warning-metric', runtimeClass === 'warning');
  }

  function renderTrustWithoutRuntime() {
    $('#ia-control-matrix').innerHTML = [
      controlRow('Identity boundary', 'SIGN IN', 'neutral', 'Entra is the application authentication boundary; runtime evidence is hidden before authentication.'),
      controlRow('Deterministic authorization', 'IMPLEMENTED', 'info', 'OPA executes before governed capability access.'),
      controlRow('Tenant isolation', 'IMPLEMENTED', 'info', 'Tenant-scoped persistence and application context are enforced by the platform design.'),
      controlRow('Grounded AI boundary', 'IMPLEMENTED', 'info', 'Azure OpenAI is downstream of governed evidence, not the authority for HR/payroll facts.')
    ].join('');
    $('#ia-evidence-posture').innerHTML = '<div class="empty-state">Sign in to load release-gate, run, MCP, token and artifact evidence for this tenant context.</div>';
  }

  function interceptTopbarActions() {
    document.addEventListener('click', event => {
      const active = $('.view.active-view');
      const view = active?.id?.replace(/^view-/, '');
      if (!pageMeta[view]) return;
      if (event.target.closest('#ux-help-button')) {
        event.preventDefault(); event.stopImmediatePropagation();
        const meta = pageMeta[view];
        const backdrop = $('#ux-modal-backdrop');
        if (backdrop) {
          $('#ux-modal-kicker').textContent = 'HOW TO USE THIS PAGE';
          $('#ux-modal-title').textContent = meta.title;
          $('#ux-modal-body').innerHTML = `<p>${esc(meta.help)}</p><h3>Evidence boundary</h3><p>Dynamic values come from authenticated BCS ONE APIs. Architecture/readiness descriptions are platform design statements. Synthetic HR/payroll business data is never presented as customer production data.</p>`;
          backdrop.classList.add('open'); backdrop.setAttribute('aria-hidden', 'false'); document.body.classList.add('ux-modal-open');
        }
      }
      if (event.target.closest('#ux-share-button')) {
        event.preventDefault(); event.stopImmediatePropagation();
        const url = new URL(location.href); url.search = ''; url.searchParams.set('view', view);
        navigator.clipboard?.writeText(url.toString()).catch(() => {});
      }
    }, true);
  }

  function init() {
    injectPages();
    interceptTopbarActions();
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      injectPages();
      if (rebuildMenu() || attempts > 100) window.clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const navMeta = {
    scenarios: ['SC', 'Scenario Lab', 'Run governed employee and cross-product scenarios'],
    'business-blueprint': ['BA', 'Product Owner + BA View', 'Business requirements, ownership and live acceptance evidence'],
    runs: ['AR', 'Agent Runs', 'Inspect durable agent execution history'],
    observability: ['OB', 'Observability', 'Inspect runtime evidence and latency'],
    evaluations: ['EV', 'Evaluations', 'Review release quality gates'],
    mcp: ['MC', 'Capability Hub', 'Explore canonical MCP capabilities'],
    products: ['PL', 'Product Landscape', 'Explore the BCS product federation']
  };

  function decorateNavigation() {
    $$('.nav-item').forEach(item => {
      const key = item.dataset.view || '';
      const meta = navMeta[key];
      if (!meta) return;
      item.dataset.uiIcon = meta[0];
      item.setAttribute('aria-label', meta[2]);
      item.title = meta[2];
      if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function watchNavigation() {
    const nav = $('.nav');
    if (!nav || nav.dataset.uiObserved) return;
    nav.dataset.uiObserved = 'true';
    const observer = new MutationObserver(() => decorateNavigation());
    observer.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  }

  function currentMode() {
    const query = new URLSearchParams(window.location.search).get('mode');
    if (query === 'technical' || query === 'guided') return query;
    try { return sessionStorage.getItem('bcs_ui_mode') || 'guided'; } catch { return 'guided'; }
  }

  function applyMode(mode) {
    document.body.classList.toggle('ui-guided', mode !== 'technical');
    $$('.ui-segment [data-ui-mode]').forEach(button => {
      const active = button.dataset.uiMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    try { sessionStorage.setItem('bcs_ui_mode', mode); } catch { /* storage can be disabled */ }
  }

  function addViewModeControl() {
    const view = $('#view-scenarios');
    const hero = view?.querySelector('.hero-row');
    if (!view || !hero || $('#ui-view-mode')) return;
    hero.insertAdjacentHTML('afterend', `
      <div id="ui-view-mode" class="ui-view-mode" role="region" aria-label="Scenario page detail level">
        <div class="ui-view-mode-copy">
          <strong>Choose how much implementation detail you want to see</strong>
          <span>Guided view keeps the business story first. Full technical proof exposes the graph, MCP rows, structured JSON and trace.</span>
        </div>
        <div class="ui-segment" role="group" aria-label="Detail level">
          <button type="button" data-ui-mode="guided">Guided view</button>
          <button type="button" data-ui-mode="technical">Full technical proof</button>
        </div>
      </div>`);
    $$('.ui-segment [data-ui-mode]').forEach(button => button.addEventListener('click', () => applyMode(button.dataset.uiMode)));
    applyMode(currentMode());
  }

  function ensureScenarioAnchors() {
    const view = $('#view-scenarios');
    if (!view || $('#ui-scenario-anchor-bar')) return false;
    const enterprise = $('#enterprise-context');
    const layout = view.querySelector('.scenario-layout');
    const answer = $('#business-answer');
    const layers = $('#layer-explainer');
    const metrics = view.querySelector('.proof-metrics');
    if (!enterprise || !layout || !answer || !layers || !metrics) return false;

    layout.id ||= 'ui-execute-section';
    metrics.id ||= 'ui-proof-metrics';
    const control = $('#ui-view-mode');
    if (!control) return false;
    control.insertAdjacentHTML('afterend', `
      <nav id="ui-scenario-anchor-bar" class="ui-anchor-bar" aria-label="Scenario page sections">
        <button type="button" data-scroll-target="enterprise-context">1 · What this proves</button>
        <button type="button" data-scroll-target="ui-execute-section">2 · Choose + execute</button>
        <button type="button" data-scroll-target="business-answer">3 · Business response</button>
        <button type="button" data-scroll-target="layer-explainer">4 · Runtime layers</button>
        <button type="button" data-scroll-target="ui-proof-metrics">5 · Technical proof</button>
      </nav>`);

    const graph = view.querySelector('.graph-card');
    if (graph && !$('#ui-technical-prompt')) {
      graph.insertAdjacentHTML('beforebegin', `
        <div id="ui-technical-prompt" class="ui-technical-prompt">
          <strong>Need the engineering proof?</strong>
          The guided view intentionally keeps raw implementation detail out of the main reading path. The same run still contains the live MCP execution graph, structured source payloads and correlated trace.
          <button type="button" class="button secondary" id="ui-show-technical">Show full technical proof</button>
        </div>`);
      $('#ui-show-technical')?.addEventListener('click', () => {
        applyMode('technical');
        setTimeout(() => graph.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
      });
    }
    wireAnchorButtons($('#ui-scenario-anchor-bar'));
    return true;
  }

  function ensureBlueprintAnchors() {
    const view = $('#view-business-blueprint');
    const hero = view?.querySelector('.hero-row');
    if (!view || !hero || $('#ui-blueprint-anchor-bar')) return false;
    const metrics = $('#blueprint-metrics');
    const controls = view.querySelector('.blueprint-controls');
    const flow = view.querySelector('.bp-flow-card');
    const runtime = view.querySelector('.bp-runtime-card');
    const contracts = view.querySelector('.bp-contract-card');
    if (!metrics || !controls || !flow || !runtime || !contracts) return false;
    metrics.id ||= 'blueprint-metrics';
    controls.id = 'ui-bp-scenario';
    flow.id = 'ui-bp-flow';
    runtime.id = 'ui-bp-runtime';
    contracts.id = 'ui-bp-contracts';
    hero.insertAdjacentHTML('afterend', `
      <nav id="ui-blueprint-anchor-bar" class="ui-anchor-bar" aria-label="Product and business blueprint sections">
        <button type="button" data-scroll-target="blueprint-metrics">Overview</button>
        <button type="button" data-scroll-target="ui-bp-scenario">Scenario + lens</button>
        <button type="button" data-scroll-target="ui-bp-flow">Business data flow</button>
        <button type="button" data-scroll-target="ui-bp-runtime">Live runtime</button>
        <button type="button" data-scroll-target="ui-bp-contracts">Data contracts</button>
      </nav>`);
    wireAnchorButtons($('#ui-blueprint-anchor-bar'));
    return true;
  }

  function wireAnchorButtons(root) {
    root?.querySelectorAll('[data-scroll-target]').forEach(button => {
      button.addEventListener('click', () => {
        const target = document.getElementById(button.dataset.scrollTarget);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function improveCopyAndSemantics() {
    const login = $('#login-button');
    if (login) login.textContent = 'Sign in securely';
    const run = $('#run-scenario');
    if (run) run.textContent = 'Run governed analysis';
    const clear = $('#clear-run');
    if (clear) clear.textContent = 'Reset';

    $$('.card').forEach(card => card.setAttribute('role', card.getAttribute('role') || 'region'));
    $$('.scenario-card').forEach(card => card.setAttribute('aria-pressed', String(card.classList.contains('selected'))));
  }

  function watchScenarioSelection() {
    const grid = $('#scenario-grid');
    if (!grid || grid.dataset.uiObserved) return;
    grid.dataset.uiObserved = 'true';
    const observer = new MutationObserver(() => {
      $$('.scenario-card').forEach(card => card.setAttribute('aria-pressed', String(card.classList.contains('selected'))));
    });
    observer.observe(grid, { subtree: true, attributes: true, childList: true, attributeFilter: ['class'] });
  }

  function init() {
    decorateNavigation();
    watchNavigation();
    addViewModeControl();
    improveCopyAndSemantics();
    watchScenarioSelection();

    // The self-explaining and PO/BA modules inject sections at runtime. Retry
    // briefly so the navigation enhancements attach without coupling modules.
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      decorateNavigation();
      improveCopyAndSemantics();
      const scenarioReady = ensureScenarioAnchors();
      const blueprintReady = ensureBlueprintAnchors();
      if ((scenarioReady || $('#ui-scenario-anchor-bar')) && (blueprintReady || $('#ui-blueprint-anchor-bar')) || attempts > 30) {
        window.clearInterval(timer);
      }
    }, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

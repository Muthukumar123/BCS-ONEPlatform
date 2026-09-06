(() => {
  const config = window.__BCS_ONE_CONFIG__ || {};
  const state = { data: null, scenarios: [], days: 30, loading: false, timer: null };
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const fmt = value => num(value).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const pct = value => `${(num(value) * 100).toFixed(1)}%`;
  const ms = value => num(value) >= 1000 ? `${(num(value) / 1000).toFixed(2)} s` : `${Math.round(num(value))} ms`;
  const usd = value => `$${num(value).toLocaleString(undefined, { minimumFractionDigits: num(value) < 1 ? 4 : 2, maximumFractionDigits: num(value) < 1 ? 6 : 2 })}`;
  const tokenFmt = value => num(value) >= 1_000_000 ? `${(num(value)/1_000_000).toFixed(2)}M` : num(value) >= 1_000 ? `${(num(value)/1_000).toFixed(1)}K` : fmt(value);

  function getToken() {
    const token = sessionStorage.getItem('bcs_access_token');
    const expires = Number(sessionStorage.getItem('bcs_access_token_expires') || 0);
    return token && (!expires || expires > Date.now() + 15000) ? token : '';
  }

  async function api(path) {
    const token = getToken();
    if (!token) throw new Error('Sign in with Entra to load tenant-scoped CTO metrics.');
    const response = await fetch(`${config.gatewayUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || body.code || `HTTP ${response.status}`);
    return body;
  }

  function injectPage() {
    if ($('#view-cto-dashboard')) return;
    const nav = $('.nav');
    const main = $('.main');
    if (!nav || !main) return;

    const businessGroup = $('.business-nav-group');
    const anchorGroup = businessGroup || nav.querySelector('.nav-group');
    anchorGroup?.insertAdjacentHTML('afterend', `
      <div class="nav-group cto-nav-group"><div class="nav-label">EXECUTIVE</div>
        <button class="nav-item" id="cto-dashboard-nav" data-view="cto-dashboard" data-ui-icon="CT">CTO Dashboard</button>
      </div>`);

    const anchorView = $('#view-business-blueprint') || $('#view-scenarios');
    anchorView?.insertAdjacentHTML('afterend', `
      <section id="view-cto-dashboard" class="page view cto-dashboard-view">
        <div class="hero-row cto-hero">
          <div><div class="eyebrow">EXECUTIVE OPERATIONS + ECONOMICS</div><h1>See how BCS ONE agents, MCP federation and AI spend behave as one measurable platform.</h1><p>Tenant-scoped runtime metrics from persisted runs and execution events. Token usage is measured from Azure OpenAI responses; AI cost is an estimate, not an Azure invoice.</p></div>
          <div class="hero-status cto-hero-actions"><select id="cto-window" class="cto-window" aria-label="Dashboard time window"><option value="7">Last 7 days</option><option value="30" selected>Last 30 days</option><option value="90">Last 90 days</option></select><button id="cto-refresh" class="button primary" type="button">Refresh dashboard</button><span class="cto-refresh-note">Auto-refresh · 60s</span></div>
        </div>

        <div id="cto-status" class="cto-boundary">Sign in as HR or payroll to load live tenant metrics.</div>

        <div class="metric-grid cto-kpis cto-section" id="cto-kpis"></div>
        <div class="cto-insight-strip" id="cto-insights"></div>

        <div class="cto-section-grid cto-section">
          <article class="card"><div class="card-header"><div><div class="card-title">Platform activity trend</div><div class="card-subtitle">Runs, MCP calls and estimated AI economics by day.</div></div></div><div id="cto-trend" class="card-body"></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Executive control posture</div><div class="card-subtitle">Release gate, policy outcomes and evidence durability.</div></div></div><div id="cto-control" class="card-body"></div></article>
        </div>

        <article class="card cto-section"><div class="card-header"><div><div class="card-title">Agent View</div><div class="card-subtitle">Which agents are active, what they do and how much work they perform.</div></div><span id="cto-agent-count" class="counter">—</span></div><div id="cto-agents" class="card-body"></div></article>

        <article class="card cto-section"><div class="card-header"><div><div class="card-title">MCP Federation View</div><div class="card-subtitle">Capability traffic, product routing, latency and source-system evidence.</div></div><span id="cto-mcp-count" class="counter">—</span></div><div id="cto-mcp" class="card-body"></div></article>

        <article class="card cto-section"><div class="card-header"><div><div class="card-title">Tokens consumed + AI cost</div><div class="card-subtitle">Measured model usage with transparent reference-rate economics and volume projections.</div></div><span id="cto-ai-model" class="counter">—</span></div><div id="cto-ai-cost" class="card-body"></div></article>

        <div class="cto-section-grid cto-section">
          <article class="card"><div class="card-header"><div><div class="card-title">Scenario economics</div><div class="card-subtitle">Run mix, federation intensity, latency and AI cost by business scenario.</div></div></div><div id="cto-scenarios" class="card-body"></div></article>
          <article class="card"><div class="card-header"><div><div class="card-title">Azure + AI cost boundary</div><div class="card-subtitle">What is measured, what is estimated and what requires Azure billing integration.</div></div></div><div id="cto-azure" class="card-body"></div></article>
        </div>
      </section>`);

    $('#cto-dashboard-nav')?.addEventListener('click', () => {
      $$('.view').forEach(view => view.classList.toggle('active-view', view.id === 'view-cto-dashboard'));
      $$('.nav-item').forEach(item => item.classList.toggle('active', item.id === 'cto-dashboard-nav'));
      const title = $('#page-title'); if (title) title.textContent = 'CTO Dashboard';
      void refresh();
    });
    $('#cto-refresh')?.addEventListener('click', () => void refresh(true));
    $('#cto-window')?.addEventListener('change', event => {
      state.days = Number(event.target.value) || 30;
      void refresh(true);
    });
    state.timer = window.setInterval(() => {
      if ($('#view-cto-dashboard')?.classList.contains('active-view')) void refresh(true, true);
    }, 60_000);
  }

  function scenarioTitle(id) {
    return state.scenarios.find(item => item.id === id)?.title || id || 'Unknown scenario';
  }

  function roleForAgent(agent) {
    const name = String(agent || '').toLowerCase();
    if (name.includes('governance')) return 'Governance';
    if (name.includes('synthesis') || name.includes('explanation')) return 'AI';
    if (name.includes('supervisor')) return 'Supervisor';
    if (name === 'unassigned') return 'Platform';
    return 'Domain agent';
  }

  function renderKpis() {
    const e = state.data?.executive || {};
    const cards = [
      ['Runs', fmt(e.runs), `${fmt(e.completedRuns)} completed`, 'blue'],
      ['Success rate', pct(e.successRate), `${fmt(e.failedRuns)} failed`, 'green'],
      ['MCP calls', fmt(e.mcpCalls), `${fmt(e.avgMcpCallsPerRun)} calls / run`, 'violet'],
      ['Products reached', fmt(e.productsReached), 'live product routes observed', 'blue'],
      ['AI tokens', tokenFmt(e.totalTokens), `${tokenFmt(e.reasoningTokens)} reasoning subset`, 'violet'],
      ['AI cost estimate', usd(e.estimatedAiCostUsd), `${usd(e.avgAiCostPerCompletedRunUsd)} / completed run`, 'gold'],
      ['Avg run latency', ms(e.avgRunDurationMs), 'end-to-end durable workflow', 'blue'],
      ['Governed artifacts', fmt(e.artifacts), `${fmt(e.policyDenials)} policy denials`, 'green']
    ];
    $('#cto-kpis').innerHTML = cards.map(([label,value,sub,cls]) => `<div class="metric cto-kpi ${cls}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></div>`).join('');
  }

  function renderInsights() {
    const e = state.data?.executive || {};
    const evalRun = state.data?.latestEvaluation;
    const projected10k = num(e.avgAiCostPerCompletedRunUsd) * 10000;
    const evalText = evalRun ? `${String(evalRun.status || '').toUpperCase()} · ${fmt(evalRun.hardGateFailures)} hard-gate failures` : 'No evaluation record in window';
    $('#cto-insights').innerHTML = `
      <div class="cto-insight"><span>Federation leverage</span><strong>${fmt(e.avgMcpCallsPerRun)} canonical capabilities per run</strong><p>${fmt(e.mcpCalls)} MCP calls reached ${fmt(e.productsReached)} product routes while the business-facing contract stayed canonical.</p></div>
      <div class="cto-insight"><span>Run economics</span><strong>${usd(e.avgAiCostPerCompletedRunUsd)} estimated AI cost per completed run</strong><p>At the observed run mix, 10,000 completed runs extrapolate to roughly ${usd(projected10k)} in token cost before Azure infrastructure spend.</p></div>
      <div class="cto-insight"><span>Governance posture</span><strong>${esc(evalText)}</strong><p>${fmt(e.policyDenials)} policy denials were preserved as explicit control outcomes; denials are not converted into confident AI answers.</p></div>`;
  }

  function renderTrend() {
    const rows = state.data?.trend || [];
    if (!rows.length) { $('#cto-trend').innerHTML = '<div class="cto-empty">No persisted activity exists for this window.</div>'; return; }
    const visible = rows.slice(-Math.min(rows.length, state.days > 30 ? 30 : 14));
    const max = Math.max(1, ...visible.map(row => num(row.mcpCalls)));
    $('#cto-trend').innerHTML = `<div class="cto-chart">${visible.map(row => `<div class="cto-chart-row"><span class="cto-chart-date">${esc(row.day.slice(5))}</span><div class="cto-chart-track" title="${fmt(row.mcpCalls)} MCP calls"><div class="cto-chart-bar" style="width:${Math.max(2,(num(row.mcpCalls)/max)*100)}%"></div></div><strong>${fmt(row.runs)} runs</strong><span class="cto-chart-cost">${usd(row.estimatedAiCostUsd)}</span></div>`).join('')}</div><div class="cto-legend"><span>Blue bar = MCP calls</span><span>Run count = durable workflows</span><span>Cost = estimated token spend</span></div>`;
  }

  function renderControl() {
    const e = state.data?.executive || {};
    const evalRun = state.data?.latestEvaluation;
    const successClass = num(e.successRate) >= .95 ? 'success' : num(e.successRate) >= .8 ? 'info' : 'warning';
    $('#cto-control').innerHTML = `<div class="key-values"><span>Latest release gate</span><strong>${esc(evalRun?.status ? String(evalRun.status).toUpperCase() : 'NO DATA')}</strong><span>Hard gate failures</span><strong>${fmt(evalRun?.hardGateFailures)}</strong><span>Runtime success rate</span><strong><span class="status ${successClass}">${pct(e.successRate)}</span></strong><span>Policy denials</span><strong>${fmt(e.policyDenials)}</strong><span>Evidence artifacts</span><strong>${fmt(e.artifacts)}</strong><span>State backend</span><strong>${esc(state.data?.azure?.stateBackend || '—')}</strong></div><div class="cto-boundary"><b>Control interpretation:</b> policy denials are expected governance outcomes, not platform failures. Release quality is independently gated by the enterprise evaluation suite.</div>`;
  }

  function renderAgents() {
    const agents = state.data?.agents || [];
    $('#cto-agent-count').textContent = `${agents.length} agents`;
    if (!agents.length) { $('#cto-agents').innerHTML = '<div class="cto-empty">Run scenarios to populate agent activity.</div>'; return; }
    $('#cto-agents').innerHTML = `<div class="cto-agent-grid">${agents.slice(0,12).map(agent => {
      const health = num(agent.failedEvents) > 0 ? 'warn' : '';
      return `<div class="cto-agent"><div class="cto-agent-head"><div><div class="cto-agent-name">${esc(agent.agent)}</div><span class="cto-health ${health}">${num(agent.failedEvents) ? `${fmt(agent.failedEvents)} exceptions` : 'Healthy'}</span></div><span class="cto-agent-role">${esc(roleForAgent(agent.agent))}</span></div><div class="cto-agent-metrics"><div><span>Runs</span><strong>${fmt(agent.runs)}</strong></div><div><span>MCP calls</span><strong>${fmt(agent.mcpCalls)}</strong></div><div><span>Artifacts</span><strong>${fmt(agent.artifacts)}</strong></div><div><span>Avg latency</span><strong>${ms(agent.avgDurationMs)}</strong></div>${num(agent.aiCalls) ? `<div><span>AI calls</span><strong>${fmt(agent.aiCalls)}</strong></div><div><span>AI tokens</span><strong>${tokenFmt(num(agent.inputTokens)+num(agent.outputTokens))}</strong></div>` : ''}</div></div>`;
    }).join('')}</div>`;
  }

  function renderMcp() {
    const rows = state.data?.mcp || [];
    const totalCalls = rows.reduce((sum,row)=>sum+num(row.calls),0);
    $('#cto-mcp-count').textContent = `${fmt(totalCalls)} calls`;
    if (!rows.length) { $('#cto-mcp').innerHTML = '<div class="cto-empty">No completed MCP calls in this window.</div>'; return; }
    $('#cto-mcp').innerHTML = `<div class="cto-table-wrap"><table class="cto-table"><thead><tr><th>Canonical capability</th><th>Product / source</th><th>Calls</th><th>Success</th><th>Avg latency</th><th>P95</th><th>Evidence</th></tr></thead><tbody>${rows.slice(0,20).map(row => `<tr><td><strong class="mono">${esc(row.capability)}</strong></td><td><strong>${esc(row.product)}</strong><small>${esc(row.sourceSystem)}</small></td><td>${fmt(row.calls)}</td><td><span class="cto-health ${num(row.successRate)<.99?'warn':''}">${pct(row.successRate)}</span></td><td>${ms(row.avgDurationMs)}</td><td>${ms(row.p95DurationMs)}</td><td>${fmt(row.artifacts)} artifacts</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderAiCost() {
    const e = state.data?.executive || {};
    const ai = state.data?.ai || {};
    const pricing = ai.pricing || {};
    const perRun = num(e.avgAiCostPerCompletedRunUsd);
    const projections = [1000,10000,100000];
    $('#cto-ai-model').textContent = ai.deployment || 'Azure OpenAI';
    $('#cto-ai-cost').innerHTML = `<div class="cto-token-grid"><div class="cto-token-card"><span>Input tokens</span><strong>${tokenFmt(e.inputTokens)}</strong><small>includes cached input</small></div><div class="cto-token-card"><span>Cached input</span><strong>${tokenFmt(e.cachedInputTokens)}</strong><small>lower reference rate</small></div><div class="cto-token-card"><span>Output tokens</span><strong>${tokenFmt(e.outputTokens)}</strong><small>includes reasoning output</small></div><div class="cto-token-card"><span>Reasoning tokens</span><strong>${tokenFmt(e.reasoningTokens)}</strong><small>subset of output tokens</small></div><div class="cto-token-card"><span>AI calls</span><strong>${fmt(e.aiCalls)}</strong><small>completed model responses</small></div></div><div class="cto-cost-hero" style="margin-top:14px"><div class="cto-cost-primary"><span>Observed AI token estimate</span><strong>${usd(e.estimatedAiCostUsd)}</strong><p>${usd(perRun)} average per completed workflow. Incomplete retry usage is accumulated when Azure reports token usage.</p></div><div><div class="cto-projection">${projections.map(volume => `<div><span>${volume.toLocaleString()} completed runs</span><strong>${usd(perRun*volume)}</strong></div>`).join('')}</div><div class="cto-pricing"><b>Reference rates:</b> input ${usd(pricing.inputPer1M)}/1M · cached input ${usd(pricing.cachedInputPer1M)}/1M · output ${usd(pricing.outputPer1M)}/1M. ${esc(pricing.source || '')}</div></div></div>${num(e.totalTokens)===0?'<div class="cto-boundary"><b>Telemetry note:</b> token metrics begin with runs executed after this dashboard release. Existing historical runs do not have retroactive model-token usage.</div>':''}`;
  }

  function renderScenarios() {
    const rows = state.data?.scenarios || [];
    if (!rows.length) { $('#cto-scenarios').innerHTML = '<div class="cto-empty">No scenario economics available yet.</div>'; return; }
    $('#cto-scenarios').innerHTML = `<div class="cto-table-wrap"><table class="cto-table"><thead><tr><th>Scenario</th><th>Runs</th><th>Success</th><th>MCP calls</th><th>Avg latency</th><th>AI cost</th><th>Cost / success</th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(scenarioTitle(row.scenarioId))}</strong><small class="mono">${esc(row.scenarioId)}</small></td><td>${fmt(row.runs)}</td><td>${pct(row.successRate)}</td><td>${fmt(row.mcpCalls)}</td><td>${ms(row.avgDurationMs)}</td><td>${usd(row.estimatedAiCostUsd)}</td><td>${usd(row.costPerCompletedRunUsd)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function renderAzure() {
    const azure = state.data?.azure || {};
    const billing = azure.billing || {};
    const ai = state.data?.ai || {};
    const components = azure.platformComponents || [];
    $('#cto-azure').innerHTML = `<div class="cto-azure-grid"><div class="cto-azure-panel"><h3>Live platform footprint</h3><div class="cto-keyline"><span>Azure region</span><strong>${esc(azure.region || 'not reported')}</strong></div><div class="cto-keyline"><span>Runtime</span><strong>${esc(azure.runtime || '—')}</strong></div><div class="cto-keyline"><span>AI deployment</span><strong>${esc(ai.deployment || '—')}</strong></div><div class="cto-keyline"><span>State</span><strong>${esc(azure.stateBackend || '—')}</strong></div><div class="cto-components">${components.map(item => `<span class="cto-component">${esc(item)}</span>`).join('')}</div></div><div class="cto-azure-panel"><h3>Cost truth boundary</h3><div class="cto-keyline"><span>AI tokens</span><strong>MEASURED</strong></div><div class="cto-keyline"><span>AI cost</span><strong>ESTIMATED</strong></div><div class="cto-keyline"><span>Actual Azure spend</span><strong>${esc(billing.status || 'NOT CONNECTED')}</strong></div><div class="cto-keyline"><span>Invoice amount</span><strong>Not fabricated</strong></div><p style="font-size:11px;color:var(--text-soft);line-height:1.5">${esc(billing.note || '')}</p></div></div><div class="cto-boundary"><b>CTO interpretation:</b> this dashboard deliberately separates metered application economics from cloud billing. A future Azure Cost Management integration can add actual Container Apps, PostgreSQL, Log Analytics, networking and OpenAI invoice spend without changing the runtime telemetry model.</div>`;
  }

  function renderAll() {
    if (!state.data) return;
    renderKpis(); renderInsights(); renderTrend(); renderControl(); renderAgents(); renderMcp(); renderAiCost(); renderScenarios(); renderAzure();
    const status = $('#cto-status');
    if (status) status.innerHTML = `<b>LIVE TENANT METRICS</b> · ${esc(state.data.windowDays)}-day window · generated ${esc(new Date(state.data.generatedAt).toLocaleString())}. Metrics are tenant-isolated through PostgreSQL RLS.`;
  }

  async function refresh(force = false, silent = false) {
    if (state.loading) return;
    if (!force && state.data) { renderAll(); return; }
    state.loading = true;
    $('#view-cto-dashboard')?.classList.add('cto-loading');
    if (!silent && $('#cto-status')) $('#cto-status').textContent = 'Loading tenant-scoped runtime economics…';
    try {
      const [dashboard, scenarioPayload] = await Promise.all([
        api(`/v1/dashboard/cto?days=${encodeURIComponent(state.days)}`),
        api('/v1/scenarios')
      ]);
      state.data = dashboard;
      state.scenarios = Array.isArray(scenarioPayload.scenarios) ? scenarioPayload.scenarios : [];
      renderAll();
    } catch (error) {
      if ($('#cto-status')) $('#cto-status').innerHTML = `<b>Dashboard unavailable:</b> ${esc(error instanceof Error ? error.message : error)}. HR/payroll role is required.`;
    } finally {
      state.loading = false;
      $('#view-cto-dashboard')?.classList.remove('cto-loading');
    }
  }

  function init() { injectPage(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

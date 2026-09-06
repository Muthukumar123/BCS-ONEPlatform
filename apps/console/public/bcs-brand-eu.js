/*
 * BCS ONE brand + accessibility interaction layer.
 *
 * The runtime modules own business behaviour. This file only improves navigation,
 * discoverability and accessibility around the existing live application.
 */
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  const state = {
    scenarioMode: 'all',
    scenarioQuery: '',
    filtering: false,
    initialized: false
  };

  function addSkipNavigation() {
    const main = $('.main');
    if (!main) return;
    main.id ||= 'main-content';
    main.setAttribute('role', 'main');
    main.setAttribute('tabindex', '-1');
    if (!$('.bcs-skip-link')) {
      document.body.insertAdjacentHTML('afterbegin', '<a class="bcs-skip-link" href="#main-content">Skip to main content</a>');
    }
  }

  function enhanceBrand() {
    const brand = $('.brand');
    if (!brand || $('.bcs-brand-spectrum')) return;
    brand.insertAdjacentHTML('afterend', '<div class="bcs-brand-spectrum" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>');
    brand.setAttribute('aria-label', 'BCS ONE');
  }

  function addEmployeeJourney() {
    const homeHero = $('#view-home .ux-home-hero');
    if (!homeHero || $('.bcs-journey')) return false;
    homeHero.insertAdjacentHTML('afterend', `
      <section class="bcs-journey" aria-labelledby="bcs-journey-title">
        <div class="bcs-journey-head"><div><strong id="bcs-journey-title">One employee journey · specialist capabilities</strong></div><span>BCS ONE coordinates the journey without replacing the systems of record.</span></div>
        <div class="bcs-journey-track" aria-label="Employee journey stages">
          <div class="bcs-journey-stage">Recruitment</div>
          <div class="bcs-journey-stage">Onboarding</div>
          <div class="bcs-journey-stage">HR Operations</div>
          <div class="bcs-journey-stage">Payroll</div>
          <div class="bcs-journey-stage">Learning & growth</div>
          <div class="bcs-journey-stage">Benefits & wellbeing</div>
          <div class="bcs-journey-stage">Engagement & offboarding</div>
        </div>
      </section>`);
    return true;
  }

  function normalizeLandmarks() {
    const sidebar = $('.sidebar');
    if (sidebar) sidebar.setAttribute('aria-label', 'BCS ONE application navigation');
    const nav = $('.nav');
    if (nav) nav.setAttribute('aria-label', 'Primary navigation');
    const topbar = $('.topbar');
    if (topbar) topbar.setAttribute('role', 'banner');
    const status = $('#run-status');
    if (status) {
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
    }
    const error = $('#workflow-error');
    if (error) {
      error.setAttribute('role', 'alert');
      error.setAttribute('aria-live', 'assertive');
      error.setAttribute('aria-atomic', 'true');
    }
  }

  function syncNavigationA11y() {
    $$('.nav-item').forEach(item => {
      const active = item.classList.contains('active');
      if (active) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function watchNavigation() {
    const nav = $('.nav');
    if (!nav || nav.dataset.bcsEuObserved) return;
    nav.dataset.bcsEuObserved = 'true';
    new MutationObserver(syncNavigationA11y).observe(nav, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    syncNavigationA11y();
  }

  function addScenarioToolbar() {
    const grid = $('#scenario-grid');
    if (!grid || $('.bcs-scenario-toolbar')) return false;
    grid.insertAdjacentHTML('beforebegin', `
      <div class="bcs-scenario-toolbar" role="search" aria-label="Filter business scenarios">
        <input id="bcs-scenario-search" class="bcs-scenario-search" type="search" autocomplete="off" placeholder="Find a scenario, product or business outcome" aria-label="Search scenarios" />
        <div class="bcs-scenario-filters" role="group" aria-label="Scenario type">
          <button class="bcs-filter-chip active" type="button" data-bcs-filter="all" aria-pressed="true">All</button>
          <button class="bcs-filter-chip" type="button" data-bcs-filter="single" aria-pressed="false">Single MCP</button>
          <button class="bcs-filter-chip" type="button" data-bcs-filter="multi" aria-pressed="false">Multi-MCP</button>
        </div>
      </div>`);

    const noResults = document.createElement('div');
    noResults.className = 'bcs-no-results';
    noResults.setAttribute('role', 'status');
    noResults.hidden = true;
    noResults.textContent = 'No scenarios match this filter. Try another term or choose All.';
    grid.appendChild(noResults);

    $('#bcs-scenario-search')?.addEventListener('input', event => {
      state.scenarioQuery = String(event.target.value || '').trim().toLowerCase();
      applyScenarioFilter();
    });
    $$('.bcs-filter-chip').forEach(button => button.addEventListener('click', () => {
      state.scenarioMode = button.dataset.bcsFilter || 'all';
      $$('.bcs-filter-chip').forEach(item => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
      applyScenarioFilter();
    }));

    const observer = new MutationObserver(mutations => {
      const cardMutation = mutations.some(mutation => [...mutation.addedNodes, ...mutation.removedNodes].some(node => node.nodeType === 1 && (node.matches?.('.scenario-card') || node.querySelector?.('.scenario-card'))));
      if (cardMutation && !state.filtering) applyScenarioFilter();
    });
    observer.observe(grid, { childList: true, subtree: true });
    applyScenarioFilter();
    return true;
  }

  function applyScenarioFilter() {
    const grid = $('#scenario-grid');
    if (!grid || state.filtering) return;
    state.filtering = true;
    const cards = [...grid.querySelectorAll('.scenario-card')];
    let visible = 0;
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const mode = card.querySelector('.scenario-mode')?.textContent?.toLowerCase() || '';
      const queryMatch = !state.scenarioQuery || text.includes(state.scenarioQuery);
      const modeMatch = state.scenarioMode === 'all' || (state.scenarioMode === 'single' ? mode.includes('1 mcp') : !mode.includes('1 mcp'));
      const show = queryMatch && modeMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });
    const noResults = grid.querySelector('.bcs-no-results');
    if (noResults) noResults.hidden = !(cards.length && visible === 0);
    state.filtering = false;
  }

  function setupModalAccessibility() {
    const backdrop = $('#ux-modal-backdrop');
    const modal = backdrop?.querySelector('.ux-modal');
    const appShell = $('.app-shell');
    if (!backdrop || !modal || backdrop.dataset.bcsEuObserved) return false;
    backdrop.dataset.bcsEuObserved = 'true';
    const body = $('#ux-modal-body');
    if (body) {
      body.id ||= 'ux-modal-body';
      modal.setAttribute('aria-describedby', body.id);
    }

    let wasOpen = backdrop.classList.contains('open');
    let returnFocus = null;
    const sync = () => {
      const open = backdrop.classList.contains('open');
      if (open && !wasOpen) returnFocus = document.activeElement;
      if (appShell && 'inert' in appShell) appShell.inert = open;
      if (open) modal.setAttribute('tabindex', '-1');
      if (!open && wasOpen && returnFocus instanceof HTMLElement) {
        const target = returnFocus;
        window.setTimeout(() => target.isConnected && target.focus(), 0);
      }
      wasOpen = open;
    };
    new MutationObserver(sync).observe(backdrop, { attributes: true, attributeFilter: ['class'] });
    sync();

    backdrop.addEventListener('keydown', event => {
      if (event.key !== 'Tab' || !backdrop.classList.contains('open')) return;
      const focusable = [...modal.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
        .filter(node => !node.hidden && node.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    return true;
  }

  function setupToastAccessibility() {
    const region = $('#ux-toast-region');
    if (!region || region.dataset.bcsEuObserved) return false;
    region.dataset.bcsEuObserved = 'true';
    region.setAttribute('aria-relevant', 'additions text');
    const decorate = () => {
      region.querySelectorAll('.ux-toast').forEach(toast => {
        toast.setAttribute('role', toast.classList.contains('error') ? 'alert' : 'status');
        toast.setAttribute('aria-atomic', 'true');
      });
    };
    new MutationObserver(decorate).observe(region, { childList: true, subtree: true });
    decorate();
    return true;
  }

  function setupSubnavKeyboard() {
    $$('.ux-subnav').forEach(nav => {
      if (nav.dataset.bcsEuKeyboard) return;
      nav.dataset.bcsEuKeyboard = 'true';
      nav.setAttribute('role', 'tablist');
      const sync = () => {
        const buttons = [...nav.querySelectorAll('button')];
        const hasActive = buttons.some(item => item.classList.contains('active'));
        buttons.forEach((button, index) => {
          const active = button.classList.contains('active');
          button.setAttribute('role', 'tab');
          button.setAttribute('aria-selected', String(active));
          button.tabIndex = active || (!hasActive && index === 0) ? 0 : -1;
        });
      };
      nav.addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const buttons = [...nav.querySelectorAll('button')];
        const current = Math.max(0, buttons.indexOf(document.activeElement));
        let next = current;
        if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
        if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = buttons.length - 1;
        event.preventDefault();
        buttons[next]?.focus();
        buttons[next]?.click();
      });
      new MutationObserver(sync).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
      sync();
    });
  }

  function watchRunBusyState() {
    const status = $('#run-status');
    const view = $('#view-scenarios');
    if (!status || !view || status.dataset.bcsEuBusy) return;
    status.dataset.bcsEuBusy = 'true';
    const sync = () => {
      const value = status.textContent.trim().toUpperCase();
      const busy = value.includes('RUN') || value.includes('START') || value.includes('EXECUT');
      view.setAttribute('aria-busy', String(busy));
    };
    new MutationObserver(sync).observe(status, { childList: true, subtree: true, characterData: true });
    sync();
  }

  function improveLabels() {
    const run = $('#run-scenario');
    if (run) run.setAttribute('aria-describedby', 'selected-scenario-value');
    const toolSearch = $('#tool-search');
    if (toolSearch) toolSearch.setAttribute('aria-label', 'Search MCP capabilities');
    const employee = $('#employee-id');
    if (employee) employee.setAttribute('aria-describedby', 'selected-scenario-value');
    $$('.ux-click-detail').forEach(node => {
      if (node.matches('tr')) {
        node.setAttribute('tabindex', '0');
        node.setAttribute('role', 'button');
        node.setAttribute('aria-label', `Open details for ${node.innerText.trim().replace(/\s+/g, ' ')}`);
      }
    });
  }

  function enableKeyboardDetailActivation() {
    const cto = $('#view-cto-dashboard');
    if (!cto || cto.dataset.bcsEuKeyDetails) return;
    cto.dataset.bcsEuKeyDetails = 'true';
    cto.addEventListener('keydown', event => {
      if (!['Enter',' '].includes(event.key)) return;
      const target = event.target.closest('.ux-click-detail');
      if (!target) return;
      event.preventDefault();
      target.click();
    });
  }

  function setDocumentMetadata() {
    document.title = 'BCS ONE | Governed AI across the employee journey';
    document.documentElement.lang = 'en';
  }

  function init() {
    if (state.initialized) return;
    state.initialized = true;
    setDocumentMetadata();
    addSkipNavigation();
    enhanceBrand();
    normalizeLandmarks();
    watchNavigation();
    watchRunBusyState();

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      addEmployeeJourney();
      addScenarioToolbar();
      setupModalAccessibility();
      setupToastAccessibility();
      setupSubnavKeyboard();
      improveLabels();
      enableKeyboardDetailActivation();
      syncNavigationA11y();
      if (attempts > 80) window.clearInterval(timer);
    }, 120);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();

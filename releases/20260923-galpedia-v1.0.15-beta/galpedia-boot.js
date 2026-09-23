import {installSiteShell} from './lib/site-shell.js';
import { createWorkspaceSession } from './lib/workspace-session.js';
// Small home shell: the data workspace is loaded only for a route or a search.
import { createActionIcon } from './lib/action-icons.js';
import { createCommandSearch } from './lib/galpedia-command-search.js';
import { setListState } from './lib/list-state.js';

const root = document.documentElement;
const home = document.querySelector('#galpedia-home');
const status = document.querySelector('#galpedia-load-status');
const workspace = document.querySelector('#workspace');
const dialog = document.querySelector('#galpedia-search-dialog');
const themeButton = document.querySelector('#theme-toggle');
// Keep the immutable shell markup backward-compatible: a future release can
// add these spans explicitly, while a candidate boot can also create them in
// the existing status node without changing the loading contract.
const statusText = status?.querySelector('#galpedia-load-status-text') ?? document.createElement('span');
const loadIndicator = status?.querySelector('#galpedia-load-indicator') ?? document.createElement('span');
if (status) {
  loadIndicator.id = 'galpedia-load-indicator';
  loadIndicator.setAttribute('aria-hidden', 'true');
  statusText.id = 'galpedia-load-status-text';
  statusText.classList.add('visually-hidden');
  statusText.setAttribute('role', 'status');
  statusText.setAttribute('aria-live', 'polite');
  statusText.setAttribute('aria-atomic', 'true');
  if (!loadIndicator.parentElement) status.append(loadIndicator);
  if (!statusText.parentElement) status.append(statusText);
  status.removeAttribute('role');
}
document.querySelector('#global-search-open').replaceChildren(createActionIcon(document, 'search'));
document.querySelector('#site-info-button svg').replaceWith(createActionIcon(document, 'book'));
const themeKey = 'egs-tier-terminal:theme-v1';
let runtimePromise;
let runtimeReady = false;
let runtimeFailed = false;
let landing;
let personLanding;
const STATIC_SITE_MODE = true;
function finishLanding() {
  landing?.dispose();landing=null;personLanding?.dispose();personLanding=null;
}
let directoryController;
const routeSession = createWorkspaceSession();
const helpSession = createWorkspaceSession();
const focusSession = createWorkspaceSession();
let lastWorkspaceRoute = '#works';
const dialRevealDelay = 160;
let statusRevealTimer = null;
let runtimeLoading = null;
function prepareLoadingRegion() {
  const route = '#' + location.hash.slice(1).split(/[/?]/)[0];
  const id = route === '#persons' ? 'person-view'
    : route === '#companies' ? 'company-view'
      : route === '#ranking' ? 'ranking-view' : 'selection-view';
  const active = document.getElementById(id);
  if (!active) return;
  document.querySelectorAll('#workspace > section').forEach(section => { section.hidden = section !== active; });
  active.hidden = false;
  for (const [buttonId, hash] of Object.entries(routes)) {
    const button = document.getElementById(buttonId), selected = hash === route;
    button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
  }
}
function placeLoadingStatus() {
  const route = '#' + location.hash.slice(1).split(/[/?]/)[0];
  const target = route === '#persons'
    ? document.querySelector('#person-directory-panel')
    : route === '#companies'
      ? document.querySelector('#company-directory-layout, .company-directory-layout')
      : route === '#ranking'
        ? document.querySelector('#ranking-view')
        : document.querySelector('#catalog-results');
  if (target && status.parentElement !== target) {
    const toolbar=target.querySelector(':scope > .results-toolbar');
    if(toolbar)toolbar.after(status);else target.prepend(status);
  }
  status.dataset.loadRegion = route.slice(1) || 'works';
}
function createRuntimeLoading() {
  if (!runtimeLoading && globalThis.GalpediaDial && loadIndicator) {
    setListState({status:loadIndicator,state:'ready'});
    loadIndicator.classList.add('gp-guide-state','gp-loading-view--panel');
    loadIndicator.dataset.layout='panel';
    loadIndicator.removeAttribute('role');loadIndicator.setAttribute('aria-hidden','true');
    runtimeLoading = globalThis.GalpediaDial.createLoadingController({
      host: loadIndicator,
      region: workspace,
      announcer: statusText,
      variant: 'standard',
      size: 104,
      theme: 'inherit',
      delay: 160,
      slowAfter: 8000,
      stacked: true,
      eyebrow: '庭守提示',
      detail: '资料正在加载，完成后会自动显示。',
      slowLabel: '资料仍在加载，请再等一会儿。'
    });
  }
  return runtimeLoading;
}
function pageLoadingTitle() {
  if(location.hash.startsWith('#ranking'))return '正在加载排榜页面';
  if(location.hash.startsWith('#persons'))return '正在加载人物库';
  if(location.hash.startsWith('#companies'))return '正在加载会社库';
  return '正在加载作品库';
}
function showLoadingError(message, error) {
  runtimeTicket?.fail(message);runtimeTicket=null;runtimeLoading=null;
  statusText.textContent='';statusText.classList.add('visually-hidden');
  loadIndicator.removeAttribute('aria-hidden');loadIndicator.setAttribute('role','status');
  setListState({status:loadIndicator,state:'error',layout:'panel',message,
    detail:'资料暂时没有加载成功，可以再试一次。',retryAt:error?.retryAt,
    retry:()=>{if(runtimeFailed){location.reload();return;}void ensureRoute().catch(()=>{});}});
}
let runtimeTicket = null;
const nav = document.querySelector('#workspace-mode');
const routes = { 'mode-selection': '#works', 'mode-company': '#companies', 'mode-person': '#persons', 'mode-ranking': '#ranking' };
// Paint the existing navigation icons before the data runtime is needed.
for (const [id, iconName] of [['mode-selection', 'library'], ['mode-company', 'building'], ['mode-person', 'person'], ['mode-ranking', 'ranking']]) {
  const button = document.getElementById(id);
  const label = document.createElement('span');
  label.textContent = button.textContent.trim();
  const icon = createActionIcon(document, iconName);
  icon.classList.add('workspace-tab-icon');
  button.replaceChildren(icon, label);
}

function isHome() { return !location.hash || location.hash === '#home'; }
function syncHome() {
  if (focusSession.inspect().key !== location.hash) focusSession.suspend();
  helpSession.suspend();
  const active = isHome();
  root.dataset.home = String(active);
  home.hidden = !active;
  if (active) {
    for (const image of home.querySelectorAll('img[data-home-src]')) {
      image.src = image.dataset.homeSrc;
      delete image.dataset.homeSrc;
    }
  }
  document.querySelector('#workspace').inert = active;
  if (active) {
    routeSession.suspend();
    directoryController?.suspend();
    runtimeTicket?.finish(); runtimeTicket = null;
    clearTimeout(statusRevealTimer); status.hidden = true;
    for (const button of nav.querySelectorAll('button')) { button.setAttribute('aria-selected', 'false'); button.tabIndex = 0; }
  }
  document.title = active ? '少女箱庭 GALPEDIA · 美少女游戏资料库' : 'GALPEDIA · 作品、会社与人物';
}
function paintTheme() {
  const light = root.dataset.theme !== 'dark';
  themeButton.replaceChildren(createActionIcon(document, light ? 'moon' : 'sun'));
  themeButton.setAttribute('aria-label', light ? '切换到暗色界面' : '切换到亮色界面');
  themeButton.title = themeButton.getAttribute('aria-label');
  themeButton.setAttribute('aria-pressed', String(light));
}
themeButton.addEventListener('click', event => {
  event.stopImmediatePropagation();
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(themeKey, root.dataset.theme); } catch { /* Session-only theme still works. */ }
  paintTheme();
}, true);
paintTheme();

async function ensureRuntime() {
  if (!runtimePromise) {
    routeSession.suspend();
    directoryController?.dispose(); directoryController = null;
    prepareLoadingRegion();
    placeLoadingStatus();
    if (!createRuntimeLoading() && statusText) statusText.textContent = pageLoadingTitle();
    // On a full-wiki person deep link, start the hash-pinned person directory
    // byte request before main.js begins its module/runtime cascade.  The
    // transport is imported dynamically here and statically by the directory
    // loader using the same URL, so both callers share one request and bytes.
    if (root.dataset.personDirectory === 'full-wiki' && /^#persons(?:[/?]|$)/u.test(location.hash)) {
      void import('./lib/person-first-page.js').then(module=>{
        if(runtimeReady||runtimeFailed)return;
        personLanding=module.createPersonFirstPage({isReady:()=>runtimeReady||runtimeFailed,navigate,onVisible:()=>{
          clearTimeout(statusRevealTimer);runtimeTicket?.finish();runtimeTicket=null;status.hidden=true;
        }});
        return personLanding.show();
      }).catch(()=>{});
      void import('./lib/person-index-transport.js')
        .then(module => module.prefetchPersonDirectoryIndex())
        .catch(() => {});
    }
    const mainReady = import('./main.js?v=20260911b');
    mainReady.catch(()=>{});
    void import('./lib/workbench-landing.js').then(module=>{
      if(runtimeReady||runtimeFailed)return;
      landing=module.createWorkbenchLanding({isReady:()=>runtimeReady||runtimeFailed,navigate,onVisible:()=>{
        clearTimeout(statusRevealTimer);runtimeTicket?.finish();runtimeTicket=null;status.hidden=true;
      }});
      return landing.show();
    }).catch(()=>{});
    const dialReady = globalThis.GalpediaDial
      ? Promise.resolve()
      : import('./lib/chronicle-dial.js').catch(() => null);
    runtimePromise = dialReady.then(() => {
      createRuntimeLoading();
      if (runtimeLoading && !isHome()) {
        status.hidden = true;
        runtimeTicket = runtimeLoading.begin(pageLoadingTitle());
        clearTimeout(statusRevealTimer);
        statusRevealTimer = setTimeout(() => {
          statusRevealTimer = null;
          if (!isHome() && runtimeTicket && runtimeLoading.isActive && !root.dataset.workbenchPreview && !root.dataset.personPreview) status.hidden = false;
        }, dialRevealDelay);
      } else if (!isHome() && statusText) {
        status.hidden = false;
        statusText.classList.remove('visually-hidden');
        statusText.textContent = pageLoadingTitle();
      }
      return mainReady;
    }).then(module => module.ready).then(api => {
      if (!api) throw new Error('runtime unavailable');
      runtimeReady = true;
      root.dataset.workbenchReady='true';
      finishLanding();
      const finish = () => {
        clearTimeout(statusRevealTimer);
        statusRevealTimer = null;
        runtimeTicket?.finish();
        runtimeTicket = null;
        status.hidden = true;
      };
      finish();
      paintTheme();
      syncHome();
      return api;
    }).catch(error => {
      runtimeFailed=true;
      finishLanding();
      clearTimeout(statusRevealTimer);
      statusRevealTimer = null;
      status.hidden = isHome();
      showLoadingError('这次没能打开资料库',error);
      throw error;
    });
  }
  return runtimePromise;
}

async function ensureRoute() {
  if (isHome()) return;
  prepareLoadingRegion(); placeLoadingStatus();
  if (runtimePromise) { runtimeTicket?.update(pageLoadingTitle()); return ensureRuntime(); }
  const hash = location.hash;
  // The full catalog's person identities and relation projection live in the
  // shared runtime. Do not show the smaller legacy directory on a cold visit.
  if (!STATIC_SITE_MODE && root.dataset.personDirectory === 'full-wiki' && /^#persons\/person(?:[/?]|$)/u.test(hash)) return ensureRuntime();
  // Detail/editing routes still use the existing complete workbench. Directory
  // browsing is independent and never imports that workbench speculatively.
  if (!/^#companies(?:[/?]|$)/u.test(hash) && !/^#persons(?:[/?]|$)/u.test(hash)) return ensureRuntime();
  const request = routeSession.begin(hash);
  if (createRuntimeLoading()) {
    status.hidden = false;
    runtimeTicket = runtimeLoading.begin(pageLoadingTitle());
  } else { status.hidden = false; statusText.classList.remove('visually-hidden'); statusText.textContent = pageLoadingTitle(); }
  try {
    const { createDirectoryWorkspaces } = await import('./lib/directory-workspaces.js');
    if (!request.isCurrent() || runtimePromise) return;
    directoryController ??= createDirectoryWorkspaces({ navigate, activateFull: ensureRuntime, staticPersons: STATIC_SITE_MODE });
    await directoryController.show(hash);
    if (!request.isCurrent() || runtimePromise) return;
    request.complete();
    runtimeTicket?.finish(); runtimeTicket = null; status.hidden = true;
  } catch (error) {
    if (!request.isCurrent() || runtimePromise) return;
    request.fail(error);
    showLoadingError('这次没能打开这个栏目',error);status.hidden = false;
    console.warn('directory workspace load failed', error);
  }
}
function navigate(route) {
  if (!isHome() && route === '#home') lastWorkspaceRoute = location.hash;
  dialog.close();
  if (location.hash === route) {
    syncHome();
    if (route !== '#home') void ensureRoute().catch(() => {});
    return;
  }
  location.hash = route;
  syncHome();
}
nav.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || !routes[button.id]) return;
  // Home links use the same hash contract as existing deep links.
  if (isHome() || !runtimeReady) {
    event.stopImmediatePropagation();
    navigate(button.id === 'mode-selection' && lastWorkspaceRoute.startsWith('#works') ? lastWorkspaceRoute : routes[button.id]);
  }
}, true);
nav.addEventListener('keydown', event => {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  const tabs = [...nav.querySelectorAll('button')].filter(button => !button.disabled);
  const index = tabs.indexOf(event.target.closest('button'));
  if (index < 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next].focus();
  tabs[next].click();
}, true);
document.addEventListener('click', event => {
  const link = event.target.closest('.galpedia-logo, .home-portals a, .home-actions a');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const href = link.getAttribute('href');
  if (!href?.startsWith('#')) return;
  event.preventDefault();
  navigate(href === '#works' && lastWorkspaceRoute.startsWith('#works') ? lastWorkspaceRoute : href);
});
window.addEventListener('hashchange', () => {
  syncHome();
  if (!isHome()) void ensureRoute().catch(() => {});
});
window.addEventListener('popstate', () => { syncHome(); if (!isHome()) void ensureRoute().catch(() => {}); });

let handbook;
let handbookLoad;
let handbookAttempt = 0;
let clearHelpFeedback = () => {};

function loadHandbook() {
  if (!handbookLoad) {
    const retryUrl = new URL('./lib/galpedia-help.js', import.meta.url);
    if (handbookAttempt++) retryUrl.searchParams.set('retry', String(handbookAttempt));
    // A failed module fetch is cached by the browser. Retry the entry URL;
    // its relative dependencies keep their canonical, shared URLs.
    handbookLoad = (handbookAttempt === 1 ? import('./lib/galpedia-help.js') : import(retryUrl.href))
      .then(module => { handbook = module.createHelpDrawer(); return { handbook, context: module.currentHelpArticle }; })
      .catch(error => { handbookLoad = null; throw error; });
  }
  return handbookLoad;
}

const helpTargets = { 'mobile-help-button': 'works.mobile', 'ranking-help-button': 'tier.overview', 'ranking-coachmark-help': 'tier.overview', 'ranking-immersive-help': 'tier.live', 'company-help-button': 'companies.overview' };
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.id !== 'site-info-button' && !helpTargets[button.id] && !button.dataset.helpArticle) return;
  event.preventDefault(); event.stopImmediatePropagation();
  clearHelpFeedback();
  const token = helpSession.begin('handbook');
  const children = [...button.childNodes], label = button.getAttribute('aria-label'), title = button.getAttribute('title');
  const restore = () => {
    button.replaceChildren(...children); button.removeAttribute('aria-busy');
    for (const [name,value] of [['aria-label',label],['title',title]]) {
      if(value === null)button.removeAttribute(name);else button.setAttribute(name,value);
    }
  };
  clearHelpFeedback = restore;
  button.setAttribute('aria-busy','true'); button.title = '正在打开手册…';
  token.scope.add(restore);
  void loadHandbook().then(({ handbook, context }) => {
    if (!token.isCurrent()) return;
    restore();
    handbook.open(button.dataset.helpArticle || helpTargets[button.id] || context(), button);
    token.complete();
  }).catch(error => {
    if (!token.fail(error)) return;
    button.removeAttribute('aria-busy'); button.textContent = '重试';
    button.title = '手册没能打开，点击重试'; button.setAttribute('aria-label',button.title);
  });
}, true);
function focusDestination(route) {
  if (location.hash !== route) return;
  const ticket = focusSession.begin(route);
  let focusObserver;
  let focusTimeout;
  const selector = route.startsWith('#work/') ? '#work-details[open] h2' : route.startsWith('#persons/person/') ? '#person-detail-dialog[open] h2, #person-detail h2' : route.startsWith('#companies/company/') ? '#company-detail h2' : '#workspace > section:not([hidden]) h1, #workspace > section:not([hidden]) h2';
  const focus = () => {
    if (!ticket.isCurrent() || location.hash !== route) return false;
    const heading = [...document.querySelectorAll(selector)].find(node => node.getClientRects().length && !node.closest('[hidden], [inert]'));
    if (!heading) return false;
    heading.tabIndex = -1; heading.focus({ preventScroll: true }); focusObserver?.disconnect(); clearTimeout(focusTimeout); ticket.complete(); return true;
  };
  if (focus()) return;
  focusObserver = new MutationObserver(focus); focusObserver.observe(document.querySelector('#workspace'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  // Details dialogs live outside workspace.
  for (const node of document.querySelectorAll('dialog')) focusObserver.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  ticket.scope.add(() => { focusObserver.disconnect(); clearTimeout(focusTimeout); });
  focusTimeout = setTimeout(() => { focusObserver.disconnect(); }, 15000);
}
createCommandSearch({
  ensureRuntime,
  beforeOpen: () => { helpSession.suspend(); handbook?.close({ restore: false, immediate: true }); },
  navigate: route => { navigate(route); void ensureRuntime().then(() => focusDestination(route)).catch(() => {}); }
});
fetch(new URL('./brand/snapshot.json', import.meta.url)).then(response => { if (!response.ok) throw new Error('snapshot'); return response.json(); }).then(snapshot => {
  if (!['works','companies','persons'].every(key => Number.isSafeInteger(snapshot[key]) && snapshot[key] >= 0) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)) throw new Error('invalid snapshot');
  for (const element of document.querySelectorAll('[data-home-count]')) element.textContent = Number(snapshot[element.dataset.homeCount]).toLocaleString('en-US');
  document.querySelector('#home-snapshot').textContent = `${snapshot.dateLabel || '资料整理于'} ${snapshot.date}`;
  document.querySelector('.home-stats').title = '作品按合并版本后的条目统计；会社与人物按当前收录条目统计。';
}).catch(() => { document.querySelector('#home-snapshot').textContent = '收录统计暂不可用'; });
syncHome();
if (!isHome()) void ensureRoute().catch(() => {});

installSiteShell();

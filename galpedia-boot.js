// Small home shell: the data workspace is loaded only for a route or a search.
import { createActionIcon } from './lib/action-icons.js';
import { createCommandSearch } from './lib/galpedia-command-search.js';

const root = document.documentElement;
const home = document.querySelector('#galpedia-home');
const status = document.querySelector('#galpedia-load-status');
const dialog = document.querySelector('#galpedia-search-dialog');
const themeButton = document.querySelector('#theme-toggle');
const themeKey = 'egs-tier-terminal:theme-v1';
let runtimePromise;
let runtimeReady = false;
let lastWorkspaceRoute = '#works';
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
  const active = isHome();
  root.dataset.home = String(active);
  home.hidden = !active;
  document.querySelector('#workspace').inert = active;
  if (active) {
    for (const button of nav.querySelectorAll('button')) { button.setAttribute('aria-selected', 'false'); button.tabIndex = 0; }
  }
  document.title = active ? '少女箱庭 GALPEDIA · 美少女游戏资料库' : 'GALPEDIA · 作品、会社与人物';
}
function paintTheme() {
  const light = root.dataset.theme !== 'dark';
  themeButton.textContent = light ? '☾' : '☀';
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
    status.hidden = false;
    status.textContent = '正在准备资料库…';
    runtimePromise = import('./main.js').then(module => module.ready).then(api => {
      if (!api) throw new Error('runtime unavailable');
      runtimeReady = true;
      status.hidden = true;
      paintTheme();
      syncHome();
      return api;
    }).catch(error => {
      status.hidden = false;
      status.textContent = '资料库暂时未能加载，请刷新页面重试。';
      throw error;
    });
  }
  return runtimePromise;
}
function navigate(route) {
  if (!isHome() && route === '#home') lastWorkspaceRoute = location.hash;
  dialog.close();
  if (location.hash === route) {
    syncHome();
    if (route !== '#home') void ensureRuntime().catch(() => {});
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
  event.preventDefault();
  const href = link.getAttribute('href');
  navigate(href === '#works' && lastWorkspaceRoute.startsWith('#works') ? lastWorkspaceRoute : href);
});
window.addEventListener('hashchange', () => {
  syncHome();
  if (!isHome()) void ensureRuntime().catch(() => {});
});
window.addEventListener('popstate', syncHome);

let handbook;
let handbookLoad;
let helpRequest = 0;
const helpTargets = { 'mobile-help-button': 'works.mobile', 'ranking-help-button': 'tier.overview', 'ranking-coachmark-help': 'tier.overview', 'ranking-immersive-help': 'tier.live', 'company-help-button': 'companies.overview' };
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  if (button.id !== 'site-info-button' && !helpTargets[button.id] && !button.dataset.helpArticle) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const token = ++helpRequest;
  handbookLoad ??= import('./lib/galpedia-help.js').then(module => { handbook = module.createHelpDrawer(); return { handbook, context: module.currentHelpArticle }; }).catch(error => { handbookLoad = null; throw error; });
  void handbookLoad.then(({ handbook, context }) => {
    if (token !== helpRequest) return;
    document.querySelector('#ranking-coachmark').hidden = true;
    handbook.open(button.dataset.helpArticle || helpTargets[button.id] || context(), button);
  }).catch(() => { status.hidden = false; status.textContent = '手册暂时无法加载，请重试。'; });
}, true);
let focusObserver;
let focusTimeout;
function focusDestination(route) {
  focusObserver?.disconnect(); clearTimeout(focusTimeout);
  const selector = route.startsWith('#work/') ? '#work-details[open] h2' : route.startsWith('#persons/person/') ? '#person-detail-dialog[open] h2, #person-detail h2' : route.startsWith('#companies/company/') ? '#company-detail h2' : '#workspace > section:not([hidden]) h1, #workspace > section:not([hidden]) h2';
  const focus = () => {
    if (location.hash !== route) return false;
    const heading = [...document.querySelectorAll(selector)].find(node => node.getClientRects().length && !node.closest('[hidden], [inert]'));
    if (!heading) return false;
    heading.tabIndex = -1; heading.focus({ preventScroll: true }); focusObserver?.disconnect(); clearTimeout(focusTimeout); return true;
  };
  if (focus()) return;
  focusObserver = new MutationObserver(focus); focusObserver.observe(document.querySelector('#workspace'), { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
  // Details dialogs live outside workspace.
  for (const node of document.querySelectorAll('dialog')) focusObserver.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  focusTimeout = setTimeout(() => { focusObserver?.disconnect(); }, 15000);
}
createCommandSearch({
  ensureRuntime,
  beforeOpen: () => { helpRequest += 1; handbook?.close({ restore: false, immediate: true }); },
  navigate: route => { navigate(route); void ensureRuntime().then(() => focusDestination(route)).catch(() => {}); }
});
fetch(new URL('./brand/snapshot.json', import.meta.url)).then(response => { if (!response.ok) throw new Error('snapshot'); return response.json(); }).then(snapshot => {
  for (const element of document.querySelectorAll('[data-home-count]')) element.textContent = Number(snapshot[element.dataset.homeCount]).toLocaleString('en-US');
  document.querySelector('#home-snapshot').textContent = `${snapshot.date} 快照`;
}).catch(() => { document.querySelector('#home-snapshot').textContent = '收录统计暂不可用'; });
syncHome();
if (!isHome()) void ensureRuntime().catch(() => {});

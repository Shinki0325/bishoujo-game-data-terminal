// Small home shell: the data workspace is loaded only for a route or a search.
const root = document.documentElement;
const home = document.querySelector('#galpedia-home');
const status = document.querySelector('#galpedia-load-status');
const dialog = document.querySelector('#galpedia-search-dialog');
const searchInput = document.querySelector('#global-search-input');
const results = document.querySelector('#global-search-results');
const searchStatus = document.querySelector('#global-search-status');
const themeButton = document.querySelector('#theme-toggle');
const themeKey = 'egs-tier-terminal:theme-v1';
let runtimePromise;
let runtimeReady = false;
let requestId = 0;
let debounce;
let composing = false;
let returnFocus = null;
let lastWorkspaceRoute = '#works';
const nav = document.querySelector('#workspace-mode');
nav.append(document.querySelector('#mode-company'), document.querySelector('#mode-person'), document.querySelector('#mode-ranking'));
const routes = { 'mode-selection': '#works', 'mode-company': '#companies', 'mode-person': '#persons', 'mode-ranking': '#ranking' };

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
  const link = event.target.closest('.galpedia-logo, .home-portals a, .home-actions a, #global-search-results a');
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

function openSearch(query = '') {
  returnFocus = document.activeElement;
  if (!dialog.open) dialog.showModal();
  searchInput.value = query;
  searchInput.focus();
  void runSearch();
}
dialog.addEventListener('close', () => { requestId += 1; clearTimeout(debounce); returnFocus?.focus?.(); });
document.querySelector('#global-search-open').addEventListener('click', () => openSearch());
document.querySelector('#home-search-form').addEventListener('submit', event => {
  event.preventDefault();
  openSearch(document.querySelector('#home-search-input').value);
});
document.querySelector('#global-search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(debounce); void runSearch(); });
searchInput.addEventListener('compositionstart', () => { composing = true; clearTimeout(debounce); requestId += 1; });
searchInput.addEventListener('compositionend', () => { composing = false; clearTimeout(debounce); debounce = setTimeout(runSearch, 250); });
searchInput.addEventListener('input', () => { requestId += 1; clearTimeout(debounce); if (!composing) debounce = setTimeout(runSearch, 250); });
async function runSearch() {
  const query = searchInput.value.trim();
  const id = ++requestId;
  results.replaceChildren();
  if (!query) { searchStatus.textContent = '输入名称、别名或拼音，探索作品、会社与人物。'; return; }
  searchStatus.textContent = '正在检索作品、会社与人物…';
  try {
    const api = await ensureRuntime();
    const groups = await api.search(query);
    if (id !== requestId || !dialog.open) return;
    let count = 0;
    for (const [key, label, base, entity] of [['works','作品','#works','work'], ['companies','会社','#companies','company'], ['persons','人物','#persons','person']]) {
      const section = document.createElement('section');
      const title = document.createElement('h3'); title.textContent = label; section.append(title);
      for (const item of groups[key] ?? []) {
        count += 1;
        const link = document.createElement('a');
        link.href = key === 'works' ? `#work/${encodeURIComponent(item.id)}` : `${base}/${entity}/${encodeURIComponent(item.id)}`;
        link.textContent = item.name;
        const meta = document.createElement('small'); meta.textContent = item.subtitle || label; link.append(meta); section.append(link);
      }
      if (!(groups[key]?.length)) { const empty = document.createElement('p'); empty.textContent = '暂无匹配'; section.append(empty); }
      const all = document.createElement('a'); all.href = `${base}?query=${encodeURIComponent(query)}${key === 'companies' ? '&hasImage=0' : ''}`; all.className = 'search-all'; all.textContent = `查看全部${label} →`; section.append(all);
      results.append(section);
    }
    searchStatus.textContent = count ? `“${query}”的匹配结果 · 每类最多展示 5 项` : `没有找到“${query}”，可尝试其他名称或别名。`;
  } catch {
    if (id === requestId) searchStatus.textContent = '搜索资料暂时无法加载，请稍后重试。';
  }
}
document.querySelector('#site-info-button').addEventListener('click', event => {
  // Help works before the data workspace is loaded.
  if (!runtimePromise) {
    event.stopImmediatePropagation();
    document.querySelector('#site-welcome-title').textContent = '庭守手册';
    document.querySelector('#site-welcome-dialog').showModal();
  }
}, true);
document.querySelector('#site-welcome-start').addEventListener('click', () => document.querySelector('#site-welcome-dialog').close());
document.querySelector('#site-welcome-title').textContent = '庭守手册';
fetch('./brand/snapshot.json').then(response => { if (!response.ok) throw new Error('snapshot'); return response.json(); }).then(snapshot => {
  for (const element of document.querySelectorAll('[data-home-count]')) element.textContent = Number(snapshot[element.dataset.homeCount]).toLocaleString('en-US');
  document.querySelector('#home-snapshot').textContent = `${snapshot.date} 快照`;
}).catch(() => { document.querySelector('#home-snapshot').textContent = '收录统计暂不可用'; });
syncHome();
if (!isHome()) void ensureRuntime().catch(() => {});

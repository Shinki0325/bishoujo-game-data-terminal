// Keyboard and async state belong to the command surface, not the data index.
export function createCommandSearch({ ensureRuntime, navigate, beforeOpen = () => {} }) {
  const dialog = document.getElementById('galpedia-search-dialog');
  const input = document.getElementById('global-search-input');
  const results = document.getElementById('global-search-results');
  const status = document.getElementById('global-search-status');
  let request = 0;
  let debounce;
  let composing = false;
  let returnFocus;
  let navigating = false;
  let options = [];
  let active = -1;
  let loadedQuery = null;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', results.id);
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-describedby', 'global-search-status global-search-shortcuts');
  results.setAttribute('role', 'listbox'); results.setAttribute('aria-label', '全站搜索结果');
  const shortcuts = document.createElement('p'); shortcuts.id = 'global-search-shortcuts'; shortcuts.className = 'global-search-shortcuts';
  shortcuts.textContent = 'Ctrl / ⌘ K 搜索　↑ ↓ 选择　Enter 进入　Esc 关闭';
  dialog.append(shortcuts);

  function select(index) {
    active = index;
    options.forEach((option, i) => {
      option.setAttribute('aria-selected', String(i === index)); option.classList.toggle('search-active', i === index);
    });
    if (options[index]) {
      input.setAttribute('aria-activedescendant', options[index].id);
      options[index].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }
  function invalidate() {
    request += 1; clearTimeout(debounce); loadedQuery = null;
    select(-1); options = []; results.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
  }
  function enter(option) {
    if (!option || loadedQuery !== input.value.trim() || composing) return;
    navigating = true;
    dialog.close();
    navigate(option.getAttribute('href'));
  }
  async function run() {
    if (composing || !dialog.open) return;
    const query = input.value.trim();
    invalidate();
    const token = request;
    if (!query) { status.textContent = '输入名称、别名或拼音，探索作品、会社与人物。'; return; }
    status.textContent = '正在检索作品、会社与人物…';
    try {
      const api = await ensureRuntime();
      const groups = await api.search(query);
      if (token !== request || !dialog.open || input.value.trim() !== query) return;
      let count = 0;
      function appendOption(section, name, href, item = null) {
        const link = document.createElement('a'); link.href = href; link.textContent = name;
        link.id = `command-result-${options.length}`; link.setAttribute('role', 'option'); link.tabIndex = -1;
        link.setAttribute('aria-selected', 'false');
        if (item?.subtitle) { const meta = document.createElement('small'); meta.textContent = item.subtitle; link.append(meta); }
        if (item?.match?.label) { const hint = document.createElement('small'); hint.className = 'search-match'; hint.textContent = item.match.label; link.append(hint); }
        if (!item) link.className = 'search-all';
        link.addEventListener('click', event => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
          event.preventDefault(); enter(link);
        });
        link.addEventListener('pointermove', () => { if (active !== options.indexOf(link)) select(options.indexOf(link)); });
        options.push(link); section.append(link);
      }
      for (const [key, label, base, entity] of [['works', '作品', '#works', 'work'], ['companies', '会社', '#companies', 'company'], ['persons', '人物', '#persons', 'person']]) {
        const section = document.createElement('section'); section.setAttribute('role', 'group'); section.setAttribute('aria-label', label);
        const title = document.createElement('h3'); title.textContent = label; title.setAttribute('aria-hidden', 'true'); section.append(title);
        for (const item of groups[key] ?? []) {
          count += 1;
          appendOption(section, item.name, key === 'works' ? `#work/${encodeURIComponent(item.id)}` : `${base}/${entity}/${encodeURIComponent(item.id)}`, item);
        }
        if (!groups[key]?.length) { const empty = document.createElement('p'); empty.textContent = '暂无匹配'; empty.setAttribute('role', 'presentation'); section.append(empty); }
        appendOption(section, `查看全部${label} →`, `${base}?query=${encodeURIComponent(query)}${key === 'companies' ? '&hasImage=0' : ''}`);
        results.append(section);
      }
      loadedQuery = query;
      input.setAttribute('aria-expanded', 'true');
      // Empty groups still have explicit “view all” commands, but no fabricated
      // selected entity. The user can choose one deliberately with arrow keys.
      if (count) select(options.findIndex(option => !option.classList.contains('search-all')));
      status.textContent = count ? `“${query}”的匹配结果 · 每类最多展示 5 项` : `没有找到“${query}”，可尝试其他名称或别名。`;
    } catch {
      if (token === request && dialog.open) status.textContent = '搜索资料暂时无法加载，请稍后重试。';
    }
  }
  function open(query = '') {
    const otherModal = [...document.querySelectorAll('dialog:modal')].find(item => item !== dialog && item.id !== 'galpedia-help');
    const customModal = document.querySelector('[role="dialog"][aria-modal="true"][aria-hidden="false"]');
    if (otherModal || customModal) return;
    if (dialog.open) { input.focus(); return; }
    returnFocus = document.activeElement; navigating = false;
    beforeOpen(); dialog.showModal(); input.value = query; input.focus(); void run();
  }
  dialog.addEventListener('close', () => {
    invalidate(); composing = false;
    if (!navigating) {
      const target = returnFocus?.isConnected && returnFocus.getClientRects().length && !returnFocus.closest('[inert], [hidden]') ? returnFocus : document.getElementById('global-search-open');
      target?.focus({ preventScroll: true });
    }
    navigating = false;
  });
  // Capture before the runtime's Escape shortcuts; closing search must not also
  // close a candidate drawer or exit live ranking.
  document.addEventListener('keydown', event => {
    if (event.isComposing || composing) return;
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      const others = [...document.querySelectorAll('dialog:modal')].filter(item => item !== dialog && item.id !== 'galpedia-help');
      if (others.length || document.querySelector('[role="dialog"][aria-modal="true"][aria-hidden="false"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); open(); return;
    }
    if (!dialog.open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); dialog.close(); return; }
    if (event.target !== input) return;
    if (['ArrowDown', 'ArrowUp'].includes(event.key) && options.length) {
      event.preventDefault(); event.stopImmediatePropagation();
      select(active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (event.key === 'Enter' && options[active]) { event.preventDefault(); event.stopImmediatePropagation(); enter(options[active]); }
  }, true);
  document.getElementById('global-search-open').addEventListener('click', () => open());
  document.getElementById('home-search-form').addEventListener('submit', event => { event.preventDefault(); open(document.getElementById('home-search-input').value); });
  document.getElementById('global-search-form').addEventListener('submit', event => {
    event.preventDefault(); if (composing) return;
    if (options[active] && loadedQuery === input.value.trim()) enter(options[active]); else void run();
  });
  input.addEventListener('compositionstart', () => { composing = true; invalidate(); });
  input.addEventListener('compositionend', () => { composing = false; invalidate(); debounce = setTimeout(run, 200); });
  input.addEventListener('input', () => { invalidate(); status.textContent = input.value.trim() ? '正在检索…' : '输入名称、别名或拼音，探索作品、会社与人物。'; if (!composing) debounce = setTimeout(run, 200); });
  return { open };
}

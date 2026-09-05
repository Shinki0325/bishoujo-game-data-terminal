import { HELP_ARTICLES, getHelpArticle, searchHelpArticles } from './galpedia-help-content.js';
import { createKeeperGuideCard, setKeeperGuidePortrait } from './keeper-guide-card.js';
import { resolveKeeperPortrait } from './keeper-guide-assets.js';
import { createKeeperPreferences, resolveKeeperGuide } from './keeper-guide-runtime.js';
import { RUNTIME_FEATURES } from './runtime-config.js';

const categories = { home: '首页', works: '作品库', tier: '排榜', companies: '会社库', people: '人物库', data: '数据说明', about: '关于' };
const tabs = [['current', '当前页面'], ['tasks', '常见操作'], ['data', '数据说明'], ['about', '关于']];
const tasks = ['works.search', 'works.filters', 'works.selection', 'works.compare', 'tier.overview', 'tier.bangumi', 'tier.backup', 'tier.custom-images', 'tier.live'];

export function currentHelpArticle(hash = location.hash) {
  if (!hash || hash === '#home') return 'home.overview';
  if (hash.startsWith('#companies')) return 'companies.overview';
  if (hash.startsWith('#persons')) return 'people.overview';
  if (hash.startsWith('#ranking')) return 'tier.overview';
  return 'works.overview';
}

export function createHelpDrawer() {
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const button = (text, label, onClick) => {
    const element = node('button', '', text);
    element.type = 'button';
    if (label) element.setAttribute('aria-label', label);
    element.addEventListener('click', onClick);
    return element;
  };
  const flower = () => {
    const mark = node('img', 'help-flower');
    mark.src = new URL('../brand/logo-mark.png', import.meta.url).href;
    mark.alt = '';
    mark.width = 28; mark.height = 28;
    return mark;
  };
  const dialog = node('dialog', 'galpedia-help');
  dialog.id = 'galpedia-help';
  dialog.setAttribute('aria-labelledby', 'help-title');
  const head = node('header', 'help-head');
  const identity = node('div', 'help-identity');
  const titleBox = node('div');
  const title = node('h2', '', '庭守手册'); title.id = 'help-title'; title.tabIndex = -1;
  titleBox.append(title, node('p', 'help-eyebrow', 'GUIDE'));
  identity.append(flower(), titleBox);
  const closeButton = button('×', '关闭庭守手册', () => close());
  closeButton.className = 'icon-button';
  const heading = node('div', 'help-heading'); heading.append(identity, closeButton);
  const search = node('input'); search.type = 'search'; search.id = 'help-search'; search.placeholder = '搜索手册内容…';
  search.setAttribute('aria-label', '搜索手册内容'); search.autocomplete = 'off'; search.maxLength = 120;
  const searchStatus = node('p', 'visually-hidden'); searchStatus.setAttribute('role', 'status');
  const tabBar = node('div', 'help-tabs'); tabBar.setAttribute('role', 'tablist'); tabBar.setAttribute('aria-label', '手册栏目');
  const content = node('div', 'help-content'); content.id = 'help-content'; content.setAttribute('role', 'tabpanel'); content.tabIndex = -1;
  head.append(heading, search, tabBar, searchStatus); dialog.append(head, content); document.body.append(dialog);
  let state = { tab: 'current', article: currentHelpArticle(), query: '' };
  let trail = [];
  let trigger = null;
  let parentModal = null;
  let closeTimer = null;
  let lockedOverflow = null;
  const mobile = matchMedia('(max-width: 760px)');
  let composing = false;
  const keeperPreferencesStore = createKeeperPreferences();

  function pushArticle(id) {
    trail.push({ ...state, scroll: content.scrollTop });
    state = { ...state, article: id, query: '' };
    search.value = '';
    render();
    content.querySelector('h3')?.focus({ preventScroll: true });
  }
  for (const [id, label] of tabs) {
    const tab = button(label, null, () => {
      trail = []; state = { tab: id, article: id === 'current' ? currentHelpArticle() : null, query: '' };
      search.value = ''; render();
    });
    tab.id = `help-tab-${id}`; tab.dataset.tab = id; tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', 'help-content');
    tabBar.append(tab);
  }
  tabBar.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...tabBar.children]; const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    event.preventDefault(); event.stopPropagation();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  });
  function articleLink(article) {
    const link = button('', null, () => pushArticle(article.id)); link.className = 'help-article-link';
    link.append(node('small', '', categories[article.category] || '手册'), node('strong', '', article.title), node('span', '', article.summary));
    return link;
  }
  function paragraphs(texts, parent = content) {
    for (const text of texts ?? []) parent.append(node('p', '', text));
  }
  function keeperPreferences() { return keeperPreferencesStore.get(); }
  function renderKeeperOverviewGuide(article) {
    if (RUNTIME_FEATURES.keeperGuide?.enabled === false) return;
    if (!article.id.endsWith('.overview') || article.id === 'home.overview') return;
    const resolved = resolveKeeperGuide({
      id: 'helpOverview', ready: true, restored: true, helpArticleId: article.id
    }, keeperPreferences());
    if (!resolved?.showEnhancement) return;
    const guide = createKeeperGuideCard({
      documentRef: document,
      guideId: resolved.id,
      domGuideId: 'help.overview',
      eyebrow: '庭守提示',
      title: resolved.title,
      body: article.summary,
      dismissLabel: '隐藏提示',
      onDismiss: () => {
        keeperPreferencesStore.dismiss(resolved.id, resolved.contentVersion);
        render();
        window.setTimeout(() => content.querySelector('h3')?.focus({ preventScroll: true }), 0);
      },
      portrait: resolveKeeperPortrait(resolved, { enabled: RUNTIME_FEATURES.keeperGuide?.portraits === true })
    });
    guide.classList.add('keeper-guide-card-handbook');
    guide.querySelector('.keeper-guide-card-body').classList.add('help-summary');
    content.append(guide);
    return true;
  }
  function renderKeeperPreferences() {
    const details = node('details', 'help-preferences');
    const summary = node('summary', '', '角色与引导');
    details.append(summary);
    const intro = node('p', 'help-preferences-intro', '只影响提示增强，不改变作品、排榜或首页主视觉。');
    details.append(intro);
    const preferences = keeperPreferences();
    const illustrationLabel = node('label', 'help-preference-row');
    const illustration = node('input'); illustration.type = 'checkbox'; illustration.checked = preferences.illustrations;
    illustration.id = 'keeper-preference-illustrations';
    illustrationLabel.append(illustration, node('span', '', '显示引导角色插画'));
    const tipsLabel = node('label', 'help-preference-row');
    const tips = node('input'); tips.type = 'checkbox'; tips.checked = preferences.autoTips;
    tips.id = 'keeper-preference-auto-tips';
    tipsLabel.append(tips, node('span', '', '显示当前页面的主动提示'));
    const restore = node('button', 'toolbar-button toolbar-button-neutral help-preferences-restore', '恢复提示');
    restore.type = 'button';
    const notify = () => {
      const next = { illustrations: illustration.checked, autoTips: tips.checked };
      keeperPreferencesStore.setPreference('illustrations', next.illustrations);
      keeperPreferencesStore.setPreference('autoTips', next.autoTips);
      const guide = content.querySelector('.keeper-guide-card-handbook');
      if (guide) {
        const resolved = resolveKeeperGuide({ id: 'helpOverview', ready: true, restored: true }, keeperPreferences());
        setKeeperGuidePortrait(guide, resolveKeeperPortrait(resolved, { enabled: RUNTIME_FEATURES.keeperGuide?.portraits === true }));
      }
    };
    illustration.addEventListener('change', notify); tips.addEventListener('change', notify);
    restore.addEventListener('click', () => {
      keeperPreferencesStore.reset();
      render();
      window.setTimeout(() => content.querySelector('h3')?.focus({ preventScroll: true }), 0);
    });
    details.append(illustrationLabel, tipsLabel, restore);
    content.append(details);
  }
  function render() {
    content.replaceChildren(); content.scrollTop = 0;
    for (const tab of tabBar.children) {
      const selected = tab.dataset.tab === state.tab;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    }
    content.setAttribute('aria-labelledby', `help-tab-${state.tab}`);
    if (state.query) {
      const articles = searchHelpArticles(state.query);
      searchStatus.textContent = `找到 ${articles.length} 篇帮助文章`;
      content.append(node('p', 'help-result-count', `“${state.query}” · ${articles.length} 篇说明`));
      if (!articles.length) content.append(node('p', '', '没有找到相关说明。可尝试“贴纸”“公式”或“Bangumi”。'));
      for (const article of articles) content.append(articleLink(article));
      return;
    }
    searchStatus.textContent = '';
    if (!state.article) {
      const ids = state.tab === 'tasks' ? tasks : HELP_ARTICLES.filter(article => article.category === state.tab).map(article => article.id);
      const heading = node('h3', '', tabs.find(([id]) => id === state.tab)[1]); heading.tabIndex = -1; content.append(heading);
      for (const id of ids) { const article = getHelpArticle(id); if (article) content.append(articleLink(article)); }
      return;
    }
    const article = getHelpArticle(state.article) || getHelpArticle(currentHelpArticle());
    if (!article) return;
    if (trail.length) {
      const back = button('← 返回', '返回上一页手册', () => {
        const previous = trail.pop(); state = previous; search.value = state.query; render(); content.scrollTop = previous.scroll;
        content.focus({ preventScroll: true });
      }); back.className = 'help-back'; content.append(back);
    }
    content.append(node('p', 'help-breadcrumb', `庭守手册 / ${categories[article.category] || '当前页面'}`));
    const heading = node('h3', '', article.title); heading.tabIndex = -1;
    content.append(heading);
    if (article.subtitle) content.append(node('p', 'help-eyebrow', article.subtitle));
    if (!renderKeeperOverviewGuide(article)) content.append(node('p', 'help-summary', article.summary));
    if (article.id === 'tier.overview' && location.hash.includes('subject=company')) paragraphs(['当前正在整理会社排榜。候选与分级操作相同，排榜对象为已选择的会社。']);
    if (article.id === 'about.shiori') {
      const portrait = node('img', 'help-shiori'); portrait.src = new URL('../brand/shiori.png', import.meta.url).href;
      portrait.alt = '庭守 綴木栞'; portrait.width = 120; portrait.height = 160; content.append(portrait);
    }
    if (article.steps?.length) {
      content.append(node('h4', '', article.id.endsWith('.overview') ? '快速开始' : '使用步骤'));
      const steps = node('ol', 'help-steps');
      for (const step of article.steps) steps.append(node('li', '', step));
      content.append(steps);
    }
    for (const section of article.sections ?? []) {
      content.append(node('h4', '', section.title)); paragraphs(section.paragraphs);
    }
    if (article.notes?.length) {
      content.append(node('h4', '', '注意'));
      const notes = node('ul', 'help-notes'); for (const note of article.notes) notes.append(node('li', '', note)); content.append(notes);
    }
    if (article.keeperTip) {
      const tip = node('aside', 'help-keeper-tip'); const label = node('div'); label.append(flower(), node('strong', '', '庭守提示'));
      tip.append(label, node('p', '', article.keeperTip)); content.append(tip);
    }
    if (article.related?.length) {
      content.append(node('h4', '', '相关内容'));
      for (const id of article.related) { const related = getHelpArticle(id); if (related) content.append(articleLink(related)); }
    }
    renderKeeperPreferences();
  }
  function searchChanged() {
    trail = []; state = { ...state, query: search.value.trim() }; render();
  }
  search.addEventListener('compositionstart', () => { composing = true; });
  search.addEventListener('compositionend', () => { composing = false; searchChanged(); });
  search.addEventListener('input', () => { if (!composing) searchChanged(); });
  function restoreFocus() {
    const target = trigger?.isConnected && trigger.getClientRects().length && !trigger.closest('[hidden], [inert]')
      ? trigger : document.querySelector('#workspace-mode [aria-selected="true"], .galpedia-logo');
    target?.focus({ preventScroll: true });
  }
  function unlock() {
    if (lockedOverflow !== null) { document.body.style.overflow = lockedOverflow; lockedOverflow = null; }
  }
  function close({ restore = true, immediate = false } = {}) {
    if (!dialog.open) return;
    if (closeTimer) {
      if (!immediate) return;
      clearTimeout(closeTimer); closeTimer = null;
    }
    const finish = () => {
      closeTimer = null; dialog.close(); dialog.classList.remove('is-closing'); unlock();
      if (restore) restoreFocus();
    };
    if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else { dialog.classList.add('is-closing'); closeTimer = setTimeout(finish, 130); }
  }
  function open(id = currentHelpArticle(), source = document.activeElement) {
    clearTimeout(closeTimer); closeTimer = null; dialog.classList.remove('is-closing');
    if (!dialog.contains(source)) trigger = source;
    // A business dialog may have opened from the still-interactive desktop
    // background since this handbook was shown. Promote the same surface.
    const otherModal = [...document.querySelectorAll('dialog:modal')].find(item => item !== dialog);
    if (dialog.open && !dialog.matches(':modal') && otherModal) dialog.close();
    if (!dialog.open) {
      parentModal = [...document.querySelectorAll('dialog:modal')].at(-1) || null;
      const customModal = document.querySelector('[role="dialog"][aria-modal="true"][aria-hidden="false"]');
      const modal = mobile.matches || !!parentModal || !!customModal;
      dialog.dataset.modal = String(modal);
      if (modal) {
        dialog.setAttribute('aria-modal', 'true');
        lockedOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
        dialog.showModal();
      } else { dialog.removeAttribute('aria-modal'); dialog.show(); }
    }
    if (!getHelpArticle(id)) id = currentHelpArticle();
    state = { tab: id.startsWith('data.') ? 'data' : id.startsWith('about.') ? 'about' : 'current', article: id, query: '' };
    trail = []; search.value = ''; render(); title.focus({ preventScroll: true });
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('keydown', event => {
    if (!dialog.open || event.key !== 'Escape' || event.isComposing) return;
    const topModal = [...document.querySelectorAll('dialog:modal')].at(-1);
    if (topModal && topModal !== dialog) return;
    event.preventDefault(); event.stopImmediatePropagation(); close();
  }, true);
  // A phone rotation/resizing must not leave a full-screen non-modal sheet.
  mobile.addEventListener('change', () => {
    if (!dialog.open) return;
    const saved = { state, trail, scroll: content.scrollTop, trigger };
    close({ restore: false, immediate: true }); open(saved.state.article || currentHelpArticle(), saved.trigger);
    state = saved.state; trail = saved.trail; search.value = state.query; render(); content.scrollTop = saved.scroll;
  });
  return { open, close, get isOpen() { return dialog.open; } };
}

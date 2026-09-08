import { applyTheme, readTheme, saveTheme } from '../lib/theme-preference.js';
import { createActionIcon } from '../lib/action-icons.js';
import { createViewLifetime } from '../lib/view-lifetime.js';

/** Theme, workspace labels and local search clear controls; owns their browser subscriptions. */
export function createWorkbenchChrome({ elements, documentRef = document, windowRef = window }) {
  const lifetime = createViewLifetime();
  const localSearchClears = [...documentRef.querySelectorAll('[data-clear-input]')].map(button => {
    const input = documentRef.getElementById(button.dataset.clearInput);
    const sync = () => { button.hidden = !input.value; };
    lifetime.listen(input, 'input', sync);
    lifetime.listen(button, 'click', () => {
      input.value = '';
      input.dispatchEvent(new windowRef.Event('input', { bubbles: true }));
      input.focus();
    });
    sync();
    return sync;
  });
  let themeStorage = null;
  try {
    themeStorage = windowRef.localStorage;
  } catch {
    // Private browsing or a blocked storage policy should not block startup.
  }
  let activeTheme = applyTheme(documentRef, documentRef.documentElement.classList.contains('galpedia')
    ? documentRef.documentElement.dataset.theme : readTheme(themeStorage));
  const renderThemeToggle = () => {
    const isLight = activeTheme === 'light';
    const nextThemeLabel = isLight ? '暗色' : '亮色';
    elements.themeToggle.replaceChildren(createActionIcon(documentRef, isLight ? 'moon' : 'sun'));
    elements.themeToggle.setAttribute('aria-label', `切换到${nextThemeLabel}界面`);
    elements.themeToggle.setAttribute('aria-pressed', String(isLight));
    elements.themeToggle.title = `切换到${nextThemeLabel}界面`;
  };
  renderThemeToggle();
  for (const [button, iconName, label] of [
    [elements.modeSelection, 'library', '作品库'],
    [elements.modeCompany, 'building', '会社库'],
    [elements.modeRanking, 'ranking', '排榜'],
    [elements.modePerson, 'person', '人物']
  ]) {
    const icon = createActionIcon(documentRef, iconName);
    icon.classList.add('workspace-tab-icon');
    const copy = documentRef.createElement('span');
    copy.textContent = label;
    button.replaceChildren(icon, copy);
  }
  lifetime.listen(elements.themeToggle, 'click', () => {
    activeTheme = saveTheme(themeStorage, activeTheme === 'dark' ? 'light' : 'dark');
    applyTheme(documentRef, activeTheme);
    renderThemeToggle();
  });
  return Object.freeze({ syncSearchClears: () => localSearchClears.forEach(sync => sync()), dispose: lifetime.dispose });
}

/** Preserve existing route and two-tab keyboard semantics without owning URL state. */
export function connectWorkbenchNavigation({ windowRef = window, tabs, isBusy, applyLocation }) {
  const lifetime = createViewLifetime();
  lifetime.listen(windowRef, 'popstate', () => { void applyLocation(); });
  lifetime.listen(windowRef, 'hashchange', () => { void applyLocation(); });
  for (const tab of tabs) lifetime.listen(tab, 'keydown', event => {
    if (isBusy() || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const target = tab === tabs[0] ? tabs[1] : tabs[0];
    target.click(); target.focus();
  });
  return lifetime;
}

import { DEFAULT_FILTER_STATE } from './state.js';

export const PREVIOUS_WORK_FILTER_KEY = 'egs-tier-terminal:previous-work-filter-v1';
export const isFreshWorkEntry = locationRef => /^#works\/?$/u.test(locationRef?.hash ?? '');
const copy = value => JSON.parse(JSON.stringify(value));
export function isDefaultWorkFilter(filter) {
  return Object.entries(DEFAULT_FILTER_STATE).every(([key,value]) =>
    JSON.stringify(filter?.[key]) === JSON.stringify(value));
}

// Browsing conditions are disposable; boards and selections are not. Only
// a plain library entry starts fresh. Shared searches, analysis returns and
// ranking routes retain their explicit route/state semantics.
export function createPreviousWorkFilters({controller,storage,locationRef}) {
  const initial = controller.inspectState();
  let previous = null;
  function validate(filter) {
    try { return controller.previewFilterState({...copy(DEFAULT_FILTER_STATE),...filter}); }
    catch { return null; }
  }
  try {
    const raw = storage?.getItem(PREVIOUS_WORK_FILTER_KEY);
    const saved = raw && raw.length <= 65536 ? JSON.parse(raw) : null;
    if (saved?.schema === 1 && saved.sampleId === initial.sampleId)
      previous = validate(saved.filterState);
  } catch { /* Optional history never blocks opening the library. */ }
  function remember(filter) {
    if (isDefaultWorkFilter(filter)) return;
    if (JSON.stringify(previous) === JSON.stringify(filter)) return;
    previous = copy(filter);
    try { storage?.setItem(PREVIOUS_WORK_FILTER_KEY, JSON.stringify({
      schema:1,sampleId:initial.sampleId,filterState:previous
    })); } catch { /* Keep the in-memory copy when storage is unavailable. */ }
  }
  remember(initial.filterState);
  if (isFreshWorkEntry(locationRef)) controller.clearFilters();
  return {
    remember,
    read: () => previous && !isDefaultWorkFilter(previous) ? copy(previous) : null,
    available: filter => !!previous && !isDefaultWorkFilter(previous) && isDefaultWorkFilter(filter)
  };
}

export function installPreviousWorkFilterButtons({documentRef,history,onRestore}) {
  const buttons = [];
  for (const selector of ['#catalog-results .gp-page-heading','#mobile-selection-view .mobile-selection-header']) {
    const host = documentRef.querySelector(selector);
    if (!host) continue;
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'gp-resume-work-filter';
    button.textContent = '恢复上次筛选';
    button.hidden = true;
    button.addEventListener('click', () => {
      const filter = history.read();
      if (filter) onRestore(filter);
    });
    host.append(button);
    buttons.push(button);
  }
  return {
    update(filter) {
      history.remember(filter);
      for (const button of buttons) {
        button.hidden = !history.available(filter);
        const query = history.read()?.titleQuery;
        button.title = query ? `恢复上次搜索：${query}` : '恢复上次的筛选条件和排序';
      }
    }
  };
}

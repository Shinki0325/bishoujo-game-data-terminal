import { createWorkspaceSession } from './workspace-session.js';
import { COMPARE_COLUMNS, sortComparedWorks } from './work-compare-model.js';

export function createWorkCompareController({
  workForId, loadCredits, renderDialog, isOpen,
  onSelectionChanged, onActivated, onLimit,
  minimum = 2, maximum = 20
}) {
  let ids = [];
  let sortKey = 'vndbScore', sortDirection = 'desc';
  const session = createWorkspaceSession();
  const credits = new Map();
  const works = () => ids.map(workForId).filter(Boolean);
  function staffText(id, key) {
    const entry = credits.get(id);
    if (!entry || entry.status === 'pending') return '加载中…';
    if (entry.status === 'failed') return '暂时无法加载';
    const entries = entry.value?.staff?.[key];
    return (Array.isArray(entries) ? entries : []).map(person => person?.name).filter(Boolean).join(' · ') || '未记录';
  }
  function readCredits(id) {
    const previous = credits.get(id);
    if (previous?.status === 'ready') return Promise.resolve(previous.value);
    if (previous?.status === 'pending') return previous.promise;
    const entry = { status: 'pending' };
    credits.set(id, entry);
    entry.promise = Promise.resolve().then(() => loadCredits(id)).then(value => {
      entry.status = 'ready'; entry.value = value; return value;
    }, () => { entry.status = 'failed'; return null; });
    return entry.promise;
  }
  function paint(selectedWorks) {
    renderDialog({ works: selectedWorks, sorted: sortComparedWorks(selectedWorks, sortKey, sortDirection), sortKey, sortDirection, staffText });
  }
  async function open() {
    const selectedWorks = works();
    if (selectedWorks.length < minimum) return false;
    const request = session.begin('compare');
    paint(selectedWorks);
    onActivated();
    if (selectedWorks.length === 2) {
      const pending = selectedWorks.filter(work => credits.get(work.workId)?.status !== 'ready');
      if (pending.length) {
        await Promise.all(pending.map(work => readCredits(work.workId)));
        if (request.isCurrent() && isOpen()) paint(selectedWorks);
      }
    }
    return true;
  }
  function toggle(work, include) {
    const id = String(work?.workId ?? '');
    if (!id) return false;
    if (include) {
      if (ids.includes(id)) return false;
      if (ids.length >= maximum) { onLimit(maximum); return false; }
      ids = [...ids, id];
    } else ids = ids.filter(value => value !== id);
    session.suspend();
    onSelectionChanged();
    return true;
  }
  function clear() { ids = []; session.suspend(); onSelectionChanged(); }
  function sort(key) {
    const column = COMPARE_COLUMNS.find(item => item.key === key && item.sortable !== false);
    if (!column) return Promise.resolve(false);
    if (key === sortKey) sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDirection = key === 'year' || column.type === 'string' ? 'asc' : 'desc'; }
    return open();
  }
  return Object.freeze({
    get ids() { return Object.freeze([...ids]); },
    get minimum() { return minimum; },
    works, toggle, clear, open, sort, staffText,
    suspend() { session.suspend(); }
  });
}

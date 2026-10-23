import { parseSelectionShare, decodeSelectionShare } from './share-selection.js';
import { planSharedSelectionImport } from './share-import.js';

export function createSharedSelectionController({ locationRef, datasetVersion, authorityWorkIds,
  selectedIds, importWorks, view, clearHash, announce }) {
  let pending = null;
  function reset() { pending = null; view.render({ count: 0, missing: 0, ready: false, error: null }); }
  function open() {
    const token = parseSelectionShare(locationRef);
    if (token === null) return false;
    reset();
    try {
      const decoded = decodeSelectionShare(token);
      if (decoded.datasetVersion !== datasetVersion) throw Error('分享链接版本与当前目录不匹配。');
      const plan = planSharedSelectionImport({ sharedWorkIds: decoded.workIds, authorityWorkIds,
        currentSelectedWorkIds: selectedIds(), mode: 'append' });
      pending = [...plan.validWorkIds];
      view.render({ count: pending.length, missing: plan.missingWorkIds.length, ready: true, error: null });
    } catch (error) {
      view.render({ count: 0, missing: 0, ready: false, error: error?.message === '分享链接版本与当前目录不匹配。'
        ? error.message : '分享链接无效，未修改当前工作区。' });
    }
    view.open(); return true;
  }
  function commit(mode) {
    if (pending === null || pending.length === 0) return false;
    try {
      const result = importWorks(pending, { mode });
      if (result === false) return false; // Busy rejection is not a completed import.
      view.close(); clearHash(); pending = null;
      announce(mode === 'replace' ? '候选池已替换。' : '作品已追加到候选池。', 'success');
      return result;
    } catch (error) {
      announce(error instanceof Error ? error.message : '分享作品导入失败。', 'error');
      return false;
    }
  }
  return Object.freeze({ open, commit, reset, cancel() { view.close(); clearHash(); reset(); } });
}

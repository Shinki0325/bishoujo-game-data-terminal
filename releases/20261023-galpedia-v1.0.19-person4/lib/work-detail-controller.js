import { createWorkspaceSession } from './workspace-session.js';

// Owns only the pending detail opening, not the route or the shared work data.
export function createWorkDetailController({
  hydrateWork = null, readAliases = null, readLocation,
  showReady, onError, onPending = null
}) {
  const session = createWorkspaceSession();
  async function open(work, options = {}) {
    const sequence = session.begin('work-detail');
    const location = readLocation();
    let finishPending;
    try {
      const cleanup = onPending?.(work);
      if (typeof cleanup === 'function') finishPending = sequence.scope.add(cleanup);
      const [hydrated, aliasRows] = await Promise.all([
        hydrateWork ? hydrateWork(work) : work,
        readAliases ? readAliases([work.workId]) : null
      ]);
      work = hydrated;
      if (!sequence.isCurrent()) return;
      if (readAliases) {
        const rows = aliasRows;
        if (rows.length !== 1) throw new Error('作品名称资料缺失');
        options = { ...options, aliases: new Map(rows.map(row => [row.workId, row.aliases])) };
      }
      const current = readLocation();
      if (!sequence.isCurrent()
        || location.workspace !== current.workspace
        || location.personDirectoryOpen !== current.personDirectoryOpen
        || location.companyDirectoryOpen !== current.companyDirectoryOpen
        || location.home !== current.home) return;
      sequence.complete();
      return showReady(work, options);
    } catch (error) {
      if (!sequence.isCurrent()) return;
      sequence.fail(error);
      onError(error);
    } finally { finishPending?.(); }
  }
  return Object.freeze({ open, suspend() { session.suspend(); } });
}

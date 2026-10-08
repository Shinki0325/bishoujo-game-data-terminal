import { createCustomWork } from './custom-work.js';
import { STORAGE_KEY } from './state.js';

// Keep saved local identities valid while IndexedDB is still unavailable.
// Placeholder metadata never replaces the media database or its real records.
export function pendingLocalWorks(storage) {
  try {
    const state = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
    if (!Array.isArray(state?.selectedWorkIds)) return [];
    return [...new Set(state.selectedWorkIds)].filter(id =>
      typeof id === 'string' && /^custom-local-[a-z0-9-]{1,80}$/u.test(id)
    ).map(id => ({ ...createCustomWork({ id, title: '本地图片（等待读取）', width: 1, height: 1 }),
      localMediaPending: true }));
  } catch { return []; }
}

export function withMediaDeadline(operation, timeoutMs = 5000) {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('本地图片读取超时')), timeoutMs);
  })]).finally(() => clearTimeout(timer));
}

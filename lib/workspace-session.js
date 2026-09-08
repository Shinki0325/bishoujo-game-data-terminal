import { createViewLifetime } from './view-lifetime.js';
import { runtimeDiagnostics as diagnostics } from './runtime-diagnostics.js';

// One active UI observer. Shared resource caches are deliberately not owned here.
export function createWorkspaceSession() {
  let current = null, disposed = false, cleaning = false;
  let state = Object.freeze({ key: null, status: 'idle', error: null });
  function stop() {
    if (cleaning) return;
    const previous = current;
    if (previous) { diagnostics.gauge('activeSessions', -1); diagnostics.event('session-stop'); }
    current = null; // Invalidate before running abort/cleanup callbacks.
    state = Object.freeze({ key: null, status: 'idle', error: null });
    cleaning = true;
    try { previous?.scope.dispose(); } finally { cleaning = false; }
  }
  return Object.freeze({
    get disposed() { return disposed; },
    inspect() { return state; },
    isActive(key) { return !disposed && current?.key === key; },
    begin(key) {
      if (disposed) throw new Error('Workspace session is disposed');
      if (cleaning) throw new Error('Cannot enter a workspace during cleanup');
      if (typeof key !== 'string' || !key) throw new TypeError('Workspace key is required');
      stop();
      const scope = createViewLifetime(), controller = new AbortController();
      scope.add(() => controller.abort());
      const isCurrent = () => !disposed && current === ticket;
      const ticket = Object.freeze({
        key, scope, signal: controller.signal, isCurrent,
        guard(callback) {
          if (typeof callback !== 'function') throw new TypeError('guard requires a callback');
          return (...args) => isCurrent() ? callback(...args) : undefined;
        },
        complete({ empty = false } = {}) {
          if (!isCurrent()) return false;
          state = Object.freeze({ key, status: empty ? 'empty' : 'ready', error: null });
          diagnostics.event(empty ? 'session-empty' : 'session-ready');
          return true;
        },
        fail(error) {
          if (!isCurrent()) return false;
          state = Object.freeze({ key, status: 'error', error });
          diagnostics.event('session-error', { kind: error?.kind ?? 'unknown' });
          return true;
        }
      });
      current = ticket;
      diagnostics.gauge('activeSessions', 1); diagnostics.event('session-loading');
      state = Object.freeze({ key, status: 'loading', error: null });
      return ticket;
    },
    suspend: stop,
    dispose() { if (disposed) return; disposed = true; stop(); }
  });
}

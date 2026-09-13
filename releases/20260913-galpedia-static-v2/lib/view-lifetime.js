export function createViewLifetime() {
  const remove = new Set();
  let disposed = false;
  function add(cleanup) {
    if (typeof cleanup !== 'function') throw new TypeError('cleanup must be a function');
    let active = true;
    const release = () => {
      if (!active) return;
      active = false; remove.delete(release); cleanup();
    };
    if (disposed) release();
    else remove.add(release);
    return release;
  }
  return {
    get disposed() { return disposed; },
    add,
    listen(element, type, callback, options) {
      if (!element || disposed) return () => {};
      element.addEventListener(type, callback, options);
      // Snapshot capture: changing the caller's options later must not leak the listener.
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
      return add(() => element.removeEventListener(type, callback, capture));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const errors = [];
      for (const release of [...remove].reverse()) {
        try { release(); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'View cleanup failed');
    }
  };
}

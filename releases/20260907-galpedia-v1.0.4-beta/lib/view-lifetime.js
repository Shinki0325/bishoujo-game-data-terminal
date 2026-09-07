export function createViewLifetime() {
  const remove = [];
  return {
    listen(element, type, callback) {
      if (!element) return;
      element.addEventListener(type, callback);
      remove.push(() => element.removeEventListener(type, callback));
    },
    dispose() { remove.splice(0).forEach(dispose => dispose()); }
  };
}

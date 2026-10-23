// Cache successful initialization; failed feature loads can be retried locally.
export function createLazyResource(load) {
  let pending;
  let attempt = 0;
  return () => pending ??= Promise.resolve().then(() => load(attempt++)).catch(error => {
    pending = null;
    throw error;
  });
}

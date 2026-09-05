export function createGuideController({ key, read, write, open }) {
  if (typeof key !== 'string' || key.length === 0) throw new TypeError('key must be a non-empty string');
  if (typeof read !== 'function' || typeof write !== 'function' || typeof open !== 'function') {
    throw new TypeError('read, write, and open must be functions');
  }
  let entered = false;
  let seen = false;
  try {
    seen = read(key) === 'seen';
  } catch {
    seen = false;
  }
  function show() {
    open();
    return true;
  }
  return Object.freeze({
    enter({ automatic = true } = {}) {
      if (!automatic || entered || seen) return false;
      entered = true;
      seen = true;
      show();
      try { write(key, 'seen'); } catch { /* session-only fallback */ }
      return true;
    },
    open() {
      return show();
    },
    hasSeen() {
      return seen;
    }
  });
}

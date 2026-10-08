function snapshotEntries(entries, cached) {
  if (!Array.isArray(entries)) throw new TypeError('entries must be an array');
  const visible = [];
  const deferred = [];
  const seen = new Set();
  for (let index = 0; index < entries.length; index += 1) {
    if (!Object.hasOwn(entries, index)) throw new TypeError('entries must be dense');
    const entry = entries[index];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError(`entries[${index}] must be an object`);
    }
    const { url } = entry;
    if (typeof url !== 'string' || url.length === 0) {
      throw new TypeError(`entries[${index}].url must be a non-empty string`);
    }
    if (seen.has(url) || cached.has(url)) continue;
    seen.add(url);
    (entry.visible === true ? visible : deferred).push(url);
  }
  return [...visible, ...deferred];
}

export function createRankingPreloader({ load, concurrency = 4 }) {
  if (typeof load !== 'function') throw new TypeError('load must be a function');
  if (!Number.isSafeInteger(concurrency) || concurrency <= 0) {
    throw new TypeError('concurrency must be a positive integer');
  }

  const cached = new Set();
  let generation = 0;
  let queue = [];
  let active = 0;

  function pump(expectedGeneration) {
    if (expectedGeneration !== generation) return;
    while (active < concurrency && queue.length > 0) {
      const url = queue.shift();
      active += 1;
      Promise.resolve()
        .then(() => load(url))
        .then(() => cached.add(url))
        .catch(() => {})
        .finally(() => {
          active -= 1;
          pump(generation);
        });
    }
  }

  function replace(entries) {
    const nextQueue = snapshotEntries(entries, cached);
    generation += 1;
    queue = nextQueue;
    pump(generation);
    return generation;
  }

  function cancel() {
    generation += 1;
    queue = [];
    return generation;
  }

  function inspect() {
    return Object.freeze({
      generation,
      queued: queue.length,
      active,
      cached: cached.size
    });
  }

  return Object.freeze({ replace, cancel, inspect });
}

export function preloadImage(url) {
  if (typeof url !== 'string' || url.length === 0) {
    return Promise.reject(new TypeError('url must be a non-empty string'));
  }
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
        resolve();
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    image.addEventListener('error', () => {
      reject(new Error(`Image preload failed: ${url}`));
    }, { once: true });
    image.src = url;
  });
}

// All character views share a small request pool. A failed connection must not
// remove the image node: it is needed for bounded retry and online recovery.
const loaders = new WeakMap();

export function createCharacterImageBackup(windowRef) {
  let pending = null, checkedAt = 0, available = false;
  return async originalUrl => {
    const location = windowRef.location;
    if (!location || !['favorite.bishojo.date', 'localhost'].includes(location.hostname) || !windowRef.fetch) return null;
    let original;
    try { original = new URL(originalUrl); } catch { return null; }
    const path = /^\/terminal-wiki\/v1\/characters\/v1\/images\/([a-f0-9]{2})\/([a-f0-9]{64})\.webp$/u.exec(original.pathname);
    if (original.origin !== 'https://wiki-assets.bishojo.date' || original.search || original.hash || !path || !path[2].startsWith(path[1])) return null;
    if (!pending && Date.now() - checkedAt > 60000) pending = (async () => {
      const controller = new AbortController();
      const timer = windowRef.setTimeout(() => controller.abort(), 2000);
      try {
        const response = await windowRef.fetch(new URL('/character-images/v1/status.json', location.origin), { cache: 'no-store', signal: controller.signal });
        available = response.ok && response.headers.get('content-type')?.includes('application/json')
          && (await response.json()).schema === 'galpedia-character-image-proxy-v1';
      } catch { available = false; }
      finally { windowRef.clearTimeout(timer); checkedAt = Date.now(); pending = null; }
    })();
    if (pending) await pending;
    return available ? new URL(`/character-images/v1/${path[1]}/${path[2]}.webp`, location.origin).href : null;
  };
}

export function createCharacterImageLoader(documentRef, {
  concurrency = 4, timeoutMs = 12000, retryDelays = [600, 1800],
  windowRef = documentRef.defaultView ?? globalThis,
  observerFactory = callback => typeof windowRef.IntersectionObserver === 'function'
    ? new windowRef.IntersectionObserver(callback, { rootMargin: '180px 0px' }) : null
} = {}) {
  const records = new Set(), byImage = new WeakMap(), queue = [];
  let active = 0, disposed = false;
  const later = (callback, delay) => windowRef.setTimeout(callback, delay);
  const backupUrl = createCharacterImageBackup(windowRef);
  const cancel = timer => { if (timer !== null) windowRef.clearTimeout(timer); };
  const observer = observerFactory(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const record = byImage.get(entry.target);
      observer?.unobserve(entry.target);
      if (record) enqueue(record);
    }
  });
  const mutationObserver = typeof windowRef.MutationObserver === 'function'
    ? new windowRef.MutationObserver(() => sweep()) : null;
  mutationObserver?.observe(documentRef.documentElement, { childList: true, subtree: true });

  function connected(record) { return record.image.isConnected !== false; }
  function notify(record, state) {
    record.state = state;
    record.image.dataset.characterImageState = state;
    record.onState?.(state);
  }
  function release(record) {
    cancel(record.timer); record.timer = null;
    if (record.inFlight) { record.inFlight = false; active--; }
  }
  function disposeRecord(record) {
    if (record.state === 'disposed') return;
    release(record); observer?.unobserve(record.image);
    record.image.removeEventListener('load', record.loaded);
    record.image.removeEventListener('error', record.failed);
    // Stop an outstanding fetch only; keep a successfully displayed image.
    if (record.state === 'loading') record.image.removeAttribute('src');
    records.delete(record); byImage.delete(record.image);
    notify(record, 'disposed');
  }
  function sweep() {
    for (const record of records) if (record.mounted && !connected(record)) disposeRecord(record);
    pump();
  }
  function enqueue(record) {
    if (disposed || record.state === 'disposed' || record.state === 'queued' || record.inFlight) return;
    if (!connected(record)) { disposeRecord(record); return; }
    record.mounted = true;
    notify(record, 'queued'); queue.push(record); pump();
  }
  function pump() {
    while (!disposed && active < concurrency && queue.length) {
      const record = queue.shift();
      if (record.state !== 'queued') continue;
      if (!connected(record)) { disposeRecord(record); continue; }
      if (windowRef.navigator?.onLine === false) { notify(record, 'error'); continue; }
      record.attempt++;
      const requestId = ++record.requestId;
      record.inFlight = true; active++;
      notify(record, 'loading');
      record.timer = later(() => {
        if (!record.inFlight) return;
        fail(record);
        record.image.removeAttribute('src');
      }, timeoutMs);
      // Only the final attempt changes size; both URLs come from the existing
      // approved media record. Never invent another origin or bypass its hash.
      const url = record.attempt > retryDelays.length && record.fallbackUrl
        ? record.fallbackUrl : record.url;
      const assign = nextUrl => {
        if (!record.inFlight || record.requestId !== requestId || record.state === 'disposed') return;
        record.image.loading = 'eager';
        record.image.removeAttribute('src');
        record.image.src = nextUrl;
      };
      if (record.attempt > retryDelays.length) {
        void backupUrl(record.url).then(backup => assign(backup || url), () => assign(url));
      } else assign(url);
    }
  }
  function fail(record) {
    if (!record.inFlight) return;
    release(record);
    if (!connected(record)) { disposeRecord(record); pump(); return; }
    if (record.attempt <= retryDelays.length && windowRef.navigator?.onLine !== false) {
      notify(record, 'retrying');
      record.timer = later(() => { record.timer = null; enqueue(record); }, retryDelays[record.attempt - 1]);
    } else notify(record, 'error');
    pump();
  }
  function retry(record, online = false) {
    if (record.state !== 'error' || !connected(record)) return;
    if (online && record.onlineRecoveryUsed) return;
    record.onlineRecoveryUsed = online;
    record.attempt = 0;
    enqueue(record);
  }
  function onOnline() {
    sweep();
    for (const record of records) retry(record, true);
  }
  windowRef.addEventListener?.('online', onOnline);
  return {
    load(image, { url, fallbackUrl = null, onState } = {}) {
      if (disposed || !url) return { retry() {}, dispose() {} };
      const old = byImage.get(image); if (old) disposeRecord(old);
      const record = { image, url, fallbackUrl, onState, state: 'waiting', attempt: 0,
        timer: null, inFlight: false, mounted: false, onlineRecoveryUsed: false, requestId: 0 };
      record.loaded = () => {
        if (!record.inFlight) return;
        if (!image.naturalWidth) { fail(record); return; }
        release(record); image.hidden = false; notify(record, 'loaded'); pump();
      };
      record.failed = () => fail(record);
      records.add(record); byImage.set(image, record);
      image.addEventListener('load', record.loaded);
      image.addEventListener('error', record.failed);
      notify(record, 'waiting');
      if (observer) observer.observe(image);
      queueMicrotask(() => {
        if (record.state === 'disposed') return;
        if (!connected(record)) { disposeRecord(record); return; }
        record.mounted = true;
        if (!observer) enqueue(record);
      });
      return { retry: () => retry(record), dispose: () => { disposeRecord(record); pump(); } };
    },
    dispose() {
      disposed = true; observer?.disconnect(); mutationObserver?.disconnect();
      windowRef.removeEventListener?.('online', onOnline);
      for (const record of records) disposeRecord(record);
      queue.length = 0;
    }
  };
}

export function createCharacterImageGroup(documentRef) {
  let loader = loaders.get(documentRef);
  if (!loader) { loader = createCharacterImageLoader(documentRef); loaders.set(documentRef, loader); }
  const entries = new Set();
  const button = documentRef.createElement('button');
  button.type = 'button'; button.className = 'character-image-retry'; button.hidden = true;
  button.textContent = '重试角色图片';
  const update = () => { button.hidden = ![...entries].some(entry => entry.state === 'error'); };
  const retry = event => { event?.preventDefault(); event?.stopPropagation(); for (const entry of entries) entry.control?.retry(); };
  button.addEventListener('click', retry);
  return {
    button,
    load(image, options) {
      const entry = { state: 'waiting', control: null }; entries.add(entry);
      entry.control = loader.load(image, { ...options, onState(state) {
        entry.state = state;
        if (state === 'disposed') entries.delete(entry);
        options.onState?.(state); update();
      } });
      return entry.control;
    },
    dispose() { button.removeEventListener('click', retry); for (const entry of entries) entry.control?.dispose(); entries.clear(); button.remove(); }
  };
}

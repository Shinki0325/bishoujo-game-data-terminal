// All character views share a small request pool. A failed connection must not
// remove the image node: it is needed for bounded retry and online recovery.
const loaders = new WeakMap();
const diagnostics = new WeakMap();

export function readCharacterImageDiagnostics(documentRef) {
  const value = diagnostics.get(documentRef) ?? { events: [], counts: {} };
  return { schema: 'galpedia-media-diagnostics-v1', counts: { ...value.counts }, events: value.events.map(row => ({ ...row })) };
}

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
    ? new windowRef.IntersectionObserver(callback, { rootMargin: '180px 0px' }) : null,
  requestImageFactory = () => new windowRef.Image(),
  resolveBackup = createCharacterImageBackup(windowRef),
  knownMissingUrls = new Set(), onDiagnostic
} = {}) {
  const records = new Set(), byImage = new WeakMap(), queue = [], transfers = new Map();
  let active = 0, disposed = false;
  const later = (callback, delay) => windowRef.setTimeout(callback, delay);
  const cancel = timer => { if (timer !== null) windowRef.clearTimeout(timer); };
  const log = diagnostics.get(documentRef) ?? { events: [], counts: {} };
  diagnostics.set(documentRef, log);
  function emit(record, result, extra = {}) {
    const rawRoute = windowRef.location?.hash?.split('/')[0]?.slice(1);
    const route = ['work', 'works', 'persons', 'companies'].includes(rawRoute) ? rawRoute : 'other';
    const row = { route, family: 'character', endpoint: record.endpoint ?? 'primary',
      attempt: record.attempt, cycle: record.cycle, result, backup: record.endpoint === 'backup',
      release: /\/releases\/([^/]+)\//u.exec(import.meta.url)?.[1] ?? 'local', ...extra };
    log.counts[result] = (log.counts[result] ?? 0) + 1;
    log.events.push(row); if (log.events.length > 256) log.events.shift();
    try { onDiagnostic?.({ ...row }); } catch { /* Diagnostics cannot interrupt image recovery. */ }
  }
  function visible(record) {
    const image = record.image;
    if (!connected(record) || record.visible === false) return false;
    if (image.getClientRects && !image.getClientRects().length) return false;
    if (!image.getBoundingClientRect) return true;
    const box = image.getBoundingClientRect();
    return box.bottom >= -180 && box.right >= 0 && box.top <= (windowRef.innerHeight || 1000) + 180
      && box.left <= (windowRef.innerWidth || 1440);
  }
  const observer = observerFactory(entries => {
    for (const entry of entries) {
      const record = byImage.get(entry.target);
      if (!record) continue;
      record.visible = entry.isIntersecting;
      if (entry.isIntersecting && ['waiting', 'waiting-retry'].includes(record.state)) enqueue(record);
      else if (entry.isIntersecting && record.onlinePending) retry(record, true);
    }
  });
  const mutationObserver = typeof windowRef.MutationObserver === 'function'
    ? new windowRef.MutationObserver(() => sweep()) : null;
  mutationObserver?.observe(documentRef.documentElement, { childList: true, subtree: true });

  function connected(record) { return record.image.isConnected !== false; }
  function notify(record, state) {
    record.state = state;
    record.image.dataset.characterImageState = state;
    record.original.dataset.characterImageState = state;
    record.onState?.(state);
  }
  function release(record) {
    cancel(record.timer); record.timer = null;
    if (record.transfer) {
      const transfer = record.transfer; transfer.records.delete(record); record.transfer = null;
      if (!transfer.records.size) stopTransfer(transfer);
    }
    record.inFlight = false;
    record.requestId++;
  }
  function stopTransfer(transfer) {
    if (transfer.stopped) return;
    transfer.stopped = true; cancel(transfer.timer);
    transfer.image.removeEventListener('load', transfer.loaded);
    transfer.image.removeEventListener('error', transfer.failed);
    if (!transfer.completed) transfer.image.removeAttribute('src');
    if (transfers.get(transfer.key) === transfer) transfers.delete(transfer.key);
    active--;
  }
  function disposeRecord(record) {
    if (record.state === 'disposed') return;
    if (record.state !== 'loaded') emit(record, record.inFlight ? 'inflight_cancelled' : 'queued_cancelled');
    release(record); observer?.unobserve(record.image);
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
    if (!visible(record)) { notify(record, record.step ? 'waiting-retry' : 'waiting'); return; }
    notify(record, 'queued'); queue.push(record); pump();
  }
  function pump() {
    const pending = queue.length;
    for (let index = 0; !disposed && index < pending && queue.length; index++) {
      const record = queue.shift();
      if (record.state !== 'queued') continue;
      if (!connected(record)) { disposeRecord(record); continue; }
      if (!visible(record)) { notify(record, 'waiting-retry'); continue; }
      if (windowRef.navigator?.onLine === false) { emit(record, 'offline'); notify(record, 'error'); continue; }
      if (record.step < 2 && knownMissingUrls.has(record.url)) record.step = 2;
      if (record.step === 2 && !record.resolved) {
        const requestId = ++record.requestId;
        notify(record, 'checking');
        void Promise.resolve().then(() => resolveBackup(record.url)).catch(() => null).then(backup => {
          if (disposed || record.requestId !== requestId || record.state === 'disposed') return;
          const alternative = backup || record.fallbackUrl;
          if (!alternative || alternative === record.url || knownMissingUrls.has(alternative)) {
            emit(record, 'no_eligible_backup'); notify(record, 'error'); return;
          }
          record.resolved = alternative; record.endpoint = backup ? 'backup' : 'variant'; enqueue(record);
        });
        continue;
      }
      const url = record.step === 2 ? record.resolved : record.url;
      const key = JSON.stringify([url, record.image.crossOrigin ?? null, record.image.referrerPolicy ?? '']);
      // Serialize identical URLs so later views reuse the browser image cache.
      let transfer = transfers.get(key);
      if (transfer || active >= concurrency) { queue.push(record); continue; }
      if (!transfer) {
        const image = requestImageFactory();
        transfer = { key, url, image, records: new Set(), timer: null, stopped: false, completed: false };
        transfers.set(key, transfer); active++;
        const complete = result => {
          if (transfer.stopped) return;
          transfer.completed = result === 'success';
          const subscribers = [...transfer.records];
          stopTransfer(transfer);
          for (const subscriber of subscribers) {
            if (subscriber.transfer !== transfer || subscriber.state === 'disposed') continue;
            subscriber.transfer = null; subscriber.inFlight = false;
            if (!connected(subscriber)) { disposeRecord(subscriber); continue; }
            if (result === 'success') {
              subscriber.image.hidden = false; notify(subscriber, 'loaded'); emit(subscriber, 'success');
            } else fail(subscriber, result);
          }
          pump();
        };
        transfer.loaded = () => complete(image.naturalWidth ? 'success' : 'generic_image_error');
        transfer.failed = () => complete('generic_image_error');
        image.addEventListener('load', transfer.loaded); image.addEventListener('error', transfer.failed);
        if (record.image.crossOrigin != null) image.crossOrigin = record.image.crossOrigin;
        if (record.image.referrerPolicy) image.referrerPolicy = record.image.referrerPolicy;
        transfer.start = () => {
          const previous = record.image;
          for (const attribute of Array.from(previous.attributes ?? [])) {
            if (!['src', 'srcset', 'loading'].includes(attribute.name)) image.setAttribute(attribute.name, attribute.value);
          }
          image.loading = 'eager'; image.dataset.characterImageState = 'loading';
          observer?.unobserve(previous); byImage.delete(previous);
          record.image = image; byImage.set(image, record);
          previous.replaceWith?.(image); observer?.observe(image);
          transfer.timer = later(() => complete('timeout'), timeoutMs);
          image.src = url;
        };
      }
      record.attempt++; record.inFlight = true; record.transfer = transfer;
      transfer.records.add(record); notify(record, 'loading'); emit(record, 'request_started', { shared: transfer.records.size > 1 });
      if (transfer.start) { const start = transfer.start; transfer.start = null; start(); }
    }
  }
  function fail(record, result) {
    emit(record, result);
    if (record.step < Math.min(2, retryDelays.length) && windowRef.navigator?.onLine !== false) {
      const delay = retryDelays[record.step++];
      notify(record, 'retrying');
      record.timer = later(() => { record.timer = null; enqueue(record); }, delay);
    } else notify(record, 'error');
  }
  function retry(record, online = false) {
    if (record.state !== 'error' || !connected(record) || !visible(record)) return;
    if (online && record.onlineRecoveryUsed) return;
    release(record);
    record.onlinePending = false;
    record.onlineRecoveryUsed = online;
    record.attempt = 0; record.step = 0; record.resolved = null; record.endpoint = 'primary'; record.cycle++;
    enqueue(record);
  }
  function onOnline() {
    sweep();
    for (const record of records) {
      record.onlinePending = record.state === 'error' && !record.onlineRecoveryUsed;
      if (record.onlinePending) retry(record, true);
    }
  }
  function onOffline() {
    for (const record of records) if (!['loaded', 'disposed', 'error'].includes(record.state)) {
      emit(record, 'offline', { cancelled: record.inFlight ? 'inflight' : 'queued' });
      release(record); notify(record, 'error');
    }
  }
  windowRef.addEventListener?.('online', onOnline);
  windowRef.addEventListener?.('offline', onOffline);
  return {
    load(image, { url, fallbackUrl = null, onState } = {}) {
      if (disposed || !url) return { retry() {}, dispose() {} };
      const old = byImage.get(image); if (old) disposeRecord(old);
      const record = { image, original: image, url, fallbackUrl, onState, state: 'waiting', attempt: 0, step: 0, cycle: 1,
        timer: null, inFlight: false, mounted: false, onlineRecoveryUsed: false, requestId: 0,
        visible: observer ? false : true, transfer: null, resolved: null, endpoint: 'primary', onlinePending: false };
      records.add(record); byImage.set(image, record);
      notify(record, 'waiting');
      if (observer) observer.observe(image);
      queueMicrotask(() => {
        if (record.state === 'disposed') return;
        if (!connected(record)) { disposeRecord(record); return; }
        record.mounted = true;
        if (!observer) enqueue(record);
      });
      return { get image() { return record.image; }, retry: () => retry(record), dispose: () => { disposeRecord(record); pump(); } };
    },
    dispose() {
      disposed = true; observer?.disconnect(); mutationObserver?.disconnect();
      windowRef.removeEventListener?.('online', onOnline);
      windowRef.removeEventListener?.('offline', onOffline);
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

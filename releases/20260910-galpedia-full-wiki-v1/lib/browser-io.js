function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function assertObject(value, name) {
  if (
    value === null
    || (typeof value !== 'object' && typeof value !== 'function')
    || Array.isArray(value)
  ) {
    throw new TypeError(`${name} must be an object`);
  }
}

export function setWorkspaceBusy({ roots, controls }, busy) {
  if (!Array.isArray(roots) || !Array.isArray(controls)) {
    throw new TypeError('roots and controls must be arrays');
  }
  if (typeof busy !== 'boolean') throw new TypeError('busy must be a boolean');
  for (const root of roots) {
    assertObject(root, 'workspace root');
    root.inert = busy;
  }
  for (const control of controls) {
    assertObject(control, 'workspace control');
    control.disabled = busy;
  }
}

export function createImportCoordinator({ readText, commit, setBusy }) {
  assertFunction(readText, 'readText');
  assertFunction(commit, 'commit');
  assertFunction(setBusy, 'setBusy');

  let generation = 0;
  let busy = false;

  function updateBusy(nextBusy) {
    if (busy === nextBusy) return;
    setBusy(nextBusy);
    busy = nextBusy;
  }

  return Object.freeze({
    async importFile(file) {
      const token = generation + 1;
      generation = token;
      updateBusy(true);
      let stage = 'read';
      try {
        const text = await readText(file);
        if (token !== generation) return { status: 'stale' };
        stage = 'commit';
        const value = await commit(text, file);
        if (token !== generation) return { status: 'stale' };
        return { status: 'success', value };
      } catch (error) {
        if (token !== generation) return { status: 'stale' };
        return { status: 'error', stage, error };
      } finally {
        if (token === generation) updateBusy(false);
      }
    },

    isBusy() {
      return busy;
    }
  });
}

function reportDeferredError(error, onDeferredError) {
  try {
    onDeferredError(error);
  } catch {
    // Deferred cleanup reporting cannot affect the completed download command.
  }
}

function capabilityError(message, cause) {
  return cause === undefined
    ? new TypeError(message)
    : new TypeError(message, { cause });
}

function ownDataValue(target, property, label, kind = 'property') {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(target, property);
  } catch (cause) {
    throw capabilityError(`${label} capability is unavailable`, cause);
  }
  if (descriptor === undefined || !('value' in descriptor)) {
    throw capabilityError(`${label} must be an own data ${kind}`);
  }
  return descriptor.value;
}

function snapshotUrlCapability(globalRef) {
  const urlApi = ownDataValue(globalRef, 'URL', 'globalRef.URL');
  const methods = {};
  for (const name of ['createObjectURL', 'revokeObjectURL']) {
    const method = ownDataValue(urlApi, name, `URL.${name}`, 'method');
    if (typeof method !== 'function') {
      throw capabilityError(`URL.${name} must be an own data method`);
    }
    try {
      methods[name] = Function.prototype.bind.call(method, urlApi);
    } catch (cause) {
      throw capabilityError(`URL.${name} capability is unavailable`, cause);
    }
  }
  return Object.freeze(methods);
}

function scheduleRevoke(blobUrl, { urlCapability, schedule, onDeferredError }) {
  try {
    schedule(() => {
      try {
        urlCapability.revokeObjectURL(blobUrl);
      } catch (error) {
        reportDeferredError(error, onDeferredError);
      }
    });
  } catch (error) {
    reportDeferredError(error, onDeferredError);
  }
}

export function downloadBlob({
  blob,
  filename,
  documentRef,
  globalRef = globalThis,
  schedule,
  onDeferredError = () => {}
}) {
  if (typeof filename !== 'string' || filename.length === 0) {
    throw new TypeError('filename must be a non-empty string');
  }
  assertObject(documentRef, 'documentRef');
  assertFunction(documentRef.createElement, 'documentRef.createElement');
  assertObject(documentRef.body, 'documentRef.body');
  assertFunction(documentRef.body.append, 'documentRef.body.append');
  assertFunction(schedule, 'schedule');
  assertFunction(onDeferredError, 'onDeferredError');
  const urlCapability = snapshotUrlCapability(globalRef);

  let blobUrl = null;
  let anchor = null;
  try {
    blobUrl = urlCapability.createObjectURL(blob);
    anchor = documentRef.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    documentRef.body.append(anchor);
    anchor.click();
  } finally {
    try {
      if (anchor !== null) anchor.remove();
    } finally {
      if (blobUrl !== null) {
        scheduleRevoke(blobUrl, { urlCapability, schedule, onDeferredError });
      }
    }
  }
  return Object.freeze({ filename });
}

export function downloadText({
  text,
  filename,
  mimeType,
  createBlob,
  documentRef,
  globalRef = globalThis,
  schedule,
  onDeferredError = () => {}
}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (typeof mimeType !== 'string' || mimeType.length === 0) {
    throw new TypeError('mimeType must be a non-empty string');
  }
  assertFunction(createBlob, 'createBlob');
  const blob = createBlob([text], { type: mimeType });
  return downloadBlob({
    blob,
    filename,
    documentRef,
    globalRef,
    schedule,
    onDeferredError
  });
}

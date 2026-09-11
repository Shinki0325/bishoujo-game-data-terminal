import { createStickerDocument, validateStickerDocument } from './sticker-document.js';

export const MEDIA_DB_NAME = 'egs-tier-terminal-media-v1';

function compositeKey({ kind, id, workId }) {
  return kind === 'custom' ? id : `replacement:${workId}`;
}

function baseKey(identity) {
  return `${compositeKey(identity)}:sticker-base`;
}

function validateIdentity(identity) {
  if (!identity || (identity.kind !== 'custom' && identity.kind !== 'replacement')) {
    throw new TypeError('local media identity kind is required');
  }
  if (identity.kind === 'custom' && (typeof identity.id !== 'string' || identity.id === '')) {
    throw new TypeError('custom media id is required');
  }
  if (identity.kind === 'replacement' && (typeof identity.workId !== 'string' || identity.workId === '')) {
    throw new TypeError('replacement workId is required');
  }
  return identity;
}

function validCustom(record) {
  return record !== null && typeof record === 'object'
    && typeof record.id === 'string' && record.id.startsWith('custom-local-')
    && typeof record.title === 'string'
    && Number.isSafeInteger(record.width) && Number.isSafeInteger(record.height)
    && record.width > 0 && record.height > 0;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed')), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed')), { once: true });
  });
}

export async function openLocalMediaDatabase(indexedDBRef) {
  if (!indexedDBRef || typeof indexedDBRef.open !== 'function') throw new TypeError('indexedDBRef must provide open');
  const openRequest = indexedDBRef.open(MEDIA_DB_NAME, 1);
  openRequest.addEventListener('upgradeneeded', () => {
    const database = openRequest.result;
    for (const name of ['custom', 'replacement', 'blob']) {
      if (!database.objectStoreNames.contains(name)) database.createObjectStore(name);
    }
  }, { once: true });
  const database = await requestResult(openRequest);
  const read = (storeName, key) => {
    const transaction = database.transaction([storeName], 'readonly');
    return requestResult(transaction.objectStore(storeName).get(key));
  };
  return Object.freeze({
    async listCustom() {
      const transaction = database.transaction(['custom'], 'readonly');
      return requestResult(transaction.objectStore('custom').getAll());
    },
    readReplacement: workId => read('replacement', workId),
    readBlob: key => read('blob', key),
    async readEditable(identity) {
      validateIdentity(identity);
      const metadataStore = identity.kind === 'custom' ? 'custom' : 'replacement';
      const metadataKey = identity.kind === 'custom' ? identity.id : identity.workId;
      const transaction = database.transaction([metadataStore, 'blob'], 'readonly');
      const metadataRequest = transaction.objectStore(metadataStore).get(metadataKey);
      const compositeRequest = transaction.objectStore('blob').get(compositeKey(identity));
      const baseRequest = transaction.objectStore('blob').get(baseKey(identity));
      const [metadata, compositeBlob, baseBlob] = await Promise.all([
        requestResult(metadataRequest),
        requestResult(compositeRequest),
        requestResult(baseRequest)
      ]);
      return {
        metadata: metadata ?? null,
        compositeBlob: compositeBlob ?? null,
        baseBlob: baseBlob ?? null
      };
    },
    async writeAtomic(record) {
      validateIdentity(record);
      const transaction = database.transaction(['custom', 'replacement', 'blob'], 'readwrite');
      const metadata = { ...record };
      delete metadata.blob;
      delete metadata.stickerDocument;
      if (record.kind === 'custom') {
        transaction.objectStore('custom').put(metadata, record.id);
        transaction.objectStore('blob').put(record.blob, record.id);
      } else {
        transaction.objectStore('replacement').put(metadata, record.workId);
        transaction.objectStore('blob').put(record.blob, `replacement:${record.workId}`);
      }
      transaction.objectStore('blob').delete(baseKey(record));
      await transactionDone(transaction);
    },
    async writeStickerAtomic(record) {
      validateIdentity(record);
      const metadataStore = record.kind === 'custom' ? 'custom' : 'replacement';
      const metadataKey = record.kind === 'custom' ? record.id : record.workId;
      const transaction = database.transaction([metadataStore, 'blob'], 'readwrite');
      const metadata = { ...record };
      delete metadata.baseBlob;
      delete metadata.compositeBlob;
      transaction.objectStore(metadataStore).put(metadata, metadataKey);
      transaction.objectStore('blob').put(record.baseBlob, baseKey(record));
      transaction.objectStore('blob').put(record.compositeBlob, compositeKey(record));
      await transactionDone(transaction);
    },
    async clearStickersAtomic(identity, { restorePublic = false } = {}) {
      validateIdentity(identity);
      if (restorePublic && identity.kind !== 'replacement') {
        throw new TypeError('only public replacements can restore public media');
      }
      const metadataStore = identity.kind === 'custom' ? 'custom' : 'replacement';
      const metadataKey = identity.kind === 'custom' ? identity.id : identity.workId;
      const transaction = database.transaction([metadataStore, 'blob'], 'readwrite');
      if (restorePublic) {
        transaction.objectStore(metadataStore).delete(metadataKey);
        transaction.objectStore('blob').delete(compositeKey(identity));
        transaction.objectStore('blob').delete(baseKey(identity));
      } else {
        const metadataRequest = transaction.objectStore(metadataStore).get(metadataKey);
        const baseRequest = transaction.objectStore('blob').get(baseKey(identity));
        const [storedMetadata, baseBlob] = await Promise.all([
          requestResult(metadataRequest),
          requestResult(baseRequest)
        ]);
        if (!baseBlob) throw new Error('editable sticker base image is missing');
        const metadata = { ...(storedMetadata ?? identity) };
        delete metadata.stickerDocument;
        transaction.objectStore(metadataStore).put(metadata, metadataKey);
        transaction.objectStore('blob').put(baseBlob, compositeKey(identity));
        transaction.objectStore('blob').delete(baseKey(identity));
      }
      await transactionDone(transaction);
    },
    async deleteAtomic({ kind, id, workId }) {
      validateIdentity({ kind, id, workId });
      const transaction = database.transaction(['custom', 'replacement', 'blob'], 'readwrite');
      const key = kind === 'custom' ? id : workId;
      transaction.objectStore(kind).delete(key);
      const identity = { kind, id, workId };
      transaction.objectStore('blob').delete(compositeKey(identity));
      transaction.objectStore('blob').delete(baseKey(identity));
      await transactionDone(transaction);
    }
  });
}

export function createLocalMediaStore({ database, urlApi }) {
  if (!database || !urlApi || typeof urlApi.createObjectURL !== 'function' || typeof urlApi.revokeObjectURL !== 'function') {
    throw new TypeError('database and URL API are required');
  }
  const objectUrls = new Map();
  const generations = new Map();
  function invalidate(key) {
    generations.set(key, (generations.get(key) ?? 0) + 1);
    const url = objectUrls.get(key);
    if (url) urlApi.revokeObjectURL(url);
    objectUrls.delete(key);
  }
  async function urlFor(key) {
    if (objectUrls.has(key)) return objectUrls.get(key);
    const generation = generations.get(key) ?? 0;
    const blob = await database.readBlob(key);
    if (!blob) return null;
    if ((generations.get(key) ?? 0) !== generation) return null;
    const url = urlApi.createObjectURL(blob);
    objectUrls.set(key, url);
    return url;
  }
  return Object.freeze({
    async listCustom() {
      return (await database.listCustom()).filter(validCustom).map(record => Object.freeze({
        id: record.id, title: record.title, width: record.width, height: record.height
      }));
    },
    replacementFor: workId => database.readReplacement(workId),
    async editableFor(identity) {
      const stored = await database.readEditable(identity);
      if (!stored.compositeBlob) return null;
      const metadata = stored.metadata ?? identity;
      const stickerDocument = metadata.stickerDocument
        ? validateStickerDocument(metadata.stickerDocument)
        : createStickerDocument({
            baseWidth: identity.width ?? metadata.width,
            baseHeight: identity.height ?? metadata.height
          });
      return Object.freeze({
        metadata: Object.freeze({ ...metadata }),
        baseBlob: stored.baseBlob ?? stored.compositeBlob,
        compositeBlob: stored.compositeBlob,
        stickerDocument
      });
    },
    async putCustom(record) {
      const identity = { kind: 'custom', ...record };
      await database.writeAtomic(identity);
      invalidate(compositeKey(identity));
    },
    async putReplacement(record) {
      const identity = { kind: 'replacement', ...record };
      await database.writeAtomic(identity);
      invalidate(compositeKey(identity));
    },
    async putStickerEdit(record) {
      const normalized = {
        ...record,
        stickerDocument: validateStickerDocument(record.stickerDocument)
      };
      await database.writeStickerAtomic(normalized);
      invalidate(compositeKey(normalized));
    },
    async clearStickerEdit(identity) {
      await database.clearStickersAtomic(identity, { restorePublic: identity.restorePublic === true });
      invalidate(compositeKey(identity));
    },
    async deleteCustom(id) {
      const identity = { kind: 'custom', id };
      await database.deleteAtomic(identity);
      invalidate(compositeKey(identity));
    },
    async deleteReplacement(workId) {
      const identity = { kind: 'replacement', workId };
      await database.deleteAtomic(identity);
      invalidate(compositeKey(identity));
    },
    urlForCustom: id => urlFor(id),
    urlForReplacement: workId => urlFor(`replacement:${workId}`),
    revokeAll() {
      for (const url of objectUrls.values()) urlApi.revokeObjectURL(url);
      objectUrls.clear();
    }
  });
}

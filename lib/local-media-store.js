export const MEDIA_DB_NAME = 'egs-tier-terminal-media-v1';

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
    async writeAtomic(record) {
      const transaction = database.transaction(['custom', 'replacement', 'blob'], 'readwrite');
      const metadata = { ...record };
      delete metadata.blob;
      if (record.kind === 'custom') {
        transaction.objectStore('custom').put(metadata, record.id);
        transaction.objectStore('blob').put(record.blob, record.id);
      } else {
        transaction.objectStore('replacement').put(metadata, record.workId);
        transaction.objectStore('blob').put(record.blob, `replacement:${record.workId}`);
      }
      await transactionDone(transaction);
    },
    async deleteAtomic({ kind, id, workId }) {
      const transaction = database.transaction(['custom', 'replacement', 'blob'], 'readwrite');
      const key = kind === 'custom' ? id : workId;
      transaction.objectStore(kind).delete(key);
      transaction.objectStore('blob').delete(kind === 'custom' ? id : `replacement:${workId}`);
      await transactionDone(transaction);
    }
  });
}

export function createLocalMediaStore({ database, urlApi }) {
  if (!database || !urlApi || typeof urlApi.createObjectURL !== 'function' || typeof urlApi.revokeObjectURL !== 'function') {
    throw new TypeError('database and URL API are required');
  }
  const objectUrls = new Map();
  async function urlFor(key) {
    if (objectUrls.has(key)) return objectUrls.get(key);
    const blob = await database.readBlob(key);
    if (!blob) return null;
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
    putCustom: record => database.writeAtomic({ kind: 'custom', ...record }),
    putReplacement: record => database.writeAtomic({ kind: 'replacement', ...record }),
    deleteCustom: id => database.deleteAtomic({ kind: 'custom', id }),
    deleteReplacement: workId => database.deleteAtomic({ kind: 'replacement', workId }),
    urlForCustom: id => urlFor(id),
    urlForReplacement: workId => urlFor(`replacement:${workId}`),
    revokeAll() {
      for (const url of objectUrls.values()) urlApi.revokeObjectURL(url);
      objectUrls.clear();
    }
  });
}

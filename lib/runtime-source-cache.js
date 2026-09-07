// Share fetch/parse work across independently mounted workspaces. Failed loads
// are evicted; a failure in one optional workspace must not poison another.
import { createResourceRequest } from './resource-request.js';
export function createRuntimeSourceCache({ fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto, requestPolicy = {} } = {}) {
  const requestResource = createResourceRequest({ ...requestPolicy, fetchImpl });
  const pending = new Map();
  return function load(url, label = '资料') {
    const key = String(url);
    if (!pending.has(key)) {
      const request = requestResource(url, { label, validate: async bytes => {
        const digest = await cryptoRef.subtle.digest('SHA-256', bytes);
        const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        return { value: JSON.parse(new TextDecoder().decode(bytes)), sha256 };
      } }).catch(error => { pending.delete(key); throw error; });
      pending.set(key, request);
    }
    return pending.get(key);
  };
}
export const loadRuntimeSource = createRuntimeSourceCache();

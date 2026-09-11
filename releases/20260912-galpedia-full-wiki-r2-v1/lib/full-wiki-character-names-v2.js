import { CHARACTER_NAMES } from './full-wiki-character-names-config-v2.js';

export function characterDisplayName(entity, names = {}, fallback = '') {
  const originalName = entity?.originalNameCandidate || entity?.displayName || fallback;
  for (const source of entity?.sourceIds?.bangumi ?? []) {
    const name = names[String(source.characterId)];
    if (typeof name === 'string' && name.trim()) {
      return { name: name.trim(), originalName, source: 'bangumi', sourceCharacterId: String(source.characterId) };
    }
  }
  return { name: originalName, originalName, source: null };
}

export function createCharacterNamesLoader({ fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto } = {}) {
  let pending;
  return function load() {
    if (!pending) pending = (async () => {
      const response = await fetchImpl(new URL(CHARACTER_NAMES.url, import.meta.url));
      if (!response.ok) throw new Error('角色中文名读取失败');
      const bytes = await response.arrayBuffer();
      const sha = Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
      if (sha !== CHARACTER_NAMES.sha256 || bytes.byteLength !== CHARACTER_NAMES.bytes) throw new Error('角色中文名校验失败');
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (data.schema !== 'terminal-wiki-bangumi-character-names-v1' || !data.names) throw new Error('角色中文名格式无效');
      return data.names;
    })().catch(error => { pending = null; throw error; });
    return pending;
  };
}

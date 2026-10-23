import { resolveSharedDataURL } from './shared-data-url.js';
import { PERSON_NAMES } from './full-wiki-person-names-config.js';

let pending;
export function loadPersonDisplayNames() {
  if (!pending) pending = (async () => {
    const response = await fetch(resolveSharedDataURL(new URL(PERSON_NAMES.url, import.meta.url)));
    if (!response.ok) throw new Error('人物显示名读取失败');
    const bytes = await response.arrayBuffer();
    const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
    if (sha !== PERSON_NAMES.sha256 || bytes.byteLength !== PERSON_NAMES.bytes) throw new Error('人物显示名校验失败');
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.schema !== 'terminal-wiki-person-display-names-v1') throw new Error('人物显示名格式无效');
    const records = new Map(Object.entries(data.names).map(([canonicalEntityId, [entityId, displayName]]) => [canonicalEntityId, { entityId, displayName, canonicalEntityId, hiddenNameVariants: data.hiddenNameVariants?.[canonicalEntityId] ?? [] }]));
    const byId = new Map([...records.values()].map(row => [row.entityId, row]));
    return Object.freeze({ get(id) { return records.get(id) ?? records.get(data.sources[id]) ?? byId.get(id) ?? null; } });
  })().catch(error => { pending = null; throw error; });
  return pending;
}

import { VERSION_SCOPE } from './version-scope-config.js';
import { createResourceRequest } from './resource-request.js';
import { buildPersonDirectoryActivity } from './person-activity-timeline.js';

export function scopedPersonSummary(person, axis, config = VERSION_SCOPE) {
  const summary = config.summaries?.[person.entityId];
  if (!summary) return person;
  const years = (summary.activityYears ?? []).flatMap(row => Array(row.count).fill(row.year));
  return { ...person, ...summary, activity: buildPersonDirectoryActivity(years, axis) };
}

export function createVersionScopeClient({config = VERSION_SCOPE, fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto} = {}) {
  const base = new URL(config.baseUrl, import.meta.url), cache = new Map();
  const request = createResourceRequest({fetchImpl});
  const hash = async bytes => Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  async function read(kind, id) {
    const descriptor = config[kind]?.[id];
    if (!descriptor) return null;
    const singular = kind === 'persons' ? 'person' : 'work';
    if (descriptor.path !== `${singular}-${id}.json` || !/^[A-Za-z0-9_]+$/.test(id)
      || !/^[a-f0-9]{64}$/.test(descriptor.sha256) || !Number.isSafeInteger(descriptor.bytes)
      || descriptor.bytes < 1 || descriptor.bytes > 4 * 1024 * 1024) throw Error('版本资料描述无效');
    const key = `${kind}:${id}`;
    if (!cache.has(key)) cache.set(key, request(new URL(descriptor.path, base), {
      label: '版本资料', validationKey: `${config.revision}:${descriptor.sha256}`,
      validate: async bytes => {
        if (bytes.byteLength !== descriptor.bytes || await hash(bytes) !== descriptor.sha256) throw Error('版本资料摘要不符');
        const value = JSON.parse(new TextDecoder().decode(bytes));
        if (value.schema !== `galpedia-scoped-${singular}-v1` || String(value[`${singular}Id`]) !== id) throw Error('版本资料身份不符');
        const model = value[singular === 'person' ? 'person' : 'model'];
        if (!model || model.scopeRevision !== config.revision) throw Error('版本资料修订不符');
        if (singular === 'person' && (model.entityId !== id || !Array.isArray(model.credits))) throw Error('人物版本资料不完整');
        if (singular === 'work' && (model.editionWorkId !== id || !Array.isArray(model.cast))) throw Error('作品版本资料不完整');
        return model;
      }
    }).catch(error => {cache.delete(key); throw error;}));
    return cache.get(key);
  }
  return Object.freeze({person: id => read('persons', String(id)), work: id => read('works', String(id))});
}
export const versionScopeClient = createVersionScopeClient();

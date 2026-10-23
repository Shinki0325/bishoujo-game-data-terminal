import { createResourceRequest } from './resource-request.js';
import { decodeWorkbenchContext } from './workbench-context.js';

// These are transport aliases of byte-for-byte equal public projections.
// The catalog, family validation and query engine still consume their original shapes.
export const BROWSE_REFERENCES = Object.freeze([
  ['sample.brands', 'brands'],
  ...['admissions', 'core', 'presentation', 'runtime'].map(name => [`populationContract.${name}.workIds`, '@workIds'])
]);
const owner = (object, path) => {
  const keys = path.split('.'), key = keys.pop();
  for (const name of keys) object = object?.[name];
  if (!object || typeof object !== 'object') throw Error('浏览启动引用无效');
  return [object, key];
};
export function restoreBrowseStartup(value) {
  if (value?.schema !== 'galpedia-work-browse-v1' || !value.uiSummary || !Array.isArray(value.references)
      || value.references.length > BROWSE_REFERENCES.length) throw Error('浏览启动格式无效');
  const uiData = decodeWorkbenchContext(value.uiData, value.uiSummary.workIds.map(workId => ({workId})));
  const seen = new Set();
  for (const index of value.references) {
    if (!Number.isSafeInteger(index) || !BROWSE_REFERENCES[index] || seen.has(index)) throw Error('浏览启动引用重复或越界');
    seen.add(index);
    const [target, source] = BROWSE_REFERENCES[index], [object, key] = owner(uiData, target);
    if (Object.hasOwn(object, key)) throw Error('浏览启动引用冲突');
    const [sourceObject, sourceKey] = source === '@workIds' ? [value.uiSummary, 'workIds'] : owner(uiData, source);
    if (!Array.isArray(sourceObject[sourceKey])) throw Error('浏览启动引用来源无效');
    object[key] = sourceObject[sourceKey];
  }
  if (Object.hasOwn(uiData, 'confirmedBangumiImportBindings') || Object.hasOwn(uiData, 'bangumiPublicBindings')) throw Error('浏览启动重复包含导入映射');
  return {uiData, uiSummary:value.uiSummary};
}

export function createBrowseStartupData({config, fetchImpl=globalThis.fetch, cryptoRef=globalThis.crypto,
  decompress=globalThis.DecompressionStream, requestPolicy={}}) {
  const request = createResourceRequest({...requestPolicy, fetchImpl});
  const cache = new Map();
  let startupPromise;
  async function read(kind) {
    if (!['startup', 'bindings'].includes(kind)) throw Error('浏览资源类别无效');
    if (cache.has(kind)) return cache.get(kind);
    const descriptor = config[kind];
    if (descriptor?.path !== `${kind}.json.gz` || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 ?? '')
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1 || descriptor.bytes > 4*1024*1024
        || !Number.isSafeInteger(descriptor.rawBytes) || descriptor.rawBytes < 1 || descriptor.rawBytes > 16*1024*1024
        || config.basePath !== '../runtime-data/work-browse-v1/') throw Error('浏览资源描述无效');
    const pending = request(new URL(config.basePath+descriptor.path, import.meta.url), {
      label:'作品浏览资料', validationKey:descriptor.sha256,
      validate:async bytes => {
        const digest = Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)), n=>n.toString(16).padStart(2,'0')).join('');
        if (bytes.byteLength !== descriptor.bytes || digest !== descriptor.sha256) throw Error('浏览资源摘要不符');
        const reader = new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader();
        const chunks=[]; let length=0;
        try { for (;;) { const {value,done}=await reader.read(); if(done)break;
          length+=value.byteLength; if(length>descriptor.rawBytes)throw Error('浏览资源解压超过预算'); chunks.push(value);
        }} finally { await reader.cancel().catch(()=>{}); }
        if(length!==descriptor.rawBytes)throw Error('浏览资源解压长度不符');
        const raw=new Uint8Array(length);let offset=0;
        for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
        const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
        if(value.schema!=='galpedia-work-browse-v1' || value.kind!==kind
            || value.sourceStartupSha256!==config.sourceStartupSha256)throw Error('浏览资源来源不符');
        return value;
      }
    }).catch(error=>{cache.delete(kind);throw error;});
    cache.set(kind,pending);return pending;
  }
  return Object.freeze({
    startup(){return startupPromise ??= read('startup').then(restoreBrowseStartup)
      .catch(error=>{startupPromise=null;cache.delete('startup');throw error;});},
    async bindings(){const value=await read('bindings');
      if(!Array.isArray(value.bindings)||value.bindings.length!==config.bindingCount)throw Error('导入映射数量不符');
      return value.bindings;
    }
  });
}

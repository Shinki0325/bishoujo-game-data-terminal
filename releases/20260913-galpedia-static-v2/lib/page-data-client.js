import { createResourceRequest } from './resource-request.js';
import { STATIC_DETAIL_INDEX } from './static-detail-index-config.js';

export function createPageDataClient({ baseUrl = new URL(STATIC_DETAIL_INDEX.basePath, import.meta.url), dataRevision = STATIC_DETAIL_INDEX.dataRevision, indexDescriptor = STATIC_DETAIL_INDEX.index, fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto, decompress = globalThis.DecompressionStream, requestPolicy = {}, maxCacheBytes = 32 * 1024 * 1024 } = {}) {
  baseUrl = new URL(baseUrl);
  const request = createResourceRequest({ ...requestPolicy, fetchImpl });
  const cache = new Map();
  let cacheBytes = 0;
  const forget = key => { const old = cache.get(key); if (old) cacheBytes -= old.bytes; cache.delete(key); };
  let indexPromise;
  const routePromises = new Map();
  async function pinnedJson(bytes, descriptor) {
    if (descriptor) {
      if (bytes.byteLength !== descriptor.bytes || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 ?? '')) throw Error('static index descriptor invalid');
      const sha = Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
      if(sha !== descriptor.sha256) throw Error('static index digest mismatch');
    }
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes));
  }
  async function loadIndex() {
    if (!indexPromise) indexPromise = (async () => {
      return request(new URL('details-index.json', baseUrl), { label: '静态详情索引', validationKey: dataRevision ?? '', validate: async bytes => {
        const value = await pinnedJson(bytes,indexDescriptor);
        if (!['galpedia-static-detail-v1','galpedia-static-detail-model-v1'].includes(value?.schemaVersion)
          || !/^[a-f0-9]{64}$/u.test(value.dataRevision ?? '') || (dataRevision && value.dataRevision !== dataRevision)
          || (!value.works && !(value.routeScheme==='sha256-prefix-2' && value.shards)) || Array.isArray(value.works)) throw new Error('static detail index invalid');
        return value;
      }});
    })().catch(error => { indexPromise = null; throw error; });
    return indexPromise;
  }
  async function getWorkDetail(workId) {
    const key = String(workId);
    const index = await loadIndex();
    let routeIndex=index;
    if(index.routeScheme==='sha256-prefix-2') {
      const prefix=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',new TextEncoder().encode(key))),b=>b.toString(16).padStart(2,'0')).join('').slice(0,2);
      const route=index.shards[prefix];
      if(!route || route.path!==`details/routes/${prefix}.json`) throw Error('static detail route unavailable');
      if(!routePromises.has(prefix))routePromises.set(prefix,request(new URL(route.path,baseUrl),{label:'静态详情定位',validationKey:route.sha256,validate:async bytes=>{
        const value=await pinnedJson(bytes,route);
        if(value.dataRevision!==index.dataRevision||value.schemaVersion!==index.schemaVersion||!value.works)throw Error('static detail route mismatch');
        return value;
      }}).catch(error=>{routePromises.delete(prefix);throw error;}));
      routeIndex=await routePromises.get(prefix);
      while(routePromises.size>16)routePromises.delete(routePromises.keys().next().value);
    }
    const descriptor = routeIndex.works?.[key];
    const relative = descriptor?.path;
    if (!relative) throw new Error(`static detail unavailable: ${key}`);
    if (/[\\?#]/u.test(relative) || relative.split('/').some(part => part === '..' || part === '.')
      || relative.startsWith('/') || /^[a-z]+:/iu.test(relative)) throw new Error('static detail path invalid');
    const prefix = `data/${index.dataRevision}/`;
    const url = new URL(relative.startsWith(prefix) ? relative.slice(prefix.length) : relative, baseUrl);
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) throw new Error('static detail path out of scope');
    if (!cache.has(url.href)) {
      const entry = { bytes: 0, promise: null };
      entry.promise = request(url, { label: '静态详情', validationKey: `${index.dataRevision}:${key}:${descriptor.sha256}`, validate: async bytes => {
        if (!Number.isSafeInteger(descriptor.bytes) || descriptor.bytes !== bytes.byteLength || !/^[a-f0-9]{64}$/u.test(descriptor.sha256 ?? '')) throw new Error('static detail length or digest invalid');
        const sha = Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
        if (sha !== descriptor.sha256) throw new Error('static detail digest mismatch');
        if(index.compression==='gzip'&&descriptor.compression!=='gzip')throw Error('static detail compression mismatch');
        if(descriptor.compression!==undefined&&descriptor.compression!=='gzip')throw Error('static detail compression unsupported');
        let raw=bytes;
        if(descriptor.compression==='gzip') {
          if(!Number.isSafeInteger(descriptor.rawBytes)||descriptor.rawBytes<1||descriptor.rawBytes>16*1024*1024
            ||!/^[a-f0-9]{64}$/u.test(descriptor.rawSha256??'')||typeof decompress!=='function')throw Error('static detail decompression budget invalid');
          const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let size=0;
          try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>descriptor.rawBytes)throw Error('static detail decompression budget exceeded');chunks.push(value);}
            if(size!==descriptor.rawBytes)throw Error('static detail decompression length mismatch');
          }finally{await reader.cancel().catch(()=>{});}
          raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
          const rawSha=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',raw)),b=>b.toString(16).padStart(2,'0')).join('');
          if(rawSha!==descriptor.rawSha256)throw Error('static detail original digest mismatch');
        }
        const payload = JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(raw));
        if (payload.dataRevision !== index.dataRevision || payload.workId !== key || payload.schemaVersion !== index.schemaVersion) throw new Error('static detail identity or revision mismatch');
        entry.bytes = raw.byteLength;
        return payload;
      }}).then(value => {
        cacheBytes += entry.bytes;
        for (const [oldKey, old] of cache) { if(cacheBytes <= maxCacheBytes) break; if(old.bytes) forget(oldKey); }
        return value;
      }).catch(error => { forget(url.href); throw error; });
      cache.set(url.href, entry);
    }
    const entry = cache.get(url.href); cache.delete(url.href); cache.set(url.href,entry);
    return entry.promise;
  }
  return Object.freeze({ getWorkDetail });
}

export function createStaticSiteDataClient({ baseUrl = new URL('../static-site-data-v1/', import.meta.url), dataRevision } = {}) {
  let manifestPromise;
  const cache = new Map();
  async function manifest() {
    if (!manifestPromise) manifestPromise = fetch(new URL('data-manifest.json', baseUrl), { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`static site manifest request failed: ${response.status}`);
      const value = await response.json();
      if (value?.schemaVersion !== 'galpedia-static-site-v1' || (dataRevision && value.dataRevision !== dataRevision)) throw new Error('static site revision mismatch');
      return value;
    }).catch(error => { manifestPromise = null; throw error; });
    return manifestPromise;
  }
  async function read(relative) {
    const site = await manifest();
    const path = relative.replace(/^data\/[^/]+\//u, '');
    const url = new URL(`data/${site.dataRevision}/${path}`, baseUrl);
    if (!cache.has(url.href)) cache.set(url.href, fetch(url, { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error(`static site data request failed: ${response.status}`);
      const payload = await response.json();
      if (payload.dataRevision !== site.dataRevision) throw new Error('static site payload revision mismatch');
      return payload;
    }).catch(error => { cache.delete(url.href); throw error; }));
    return cache.get(url.href);
  }
  return Object.freeze({
    async getBrowsePage(kind = 'worksDefault', page = 1) {
      const site = await manifest();
      const root = site.browse?.[kind];
      if (!root) throw new Error(`static browse unavailable: ${kind}`);
      return read(`${root}page-${String(page).padStart(4, '0')}.json`);
    },
    async getWorksCore() { return read((await manifest()).query.worksCore); },
    async getWorksNames() { return read((await manifest()).query.worksNames); },
    async getPersonsNames() { return read((await manifest()).query.personsNames); }
    ,async searchWorks(query) {
      const source = String(query ?? '').normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
      if (!source) return [];
      const payload = await this.getWorksCore();
      return (payload.records ?? []).filter(record => [record.workId, record.title, record.displayTitle, record.brandName]
        .some(value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja-JP').includes(source)));
    }
    ,async getPersonsDirectory() {
      const payload = await this.getPersonsNames();
      return payload.records ?? [];
    }
  });
}

import {querySearchService,searchServiceConfig} from './search-service-client.js';
import { PERSON_STATIC } from './person-static-config.js';
import { CREDIT_SCOPE } from './credit-scope-config.js';
import { PERSON_DIRECTORY_PROJECTION } from './person-directory-projection-config.js';
import {createPersonQueryCandidates} from './person-query-candidates.js';
import { filterPersonsBySearch } from './person-search.js';
import { createResourceRequest } from './resource-request.js';

import { personDirectoryRoleCounts, personInDirectoryRole, orderPersonDirectoryRows } from './person-directory-roles.js';
const schema = 'galpedia-person-directory-projection-v1';
export function createPersonDirectoryProjection({ source, fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto,
  config = PERSON_DIRECTORY_PROJECTION } = {}) {
  if (config.source?.roleMembershipVersion !== 6 || config.source?.sha256 !== source.sha256 || config.source?.revision !== source.revision
    || typeof DecompressionStream !== 'function') return null;
  const request = createResourceRequest({ fetchImpl, timeoutMs: 30000, maxAttempts: 1 });
  const hash = async b => [...new Uint8Array(await cryptoRef.subtle.digest('SHA-256', b))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
  const readValue = async d => {
    if (!/^\.\.\/runtime-data\/person-directory-projection-v1\/(?:manifest|index|rows|stats|page|search|postings|query|routing)-[a-f0-9]{64}\.json\.gz$/.test(d?.url ?? '')
      || !/^[a-f0-9]{64}$/.test(d.sha256) || !/^[a-f0-9]{64}$/.test(d.rawSha256)
      || !Number.isSafeInteger(d.bytes) || d.bytes < 1 || d.bytes > 8 * 1024 * 1024
      || !Number.isSafeInteger(d.rawBytes) || d.rawBytes < 1 || d.rawBytes > 24 * 1024 * 1024) throw Error('人物投影描述无效');
    const packed = await request(new URL(d.url, import.meta.url), { label: '人物目录', validationKey: d.sha256 });
    if (packed.byteLength !== d.bytes || await hash(packed) !== d.sha256) throw Error('人物投影摘要不符');
    const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const parts = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > d.rawBytes) throw Error('人物投影解压超限');
        parts.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    if (size !== d.rawBytes) throw Error('人物投影长度不符');
    const raw = new Uint8Array(size); let offset = 0;
    for (const part of parts) { raw.set(part, offset); offset += part.byteLength; }
    if (await hash(raw) !== d.rawSha256) throw Error('人物投影内容不符');
    const value = JSON.parse(new TextDecoder().decode(raw));
    if (value.schema !== schema) throw Error('人物投影格式不符');
    return value;
  };
  // Cache decoded routing/pages as well as browser bytes: returning to a page
  // must not repeat decompression and parsing. Person rows keep their own LRU.
  const decoded=new Map();let decodedBytes=0;
  const read=d=>{
    if(!d?.url||/\/rows-/.test(d.url))return readValue(d);
    const key=d.sha256;
    if(decoded.has(key)){const hit=decoded.get(key);decoded.delete(key);decoded.set(key,hit);return hit.promise;}
    const entry={bytes:0};
    entry.promise=readValue(d).then(v=>{
      entry.bytes=d.rawBytes;decodedBytes+=entry.bytes;
      for(const [oldKey,old] of decoded){if(decodedBytes<=8*1024*1024)break;if(old.bytes){decoded.delete(oldKey);decodedBytes-=old.bytes;}}
      return v;
    }).catch(e=>{decoded.delete(key);throw e;});
    decoded.set(key,entry);return entry.promise;
  };
  const queryCandidates=createPersonQueryCandidates(read);
  let manifestPromise, indexPromise;
  const manifest = () => manifestPromise ??= read(config.manifest).catch(e => { manifestPromise = null; throw e; });
  const index = () => indexPromise ??= manifest().then(async m => {
    const value = await read(m.query);
    if (JSON.stringify(value.columns) !== JSON.stringify(['entityId', 'directoryRole', 'primaryRole', 'searchKey', 'pinyinSearchKey', 'part', 'directoryRoles', 'directoryVocalCount', 'vocalSongCount', 'roleStats'])
      || !Array.isArray(value.rows) || value.rows.length !== m.count) throw Error('人物查询投影不完整');
    const rows = value.rows.map(tuple => Object.fromEntries(value.columns.map((key, i) => [key, tuple[i]])));
    if (new Set(rows.map(r => r.entityId)).size !== m.count || rows.some(r => !/^per_[A-Za-z0-9]+$/.test(r.entityId)
      || typeof r.searchKey !== 'string' || typeof r.pinyinSearchKey !== 'string')) throw Error('人物查询投影身份不符');
    return rows;
  }).catch(e => { indexPromise = null; throw e; });
  const buckets = new Map(); let cacheBytes = 0;
  async function bucket(key, descriptor) {
    if (buckets.has(key)) { const hit = buckets.get(key); buckets.delete(key); buckets.set(key, hit); return hit.promise; }
    const entry = { bytes: 0 };
    entry.promise = read(descriptor).then(v => {
      if (v.bucket !== key || !Array.isArray(v.rows) || new Set(v.rows.map(r => r.entityId)).size !== v.rows.length) throw Error('人物分块身份不符');
      entry.bytes = descriptor.rawBytes; cacheBytes += entry.bytes;
      for (const [oldKey, old] of buckets) {
        if (cacheBytes <= 8 * 1024 * 1024) break;
        if (old.bytes) { buckets.delete(oldKey); cacheBytes -= old.bytes; }
      }
      return new Map(v.rows.map(r => [r.entityId, r]));
    }).catch(e => { buckets.delete(key); throw e; });
    buckets.set(key, entry); return entry.promise;
  }
  const keyFor=async(id,m)=>(parseInt((await hash(new TextEncoder().encode(id))).slice(0,8),16)%(m.bucketCount??1024)).toString(16).padStart(3,'0');
  async function loadBuckets(keys,m){
    if(m.layoutVersion===2){
      if(m.bucketCount!==4096||m.bucketGroupSize!==16)throw Error('人物分片规则不符');
      const groups=[...new Set(keys.map(key=>Math.floor(parseInt(key,16)/16).toString(16).padStart(2,'0')))];
      const routing=new Map(await Promise.all(groups.map(async key=>{
        const value=await read(m.bucketGroups?.[key]);
        if(value.group!==key||!value.buckets)throw Error('人物分片路由不符');
        return [key,value.buckets];
      })));
      return new Map(await Promise.all([...new Set(keys)].map(async key=>[key,await bucket(key,routing.get(Math.floor(parseInt(key,16)/16).toString(16).padStart(2,'0'))?.[key])])));
    }
    return new Map(await Promise.all([...new Set(keys)].map(async key=>[key,await bucket(key,m.buckets[key])])));
  }
  async function pageFile(route,page,m,role){
    if(m.layoutVersion!==2)return route.files[page-1];
    if(page===1)return route.first;
    if(m.pageGroupSize!==32)throw Error('人物分页规则不符');
    const start=Math.floor((page-1)/32)*32,value=await read(route.groups[Math.floor((page-1)/32)]);
    if(value.role!==role||value.start!==start||value.files?.length!==Math.min(32,route.pageCount-start))throw Error('人物分页路由不符');
    return value.files[page-1-start];
  }
  let statsPromise;
  const stats = () => statsPromise ??= manifest().then(m => read(m.vocalStats)).catch(e => {statsPromise = null; throw e;});
  async function getPresentations(ids) {
    const m=await manifest();
    const keys=await Promise.all(ids.map(id=>keyFor(id,m)));
    const loaded=await loadBuckets(keys,m);
    return new Map(ids.map((id,i)=>[id,loaded.get(keys[i]).get(id)?.representativeWorksByRole??{}]));
  }
  return {
    prepare:manifest,
    getPresentations,
    getVocalStats() { return stats().then(v => v.rows); },
    async getPersonStats(id) { id=CREDIT_SCOPE.personRedirects?.[id]??id; const m = await manifest(),key=await keyFor(id,m);return (await loadBuckets([key],m)).get(key).get(id)?.roleStats; },
    getRoleStats() { return stats().then(v => v.roleRows); },
    async getPage(site, { query = '', role = 'all', pageNumber = 1, remoteResult = null } = {}) {
      const pageManifest=await manifest();
      if (!String(query).trim() && pageManifest.pages?.[role]) {
        const route=pageManifest.pages[role],requested=Number.isSafeInteger(Number(pageNumber))&&Number(pageNumber)>0?Number(pageNumber):1;
        const pageCount=pageManifest.layoutVersion===2?route.pageCount:route.files?.length;
        if(pageManifest.count!==site.count||!Number.isSafeInteger(route.count)||route.count<0
          ||pageCount!==Math.max(1,Math.ceil(route.count/site.pageSize)))throw Error('人物浏览页计数不符');
        const page=Math.min(requested,pageCount),value=await read(await pageFile(route,page,pageManifest,role));
        if(value.role!==role||value.pageNumber!==page||!Array.isArray(value.rows)
          ||value.rows.length!==Math.min(site.pageSize,Math.max(0,route.count-(page-1)*site.pageSize))
          ||new Set(value.rows.map(r=>r.entityId)).size!==value.rows.length
          ||value.rows.some(r=>!/^per_[A-Za-z0-9]+$/.test(r.entityId)||!personInDirectoryRole(r,role)))throw Error('人物浏览页身份不符');
        return {persons:structuredClone(value.rows),totalPersonCount:site.count,activityAxis:site.activityAxis,
          remotePage:{pageNumber:page,pageCount,totalCount:route.count,roleCounts:pageManifest.roleCounts,searchCount:site.count}};
      }
      const m=pageManifest;
      if(String(query).trim()&&searchServiceConfig()){
        const result=await (remoteResult??querySearchService('/persons',{q:query,role,page:pageNumber,pageSize:site.pageSize}));
        const ids=result.ids,keys=await Promise.all(ids.map(id=>keyFor(id,m)));
        const loaded=await loadBuckets(keys,m);
        const persons=ids.map((id,i)=>loaded.get(keys[i]).get(id));
        if(persons.some(p=>!p||!personInDirectoryRole(p,role)))throw Error('搜索人物身份不符');
        return {persons,totalPersonCount:site.count,activityAxis:site.activityAxis,remotePage:result.remotePage};
      }
      const rows=await queryCandidates(m,query)??await index();
      if (m.count !== site.count) throw Error('人物投影来源计数不符');
      const searched = filterPersonsBySearch(rows, query), roleCounts = personDirectoryRoleCounts(searched);
      const selected = orderPersonDirectoryRows(searched.filter(r => personInDirectoryRole(r, role)), role);
      const requested = Number.isSafeInteger(Number(pageNumber)) && Number(pageNumber) > 0 ? Number(pageNumber) : 1;
      const pageCount = Math.max(1, Math.ceil(selected.length / site.pageSize)), page = Math.min(requested, pageCount);
      const visible = selected.slice((page - 1) * site.pageSize, page * site.pageSize);
      const keys = await Promise.all(visible.map(r=>keyFor(r.entityId,m)));
      const loaded = await loadBuckets(keys,m);
      const persons = visible.map((r, i) => loaded.get(keys[i]).get(r.entityId));
      if (persons.some(p => !p)) throw Error('人物投影缺少当前页身份');
      return { persons, totalPersonCount: site.count, activityAxis: site.activityAxis,
        remotePage: { pageNumber: page, pageCount, totalCount: selected.length, roleCounts, searchCount: searched.length } };
    }
  };
}

let statsClient;
export const loadPersonRoleStats = id => (statsClient ??= createPersonDirectoryProjection({source:PERSON_STATIC}))?.getPersonStats(id);

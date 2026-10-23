import {loadSearchProjection} from './search-projections.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {WORK_FULL_CARDS} from './work-full-cards-config.js';
import {COMPANY_IDENTITIES} from './company-identity-config.js';
import {PERSON_SEARCH_DIRECTORY} from './person-search-directory-config.js';
import {CREDIT_SCOPE} from './credit-scope-config.js';
import {createGalpediaSearch} from './galpedia-search.js';
import {normalizeLooseSearchText} from './search-normalization.js';
import {PRECOMPUTED_PERSON_SEARCH_KEYS} from './person-search.js';
import {nativeEntryHref} from './native-entry-route.js';

const source={workbench:WORKBENCH_DEMAND.sha256,ratings:WORK_FULL_CARDS.split?.sha256??null,directory:COMPANY_IDENTITIES.sourceDirectorySha256,persons:PERSON_SEARCH_DIRECTORY.sha256,catalog:CREDIT_SCOPE.catalog.sha256};
const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'').toLowerCase();
const bucket=key=>{let h=2166136261;for(const c of key)h=Math.imul(h^c.codePointAt(0),16777619);return (h>>>0)&255;};
let manifest;
const cache=new Map();let bytes=0;
async function read(d){
 if(cache.has(d.sha256)){const v=cache.get(d.sha256);cache.delete(d.sha256);cache.set(d.sha256,v);return v.promise;}
 const entry={size:0,promise:null};
 entry.promise=loadSearchProjection('queryChild',{}, {descriptor:d}).then(value=>{
  if(!value)throw Error('查询分片暂不可用');
  entry.size=d.rawBytes;bytes+=entry.size;
  for(const [key,row]of cache){if(bytes<=8*1024*1024)break;if(row.size){cache.delete(key);bytes-=row.size;}}
  return value;
 }).catch(error=>{cache.delete(d.sha256);throw error;});
 cache.set(d.sha256,entry);return entry.promise;
}
async function limitedMap(items,fn){
 const results=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{for(;;){const i=next++;if(i>=items.length)return;results[i]=await fn(items[i]);}}));return results;
}
export async function searchByQuery(query,{workCandidates=false}={}){
 const q=normalizeLooseSearchText(query);if(!q){if(String(query??'').trim())throw Error('标点查询使用完整检索');return {works:[],companies:[],persons:[]};}
 const m=await (manifest??=loadSearchProjection('query',source).then(m=>{if(m?.schema!==2||m.pageSize!==128||m.postings?.length!==256)throw Error('查询索引不匹配');return m;}).catch(error=>{manifest=null;throw error;}));
 const chars=Array.from(q),width=chars.length>=3&&/^[a-z0-9]+$/.test(q)?3:Math.min(2,chars.length),grams=[...new Set(chars.slice(0,chars.length-width+1).map((_,i)=>chars.slice(i,i+width).join('')))];
 // Up to eight distinct grams keep reads bounded. Intersection can only remove
 // impossible candidates; remaining false positives go through the full matcher.
 const keys=grams.length<=8?grams:Array.from({length:8},(_,i)=>grams[Math.floor(i*(grams.length-1)/7)]);
 const postings=await Promise.all(keys.map(async key=>(await read(m.postings[bucket(key)]))[key]??{}));
 const selected={};
 for(const kind of (workCandidates?['works']:['works','companies','persons','native'])){
  const sets=postings.map(p=>new Set(p[kind]??[]));
  selected[kind]=[...(sets[0]??[])].filter(id=>sets.every(s=>s.has(id))).sort((a,b)=>a-b);
 }
 const sparseKey=keys.filter(key=>m.sparse?.[key]).sort((a,b)=>m.sparse[a].bytes-m.sparse[b].bytes)[0];
 let packedRows=null;
 if(sparseKey){
  const value=await read(m.sparse[sparseKey]);
  if(value.schema!==1||value.key!==sparseKey||!value.rows)throw Error('查询候选包不符');
  packedRows=Object.fromEntries(Object.entries(value.rows).map(([kind,rows])=>[kind,new Map(rows)]));
 }
 async function rows(kind,ids){
  if(packedRows&&ids.every(id=>packedRows[kind]?.has(id)))return ids.map(id=>packedRows[kind].get(id));
  const indexes=[...new Set(ids.map(i=>Math.floor(i/m.pageSize)))];
  const pages=await limitedMap(indexes,async i=>{
   const value=await read(m.pages[m.locations[kind][i]]);
   if(value.kind!==kind||value.start!==i*m.pageSize||!Array.isArray(value.rows))throw Error('查询记录分片不符');return [i,value];
  });
  const map=new Map(pages);
  return ids.map(id=>{const value=map.get(Math.floor(id/m.pageSize))?.rows[id%m.pageSize];if(!value)throw Error('查询记录缺失');return value;});
 }
 // Very broad terms can touch most row pages. Keep the complete packed
 // reader for those queries rather than hundreds of small mobile round trips.
 const pageCount=Object.values(selected).reduce((n,ids)=>n+new Set(ids.map(id=>Math.floor(id/m.pageSize))).size,0);
 if(pageCount>64&&!packedRows)return null;
 const [works,companies=[],persons=[],native=[]]=await Promise.all(Object.keys(selected).map(kind=>rows(kind,selected[kind])));
 const brandIds=[...new Set(works.map(w=>w.brandId))];
 const workCompanies=await rows('workCompanies',brandIds.map(id=>m.companyLocations[id]).filter(Number.isSafeInteger).sort((a,b)=>a-b));
 if(workCandidates)return {works,companies:workCompanies};
 for(const p of persons)if(!p[PRECOMPUTED_PERSON_SEARCH_KEYS])Object.defineProperty(p,PRECOMPUTED_PERSON_SEARCH_KEYS,{value:{searchKey:p.searchKey,pinyinSearchKey:p.pinyinSearchKey}});
 const workSearch=createGalpediaSearch({works,companyDirectory:{companies:workCompanies},loadPersons:async()=>[],sourceOrder:{works:new Map(works.map((w,i)=>[w.workId,selected.works[i]]))}});
 const search=createGalpediaSearch({works:[],companyDirectory:{companies},loadPersons:async()=>persons,
  sourceOrder:{companies:new Map(companies.map((c,i)=>[c.companyId??c.brandId,selected.companies[i]]))},searchWorks:async q=>(await workSearch(q)).works});
 const groups=await search(query),nq=norm(query);
 const matches=native.filter(w=>[w.title,w.originalTitle].some(n=>norm(n).includes(nq)))
  .sort((a,b)=>Number(norm(b.title)===nq)-Number(norm(a.title)===nq)||a.title.localeCompare(b.title,'zh-Hans'))
  .map(w=>({id:w.entityId,name:w.title,href:nativeEntryHref(w.entityId)}));
 return {...groups,works:[...matches,...groups.works].slice(0,5)};
}

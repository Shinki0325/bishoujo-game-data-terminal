// Installed beside the version-bound work card client. One module instance
// belongs to one immutable release; failed loads remain retryable.
import {createResourceRequest} from './resource-request.js';
import {splitWorkCards} from './work-full-cards.js';
import {WORK_FULL_CARDS} from './work-full-cards-config.js';
const ensure=(value,message)=>{if(!value)throw Error(message);};
const keys=['companyOrders','companySummaries','honors'];
const hex=/^[a-f0-9]{64}$/;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);

export function createRatingConsumers({enabled=false,split,fetchImpl=globalThis.fetch,
  cryptoRef=globalThis.crypto,decompress=globalThis.DecompressionStream,requestPolicy={},
  baseUrl=new URL('../runtime-data/',import.meta.url)}={}) {
  const request=createResourceRequest({...requestPolicy,fetchImpl}),cache=new Map();let bindingPending;
  const binding=()=>bindingPending??=(async()=>{
    if(!enabled)return null;
    ensure(split,'缺少同版评分入口');
    const manifest=await split.manifest();if(manifest.legacyQueriesCompatible===true)return null;
    const value=manifest.consumerProjection;
    ensure(object(value)&&value.schema==='galpedia-rating-consumers-v1'
      &&hex.test(value.ratingRevision)&&value.ratingRevision===manifest.ratingRevision
      &&value.queryRatingsSha256===manifest.queryRatings.sha256
      &&Object.keys(value).sort().join(',')===['schema','ratingRevision','queryRatingsSha256',...keys].sort().join(','),
      '会社消费与评分版本不一致');
    for(const key of keys)ensure(value[key]===null||object(value[key]),'消费对象描述缺失');
    return value;
  })().catch(error=>{bindingPending=null;throw error;});
  async function load(name,fallback){
    ensure(keys.includes(name),'未知评分消费家族');
    const b=await binding(),d=b?.[name];if(!d)return typeof fallback==='function'?fallback():fallback;
    if(!cache.has(name)){
      const pending=(async()=>{
        ensure(/^[a-z0-9-]+\.[a-f0-9]{64}\.json\.gz$/.test(d.path)&&hex.test(d.sha256)
          &&d.path.split('.')[1]===d.sha256&&Number.isSafeInteger(d.bytes)&&d.bytes>0&&d.bytes<=8*1024*1024
          &&Number.isSafeInteger(d.rawBytes)&&d.rawBytes>0&&d.rawBytes<=64*1024*1024,'消费对象描述无效');
        return request(new URL('rating-consumers-v1/'+d.path,baseUrl),{label:'评分关联资料',validationKey:d.sha256,validate:async bytes=>{
          const digest=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
          ensure(bytes.byteLength===d.bytes&&digest===d.sha256,'消费对象摘要不符');
          const reader=new Blob([bytes]).stream().pipeThrough(new decompress('gzip')).getReader(),chunks=[];let length=0;
          try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;ensure(length<=d.rawBytes,'消费对象解压超限');chunks.push(value);}}
          finally{await reader.cancel().catch(()=>{});}
          ensure(length===d.rawBytes,'消费对象解压不完整');const raw=new Uint8Array(length);let offset=0;
          for(const part of chunks){raw.set(part,offset);offset+=part.length;}
          const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
          ensure(object(value)&&Object.keys(value).every(k=>!['__proto__','constructor','prototype'].includes(k)),'消费对象结构错误');
          if(name==='honors')ensure(object(value.contract)&&Array.isArray(value.boards)&&object(value.works)&&Array.isArray(value.years),'荣誉对象结构错误');
          return value;
        }});
      })().catch(error=>{cache.delete(name);throw error;});
      cache.set(name,pending);
    }
    return cache.get(name);
  }
  return Object.freeze({
    async companySummaries(payload){
      const changes=await load('companySummaries',null);if(!changes)return payload;
      const ids=new Set(payload.companies.map(row=>row.companyId));
      ensure(Object.keys(changes).every(id=>ids.has(id)),'会社统计含未知身份');
      return {...payload,companies:payload.companies.map(row=>{
        const c=changes[row.companyId];if(!c)return row;
        ensure(object(c)&&Object.keys(c).every(k=>['workCount','totalVoteCount','averageVoteCount','releaseYearStart','releaseYearEnd'].includes(k))
          &&Number.isFinite(c.totalVoteCount)&&c.totalVoteCount>=0
          &&(c.averageVoteCount===null||Number.isFinite(c.averageVoteCount)&&c.averageVoteCount>=0),'会社统计无效');
        return {...row,...c};
      })};
    },
    async companyRow(row,id,role){
      const changes=await load('companyOrders',null),change=changes?.[id+':'+role];if(!change)return row;
      const old=row.contract.directory.orders,orders=change.orders;
      ensure(object(orders)&&Object.keys(orders).sort().join(',')===Object.keys(old).sort().join(','),'会社排序字段不符');
      for(const [key,ids]of Object.entries(orders)){
        const allowed=new Set(old[key]);
        ensure(Array.isArray(ids)&&ids.length===allowed.size&&new Set(ids).size===ids.length&&ids.every(id=>allowed.has(id)),'会社排序改变了版本成员');
        if(key.startsWith('releaseDate_'))ensure(JSON.stringify(ids)===JSON.stringify(old[key]),'评分更新改变了发售次序');
      }
      return {...row,contract:{...row.contract,directory:{...row.contract.directory,orders}}};
    },
    honors:fallback=>load('honors',fallback),
    async person(person){
      if(!enabled||!person)return person;
      await binding();const project=await split.queryProjection();
      const update=row=>{
        if(!row||typeof row.workId!=='string'||!['median','voteCount','egsScore'].some(k=>Object.hasOwn(row,k)))return row;
        const next=project({workId:row.workId});
        return {...row,...Object.fromEntries(['median','voteCount','egsScore'].filter(k=>Object.hasOwn(row,k)).map(k=>[k,next[k]]))};
      };
      return {...person,...Object.fromEntries(['representativeWorks','credits'].filter(k=>Array.isArray(person[k])).map(k=>[k,person[k].map(update)]))};
    }
  });
}

// The strict reader is also used by validation. UI consumers keep their
// complete previous projection when an optional update cannot be read.
export function createAvailableRatingConsumers(client,{onStatus=()=>{}}={}){
  const states=new Map();
  const status=(family,stale,error)=>{if(states.get(family)===stale)return;states.set(family,stale);
    try{onStatus({family,stale,error:error?.message??null});}catch{}};
  const keep=async(family,operation,fallback)=>{
    try{const value=await operation();status(family,false);return value;}
    catch(error){status(family,true,error);return typeof fallback==='function'?fallback():fallback;}
  };
  return Object.freeze({
    companySummaries:payload=>keep('companySummaries',()=>client.companySummaries(payload),payload),
    companyRow:(row,id,role)=>keep('companyOrders',()=>client.companyRow(row,id,role),row),
    honors:fallback=>keep('honors',()=>client.honors(fallback),fallback),
    person:person=>keep('person',()=>client.person(person),person),
    scope:(row,id,role,baselineHonors)=>keep('companyScope',async()=>{
      const [next,honors]=await Promise.all([client.companyRow(row,id,role),client.honors(baselineHonors)]);
      return {row:next,honors,stale:false};
    },async()=>({row,honors:await baselineHonors(),stale:true})),
    status:()=>Object.fromEntries(states)
  });
}
function reportStatus(value){
  if(typeof globalThis.dispatchEvent==='function'&&typeof CustomEvent==='function')
    globalThis.dispatchEvent(new CustomEvent('galpedia-rating-availability',{detail:value}));
}
let shared;
const runtime=()=>shared??=createAvailableRatingConsumers(createRatingConsumers({enabled:Boolean(WORK_FULL_CARDS.split?.ratingRevision),split:splitWorkCards(),requestPolicy:{timeoutMs:2500,maxAttempts:1}}),{onStatus:reportStatus});
export const projectCompanySummaries=payload=>runtime().companySummaries(payload);
export const projectCompanyRatingRow=(row,id,role)=>runtime().companyRow(row,id,role);
export const loadRatingHonors=fallback=>runtime().honors(fallback);
export const projectPersonRatings=person=>runtime().person(person);
export const loadCompanyRatingScope=(row,id,role,baselineHonors)=>runtime().scope(row,id,role,baselineHonors);

// Birthday membership is static; only known work vote values follow this session.
export async function projectBirthdayVotes(votes,{split=splitWorkCards()}={}) {
  try {
    if(!split?.queryRawProjection)return votes;
    const raw=await split.queryRawProjection(),next={...votes};
    for(const id of Object.keys(next)) {
      const value=raw(id)?.bangumi;
      if(value)next[id]=value.voteCount;
    }
    return next;
  } catch { return votes; }
}

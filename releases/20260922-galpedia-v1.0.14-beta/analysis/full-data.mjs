import {analyze,configureFields,sanitize,FIELDS,analysisGrain} from './model.mjs';
import {characterRows} from './character-rows.mjs';
import {beginStartupData} from './startup-data.mjs';
import {groupLabel} from './site-context.mjs';

export const usedFields=s=>[...(s.chart==='matrix'?s.matrixFields:
  s.chart==='scatter'?[s.x,s.y,s.color]:s.chart==='line'?[s.x,s.y,s.seriesField]:
  s.chart==='ecdf'?[s.x,s.seriesField]:s.chart==='histogram'?[s.x]:
  s.chart==='bar'&&s.aggregation==='count'?[s.x]:[s.x,s.y]),...(s.tag?['tags']:[])];
export function requiredPacks(s){return [...new Set(['core',...usedFields(s).map(id=>FIELDS.find(f=>f.id===id)?.pack).filter(Boolean),...(['character','appearance'].includes(analysisGrain(s))?['characters','characterEntities']:[])])];}
export function projectRows(core,packs,s,manifest){
  if(s.sourceContext){
    const ids=new Set(s.sourceContext.workIds),families=new Set(core.filter(r=>ids.has(r.id)).map(r=>r.presentationId));
    const groups=s.sourceContext.groups.map(g=>{const groupIds=new Set(g.workIds);return {...g,families:new Set(core.filter(r=>groupIds.has(r.id)).map(r=>r.presentationId))};});
    core=core.filter(r=>s.grain==='edition'?ids.has(r.id):families.has(r.presentationId)).map(r=>({...r,contextGroup:groups.filter(g=>g.families.has(r.presentationId)).map(g=>groupLabel(g,s.sourceContext.groups))}));
  }
  if(['character','appearance'].includes(analysisGrain(s)))return characterRows(core,packs,s,manifest);
  const active=usedFields(s),charFields=manifest.fields.filter(f=>f.character&&active.includes(f.id));
  let rows=s.grain==='edition'?core:core.filter(r=>r.primary);
  let characterCount=0,excludedFacts=0,scopedFacts=0;
  rows=rows.map(original=>{
    const r={...original};
    if(packs.tags){const t=packs.tags[r.id];if(t)[r.tags,r.genre,r.platform]=t;}
    if(packs.people)Object.assign(r,packs.people.rows[r.id]);
    if(s.grain==='edition'){delete r.developers;delete r.publishers;}
    if(charFields.length){
      const cast=(packs.characters?.[r.id]??[]).filter(c=>s.characterScope==='primary'?c[1]==='primary':s.characterScope==='female'?c[2]==='f':true);
      r.characterCount=cast.length;characterCount+=cast.length;
      r.characterValid={};r.characterExcluded={};
      for(const f of charFields){
        const at=manifest.characterColumns.indexOf(f.id),values=cast.map(c=>c[at]).filter(v=>v!==null&&v!==undefined);
        const invalid=cast.filter(c=>c[manifest.characterColumns.indexOf('invalid')]?.includes(f.id)).length;
        excludedFacts+=invalid;r.characterExcluded[f.id]=invalid;
        scopedFacts+=cast.filter(c=>c[manifest.characterColumns.indexOf('scoped')]?.includes(f.id)).length;
        r.characterValid[f.id]=values.length;
        if(f.type==='category')r[f.id]=[...new Set(values)].map(v=>f.id==='birthdayMonth'?`${v}月`:String(v));
        else{
          values.sort((a,b)=>a-b);const n=values.length;
          r[f.id]=!n?null:s.characterAggregation==='mean'?values.reduce((a,b)=>a+b,0)/n:s.characterAggregation==='max'?values[n-1]:(values[Math.floor((n-1)/2)]+values[Math.ceil((n-1)/2)])/2;
        }
      }
    }
    return r;
  });
  return {rows,summary:{grain:analysisGrain(s),characterCount,excludedFacts,scopedFacts,charFields:charFields.map(f=>f.id)}};
}
export async function fetchPack(manifest,name,base=import.meta.url){
  const d=manifest.packs[name];if(!d)throw Error('数据包不存在：'+name);
  const response=await fetch(new URL(d.path,base),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('资料加载失败，请重试：'+name);
  const packed=await response.arrayBuffer();
  return decodePack(manifest,name,packed);
}
export async function decodePack(manifest,name,packed){
  const d=manifest.packs[name];if(!d)throw Error('数据包不存在：'+name);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',packed)),v=>v.toString(16).padStart(2,'0')).join('');
  if(hash!==d.sha256||packed.byteLength!==d.bytes)throw Error('资料校验失败：'+name);
  const raw=await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  if(raw.byteLength!==d.rawBytes)throw Error('资料不完整：'+name);
  return JSON.parse(new TextDecoder().decode(raw));
}
export class FullEngine{
  constructor(manifest){this.manifest=manifest;this.coreIds=new Set();this.packs={};this.pending={};this.cache=new Map();}
  async load(name){if(this.packs[name])return this.packs[name];return this.pending[name]??=(fetchPack(this.manifest,name).then(p=>this.packs[name]=p).finally(()=>delete this.pending[name]));}
  async run(input){
    const s=sanitize(input),start=performance.now();
    await Promise.all(requiredPacks(s).map(p=>this.load(p)));
    if(!this.coreIds.size)this.coreIds=new Set(this.packs.core.map(r=>r.id));
    if(s.sourceContext&&s.sourceContext.workIds.some(id=>!this.coreIds.has(id)))throw Error('来源包含当前快照没有的作品，请回原页面重新建立分析；未静默删减范围。');
    const {brushEnabled,selectionMode,brushGroup,...computeState}=s,key=JSON.stringify(computeState);
    if(this.cache.has(key)){
      const cached=this.cache.get(key),keys=cached.groups?.map(g=>String(g.key))??(s.chart==='scatter'?cached.points?.map(r=>String(r[s.color]??'')):[])??[];
      if(s.brushGroup&&!keys.includes(s.brushGroup))s.brushGroup='';
      return {...cached,state:s,engine:{cached:true,ms:performance.now()-start,packs:Object.keys(this.packs)}};
    }
    const projected=projectRows(this.packs.core,this.packs,s,this.manifest),result=analyze(projected.rows,s);
    // Coverage shown beside the chart follows the current filters, not the entire catalog.
    const charFields=projected.summary.charFields;
    result.dataSummary={...projected.summary,characterCount:['character','appearance'].includes(analysisGrain(s))?new Set(result.rows.map(r=>r.characterId)).size:result.rows.reduce((n,r)=>n+(r.characterCount??0),0),
      excludedFacts:result.rows.reduce((n,r)=>n+charFields.reduce((m,k)=>m+(r.characterExcluded?.[k]??0),0),0),
      validCharacters:Object.fromEntries(charFields.map(k=>[k,result.rows.reduce((n,r)=>n+(r.characterValid?.[k]??0),0)]))};
    this.cache.set(key,result);const limit=['character','appearance'].includes(analysisGrain(s))?1:3;while(this.cache.size>limit)this.cache.delete(this.cache.keys().next().value);
    return {...result,engine:{cached:false,ms:performance.now()-start,packs:Object.keys(this.packs)}};
  }
}
export class AnalysisClient{
  constructor(manifest,packed){
    this.worker=new Worker(new URL('./full-worker.mjs',import.meta.url),{type:'module'});this.sequence=0;this.calls=new Map();
    this.worker.onmessage=({data})=>{const call=this.calls.get(data.id);if(!call)return;this.calls.delete(data.id);data.error?call.reject(Error(data.error)):call.resolve(data.value);};
    const fail=()=>{for(const call of this.calls.values())call.reject(Error('后台计算中断，请刷新重试。'));this.calls.clear();};
    this.worker.onerror=fail;this.worker.onmessageerror=fail;
    const timeout=setTimeout(()=>{for(const call of this.calls.values())call.reject(Error('数据初始化超时，请重新加载。'));this.calls.clear();this.worker.terminate();},35000);
    this.ready=this.call('init',{manifest,packed},packed?[packed]:[]).finally(()=>clearTimeout(timeout));
  }
  call(type,value,transfer=[]){return new Promise((resolve,reject)=>{const id=++this.sequence;this.calls.set(id,{resolve,reject});this.worker.postMessage({id,type,value},transfer);});}
  async run(s){await this.ready;return this.call('analyze',s);}
}
export async function loadFullData(){
  const {manifest,packed}=await beginStartupData();
  manifest.fields=[...manifest.fields,{id:'contextGroup',label:'来源对比对象',short:'对比对象',group:'会社与制作人员',type:'category',multi:true,source:'来源页面精确作品集合'}];
  configureFields(manifest.fields);const engine=new AnalysisClient(manifest,packed);const rows=await engine.ready;
  return {data:{...manifest,rows},engine};
}

export const CONTEXT_SCHEMA='galpedia-analysis-context-v1';
export const CONTEXT_PREFIX='galpedia-analysis-context:';
export const releaseOf=url=>new URL(url).pathname.match(/\/releases\/([^/]+)\//)?.[1]??'local';
export function validateContext(value){
 if(!value||value.schema!==CONTEXT_SCHEMA||!['analysis','works','return'].includes(value.target)||typeof value.release!=='string')throw Error('分析来源无效，请从原页面重新进入。');
 const ids=value.workIds;if(!Array.isArray(ids)||ids.length>50000||ids.some(id=>typeof id!=='string'||!/^\d{1,8}$/.test(id)))throw Error('作品范围无效。');
 const allowed=new Set(ids);const groups=value.groups??[];if(!Array.isArray(groups)||groups.length>30)throw Error('一次最多比较30个对象，请移除后重试。');
 for(const g of groups)if(!g||!['company','person'].includes(g.kind)||typeof g.id!=='string'||g.id.length>200||typeof g.label!=='string'||g.label.length>240||!Array.isArray(g.workIds)||g.workIds.length>50000||g.workIds.some(id=>!allowed.has(id)))throw Error('比较对象或作品范围无效。');
 if(groups.some(g=>!groupLabel(g,groups).length||groupLabel(g,groups).length>200))throw Error('对比对象名称过长，未截断名单；请减少同名对象后重试。');
 if(typeof value.label!=='string'||value.label.length>300)throw Error('来源名称无效。');
 const back=value.back??null;
 if(back&&(!/^\/#(?:works|work\/|persons|companies|ranking)/.test(back.url)||/[\r\n]/.test(back.url)||back.url.length>2000||!Number.isFinite(back.scroll)))throw Error('返回位置无效。');
 return {...value,workIds:[...new Set(ids)],groups:groups.map(g=>({...g,workIds:[...new Set(g.workIds)]})),back};
}
export function saveContext(value,storage=globalThis.sessionStorage){
 const context=validateContext({...value,schema:CONTEXT_SCHEMA}),token=crypto.randomUUID();
 try{storage.setItem(CONTEXT_PREFIX+token,JSON.stringify(context));}catch{throw Error('本机存储空间不足，未传递任何作品；请减少比较对象后重试。');}return token;
}
export function readContext(token,release,storage=globalThis.sessionStorage){
 if(!/^[a-f0-9-]{36}$/.test(token??''))throw Error('分析链接无效。');
 const raw=storage.getItem(CONTEXT_PREFIX+token);if(!raw)throw Error('这是本机临时分析链接；请在原标签页从作品库重新进入。');
 const value=validateContext(JSON.parse(raw));if(value.release!==release)throw Error('网站资料版本已更新，请从原页面重新建立分析范围。');return value;
}
export function groupLabel(g,groups){return g.label+(groups.filter(v=>v.label===g.label).length>1?'〔'+g.id+'〕':'');}
export function selectedWorkIds(rows){return [...new Set(rows.flatMap(r=>r.workIds??[r.workId??r.id]))];}

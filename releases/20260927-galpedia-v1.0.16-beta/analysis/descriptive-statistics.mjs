import {describe,field} from './model.mjs';

export function numericSummary(values){
  const stats=describe(values);let n=0,mean=0,m2=0;
  for(const value of values){if(!Number.isFinite(value))continue;n++;const delta=value-mean;mean+=delta/n;m2+=delta*(value-mean);}
  return {...stats,total:values.length,missing:values.length-n,sd:n>1?Math.sqrt(Math.max(0,m2/(n-1))):null};
}
export function categoricalSummary(values){
  const counts=new Map();let known=0;
  for(const value of values){
    const keys=[...new Set((Array.isArray(value)?value:[value]).filter(v=>v!==null&&v!==undefined&&v!==''))];
    if(keys.length)known++;
    for(const key of keys)counts.set(key,(counts.get(key)??0)+1);
  }
  const ranked=[...counts].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'zh-CN'));
  return {total:values.length,n:known,missing:values.length-known,distinct:counts.size,mode:ranked[0]?.[0]??null,modeCount:ranked[0]?.[1]??0,tiedModes:ranked.filter(r=>r[1]===ranked[0]?.[1]).length};
}
export function statisticsFields(result){
  const s=result.state;
  const keys=s.chart==='matrix'?s.matrixFields:['scatter','line'].includes(s.chart)?[s.x,s.y]:
    ['histogram','ecdf'].includes(s.chart)?[s.x]:s.chart==='bar'&&s.aggregation==='count'?[s.x]:[s.y];
  return [...new Set(keys)].filter(key=>field(key));
}
export function statisticsRows(result){
  if(!result.groups||result.categoryDistribution||result.state.chart==='bar'&&result.state.aggregation==='count')return result.rows;
  const ids=new Set(result.groups.flatMap(g=>g.memberIds??g.ids));
  return result.rows.filter(r=>ids.has(r.id));
}
export const statisticFormat=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
export const numericColumns=['有效数','缺失数','均值','中位数','标准差','最小值','下四分位','上四分位','最大值'];
export const numericValues=s=>[s.n,s.missing,s.mean,s.median,s.sd,s.min,s.q1,s.q3,s.max];

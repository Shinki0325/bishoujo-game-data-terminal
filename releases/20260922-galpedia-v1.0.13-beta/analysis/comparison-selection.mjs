export const MAX_COMPARISON_GROUPS=30;
export function comparisonKeys(keys){
  const clean=[...new Set(keys.filter(k=>typeof k==='string'&&k.length>0&&k.length<=200))];
  if(clean.length>MAX_COMPARISON_GROUPS)throw new RangeError(`最多比较 ${MAX_COMPARISON_GROUPS} 组，当前名单有 ${clean.length} 组。请减少后重试；名单未截断。`);
  return clean;
}
const normalized=s=>s.normalize('NFKC').trim().toLocaleLowerCase();
export function parseComparisonList(text,available,current=[]){
  const names=text.split(/[\r\n\t;；]+/).map(s=>s.trim()).filter(Boolean),known=new Set(available),index=new Map();
  for(const key of known){const n=normalized(key);if(!index.has(n))index.set(n,[]);index.get(n).push(key);}
  const keys=[...current],seen=new Set(keys),rows=[];
  for(const name of names){const matches=known.has(name)?[name]:index.get(normalized(name))??[];
    if(matches.length!==1){rows.push({name,status:matches.length?'ambiguous':'missing',matches});continue;}
    const key=matches[0],duplicate=seen.has(key);rows.push({name,key,status:duplicate?'duplicate':'add'});if(!duplicate){seen.add(key);keys.push(key);}
  }
  return {rows,keys,added:keys.length-current.length,overflow:keys.length>MAX_COMPARISON_GROUPS};
}

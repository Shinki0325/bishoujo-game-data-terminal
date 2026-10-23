import {normalizeLooseSearchText,normalizeGeneratedPinyinQuery} from './search-normalization.js';

const bucket=key=>{let h=2166136261;for(const c of key)h=Math.imul(h^c.codePointAt(0),16777619);return(h>>>0)&255;};
export function createPersonQueryCandidates(read){
  const cache=new Map();let size=0;
  const cached=d=>{
    if(!cache.has(d.sha256)){
      const entry={job:null,bytes:0};
      entry.job=read(d).then(v=>{
        if(cache.get(d.sha256)===entry){entry.bytes=d.rawBytes;size+=entry.bytes;
          while(size>8*1024*1024&&cache.size>1){const [key,old]=cache.entries().next().value;cache.delete(key);size-=old.bytes;}}
        return v;
      }).catch(e=>{if(cache.get(d.sha256)===entry)cache.delete(d.sha256);throw e;});
      cache.set(d.sha256,entry);
    }
    return cache.get(d.sha256).job;
  };
  return async(manifest,query)=>{
    const needle=normalizeLooseSearchText(query);
    if(!needle||!manifest.search)return null;
    const m=await cached(manifest.search);
    if(m.sourceSha256!==manifest.query.sha256||m.count!==manifest.count||m.pageSize!==128||m.postings.length!==256)throw Error('人物查询分片来源不符');
    const needles=[...new Set([needle,normalizeGeneratedPinyinQuery(query)].filter(Boolean))];
    const groups=await Promise.all(needles.map(async text=>{
      const chars=Array.from(text),width=/^[a-z0-9]+$/.test(text)&&chars.length>=3?3:Math.min(2,chars.length);
      const grams=[...new Set(chars.slice(0,chars.length-width+1).map((_,i)=>chars.slice(i,i+width).join('')))];
      const keys=grams.length<=4?grams:Array.from({length:4},(_,i)=>grams[Math.floor(i*(grams.length-1)/3)]);
      const lists=await Promise.all(keys.map(async key=>(await cached(m.postings[bucket(key)])).keys[key]??[]));
      lists.sort((a,b)=>a.length-b.length);const sets=lists.slice(1).map(a=>new Set(a));
      return(lists[0]??[]).filter(id=>sets.every(s=>s.has(id)));
    }));
    const ids=[...new Set(groups.flat())].sort((a,b)=>a-b),pages=[...new Set(ids.map(i=>Math.floor(i/128)))];
    // Broad one-character queries use the complete index, never truncated results.
    if(pages.length>32)return null;
    const records=new Map(await Promise.all(pages.map(async key=>{
      const value=await cached(m.pages[key]);if(value.start!==key*128||!Array.isArray(value.rows))throw Error('人物查询分片路由不符');
      return[key,value.rows];
    })));
    return ids.map(id=>{const tuple=records.get(Math.floor(id/128))?.[id%128];if(!tuple)throw Error('人物查询记录缺失');return Object.fromEntries(m.columns.map((key,i)=>[key,tuple[i]]));});
  };
}

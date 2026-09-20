import {empiricalCdf} from './statistical-tools.mjs';

export function ranks(values){
  const sorted=values.map((value,i)=>({value,i})).sort((a,b)=>a.value-b.value),out=[];
  for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&sorted[j].value===sorted[i].value)j++;
    for(let k=i;k<j;k++)out[sorted[k].i]=(i+j+1)/2;i=j;}
  return out;
}
export function correlation(rows,x,y,method='spearman'){
  const pairs=rows.filter(r=>Number.isFinite(r[x])&&Number.isFinite(r[y])),n=pairs.length;
  if(n<3)return {n,value:null,reason:'有效版本不足 3 个'};
  let xs=pairs.map(r=>r[x]),ys=pairs.map(r=>r[y]);if(method==='spearman'){xs=ranks(xs);ys=ranks(ys);}
  const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let xx=0,xy=0,yy=0;
  for(let i=0;i<n;i++){const dx=xs[i]-mx,dy=ys[i]-my;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
  return {n,value:xx>0&&yy>0?Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))):null,reason:xx>0&&yy>0?null:'至少一个字段数值完全相同'};
}
export function lowess(rows,xKey,yKey,{logX=false,fraction=.5}={}){
  const samples=rows.filter(r=>Number.isFinite(r[xKey])&&Number.isFinite(r[yKey])&&(!logX||r[xKey]>0))
    .map(r=>({x:logX?Math.log10(r[xKey]):r[xKey],y:r[yKey]})).sort((a,b)=>a.x-b.x),n=samples.length;
  if(n<5||samples[0].x===samples.at(-1).x)return {available:false,method:'lowess',n,reason:'局部趋势至少需要 5 个有效版本，且横轴有变化。'};
  const unique=[...new Set(samples.map(p=>p.x))],lo=unique[0],hi=unique.at(-1),xs=unique.length<=129?unique:Array.from({length:129},(_,i)=>lo+(hi-lo)*i/128);
  const k=Math.min(n,Math.max(3,Math.ceil(n*fraction)));
  const points=xs.map(x=>{
    const distances=samples.map(p=>Math.abs(p.x-x)).sort((a,b)=>a-b),radius=distances[k-1];
    let sw=0,sx=0,sy=0,sxx=0,sxy=0;
    for(const p of samples){const dx=p.x-x,z=radius?Math.abs(dx)/(radius*(1+1e-12)):dx===0?0:2;if(z>=1)continue;
      const w=(1-z**3)**3;sw+=w;sx+=w*dx;sy+=w*p.y;sxx+=w*dx*dx;sxy+=w*dx*p.y;}
    const determinant=sw*sxx-sx*sx;
    const y=determinant>Number.EPSILON*Math.max(1,sw*sxx)?(sy*sxx-sx*sxy)/determinant:sy/sw;
    return {x:logX?10**x:x,y};
  });
  return {available:true,method:'lowess',n,fraction,logX,points};
}
export function marginalBins(rows,key,log=false){
  const values=rows.filter(r=>Number.isFinite(r[key])&&(!log||r[key]>0)).map(r=>({id:r.id,value:log?Math.log10(r[key]):r[key]}));
  if(!values.length)return [];
  let lo=Math.min(...values.map(p=>p.value)),hi=Math.max(...values.map(p=>p.value));if(lo===hi){lo-=.5;hi+=.5;}
  const count=24,width=(hi-lo)/count,bins=Array.from({length:count},(_,i)=>({start:lo+i*width,end:lo+(i+1)*width,count:0,ids:[]}));
  for(const p of values){const bin=bins[Math.min(count-1,Math.max(0,Math.floor((p.value-lo)/width)))];bin.count++;bin.ids.push(p.id);}
  return bins.map(b=>({...b,start:log?10**b.start:b.start,end:log?10**b.end:b.end}));
}
export function comparisonSeries(groups,rows,state,describe){
  const lookup=new Map(rows.map(r=>[r.id,r]));
  return groups.map(g=>{
    const members=g.ids.map(id=>lookup.get(id)).filter(Boolean);
    if(state.chart==='ecdf')return {...g,cdf:empiricalCdf(members.map(r=>r[state.x]))};
    const valid=members.filter(r=>Number.isFinite(r[state.x])&&Number.isFinite(r[state.y]));
    if(state.lineUnit==='edition')return {...g,points:valid.map(r=>{
      let x=r[state.x];if(state.x==='year'&&r.date){const time=Date.parse(r.date),start=Date.UTC(r.year,0,1),end=Date.UTC(r.year+1,0,1);if(Number.isFinite(time))x=r.year+(time-start)/(end-start);}
      return {x,y:r[state.y],n:1,ids:[r.id],label:r.title+' · '+(r.date??'')};
    }).sort((a,b)=>a.x-b.x||a.ids[0].localeCompare(b.ids[0]))};
    const buckets=new Map();for(const r of valid){const x=r[state.x];if(!buckets.has(x))buckets.set(x,[]);buckets.get(x).push(r);}
    return {...g,points:[...buckets].sort((a,b)=>a[0]-b[0]).map(([x,list])=>({x,y:describe(list.map(r=>r[state.y]))[state.aggregation==='mean'?'mean':'median'],n:list.length,ids:list.map(r=>r.id),label:String(x)}))};
  });
}
export function mergeSelection(current,incoming,mode='replace'){
  if(mode==='replace')return new Set(incoming);
  const next=new Set(current);for(const id of incoming)if(mode==='subtract')next.delete(id);else next.add(id);return next;
}

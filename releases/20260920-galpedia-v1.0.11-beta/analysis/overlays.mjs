import {lowess} from './exploration.mjs';
import {empiricalCdf,jointDensity} from './statistical-tools.mjs';
// Dependency-free OLS and univariate Gaussian KDE; method references are in the report.
export function linearFit(rows,xKey,yKey,logX=false){
  const points=rows.filter(r=>Number.isFinite(r[xKey])&&Number.isFinite(r[yKey])&&(!logX||r[xKey]>0))
    .map(r=>({x:logX?Math.log10(r[xKey]):r[xKey],y:r[yKey]}));
  const n=points.length;if(n<3)return {available:false,n,reason:'至少需要 3 个有效版本才能拟合。'};
  const meanX=points.reduce((sum,p)=>sum+p.x,0)/n,meanY=points.reduce((sum,p)=>sum+p.y,0)/n;
  let xx=0,xy=0,yy=0;for(const p of points){const x=p.x-meanX,y=p.y-meanY;xx+=x*x;xy+=x*y;yy+=y*y;}
  if(!(xx>0))return {available:false,n,reason:'横轴数值完全相同，无法拟合斜率。'};
  const slope=xy/xx,intercept=meanY-slope*meanX,min=Math.min(...points.map(p=>p.x)),max=Math.max(...points.map(p=>p.x));
  return {available:true,n,logX,slope,intercept,meanX,meanY,rSquared:yy>0?Math.max(0,Math.min(1,xy*xy/(xx*yy))):null,
    points:[min,max].map(x=>({x:logX?10**x:x,y:meanY+slope*(x-meanX)}))};
}
function quantile(sorted,p){const h=(sorted.length-1)*p,i=Math.floor(h);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(h-i);}
export function gaussianKde(values,{bounds,scale=1,minPoints=129}={}){
  const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b),n=sorted.length;
  if(n<3)return {available:false,n,reason:'少于 3 个有效版本'};
  const mean=sorted.reduce((a,b)=>a+b,0)/n,sd=Math.sqrt(sorted.reduce((sum,v)=>sum+(v-mean)**2,0)/(n-1));
  if(!(sd>0))return {available:false,n,reason:'数值完全相同'};
  const robust=(quantile(sorted,.75)-quantile(sorted,.25))/1.349;
  // If IQR is zero but the sample varies, fall back to SD instead of inventing zero bandwidth.
  const bandwidth=.9*(robust>0?Math.min(sd,robust):sd)*n**(-.2)*scale;
  const domain=bounds??[sorted[0]-4*bandwidth,sorted.at(-1)+4*bandwidth];
  const lo=domain[0],hi=domain[1];
  if(!(bandwidth>0)||!Number.isFinite(bandwidth)||!(hi>lo))return {available:false,n,reason:'无法确定有效平滑范围'};
  // Repeated public integer/half-score values are evaluated once with their multiplicity.
  const frequency=new Map();for(const value of sorted)frequency.set(value,(frequency.get(value)??0)+1);
  const entries=[...frequency],count=Math.min(513,Math.max(129,Math.min(513,Math.ceil(Number(minPoints)||129)),Math.ceil((hi-lo)/bandwidth*4)+1));
  const points=Array.from({length:count},(_,i)=>{
    const value=lo+(hi-lo)*i/(count-1);let sum=0;
    for(const [sample,weight] of entries){const z=(value-sample)/bandwidth;sum+=weight*Math.exp(-.5*z*z);}
    return {value,pdf:sum/(n*bandwidth*Math.sqrt(2*Math.PI))};
  });
  return {available:true,n,bandwidth,bounds:[lo,hi],points,maxPdf:Math.max(...points.map(p=>p.pdf))};
}
export function buildOverlays(result,metricRange){
  const s=result.state;
  const fit=()=>s.trendMethod==='lowess'?lowess(result.points,s.x,s.y,{logX:s.logX,fraction:s.lowessFraction}):linearFit(result.points,s.x,s.y,s.logX);
  if(s.chart==='scatter'&&s.scatterDensity)return {kind:'scatter-layers',
    fit:s.trendLine?fit():null,
    density:jointDensity(result.points,s.x,s.y,{logX:s.logX,scale:s.smoothing})};
  if(s.chart==='scatter'&&s.trendLine)return {kind:'regression',fit:fit()};
  if(s.chart==='histogram'&&s.cumulativeCurve){
    const curve=s.densityCurve?gaussianKde(result.rows.map(r=>r[s.x]),{bounds:metricRange,scale:s.smoothing}):null;
    return {kind:'histogram-layers',curve,cdf:empiricalCdf(result.rows.map(r=>r[s.x])),
      maxCount:curve?.available?curve.maxPdf*curve.n*result.actualBinWidth:0};
  }
  if(!s.densityCurve||!['histogram','density','box'].includes(s.chart))return null;
  if(s.chart==='histogram'){
    const curve=gaussianKde(result.rows.map(r=>r[s.x]),{bounds:metricRange,scale:s.smoothing});
    return {kind:'histogram-kde',curve,maxCount:curve.available?curve.maxPdf*curve.n*result.actualBinWidth:0};
  }
  const lookup=new Map(result.rows.map(r=>[r.id,r[s.y]]));
  const curves=result.groups.map(g=>({key:g.key,...gaussianKde(g.ids.map(id=>lookup.get(id)),{bounds:metricRange,scale:s.smoothing})}));
  const countScale=s.chart==='density'&&s.intensity==='count';
  const maxDensity=Math.max(0,...curves.filter(c=>c.available).map(c=>c.maxPdf*(countScale?c.n:1)));
  return {kind:'group-kde',curves,countScale,maxDensity};
}

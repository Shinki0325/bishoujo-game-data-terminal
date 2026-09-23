// Gaussian-kernel distribution estimate, computed from frequency-weighted ECDF knots.
// Kept separate from the empirical curve and all record identities.
export function normalCdf(z){
  if(z===0)return .5;if(z>=9)return 1;if(z<=-9)return 0;
  const t=1/(1+.2316419*Math.abs(z));
  const tail=Math.exp(-z*z/2)/Math.sqrt(2*Math.PI)*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));
  return z>0?1-tail:tail;
}
export function kernelCdf(curve,{scale=2,bounds}={}){
  const {n,points}=curve;if(n<3||points.length<2)return {available:false,n,reason:'样本不足或数值完全相同'};
  const at=rank=>{let lo=0,hi=points.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(points[mid].cumulative>rank)hi=mid;else lo=mid+1;}return points[lo].value;};
  const quantile=p=>{const rank=(n-1)*p,i=Math.floor(rank);return at(i)+(at(Math.min(n-1,i+1))-at(i))*(rank-i);};
  const mean=points.reduce((sum,p)=>sum+p.value*p.count,0)/n,sd=Math.sqrt(points.reduce((sum,p)=>sum+(p.value-mean)**2*p.count,0)/(n-1));
  const iqr=(quantile(.75)-quantile(.25))/1.349,bandwidth=.9*(iqr>0?Math.min(sd,iqr):sd)*n**(-.2)*scale;
  if(!(bandwidth>0)||!Number.isFinite(bandwidth))return {available:false,n,reason:'无法确定平滑范围'};
  const [lo,hi]=bounds??[points[0].value-6*bandwidth,points.at(-1).value+6*bandwidth];
  if(!(hi>lo))return {available:false,n,reason:'无有效范围'};
  const raw=x=>points.reduce((sum,p)=>sum+p.count*normalCdf((x-p.value)/bandwidth),0)/n;
  const offset=bounds?raw(lo):0,mass=bounds?raw(hi)-offset:1;
  if(!(mass>0))return {available:false,n,reason:'无有效概率质量'};
  // Uniform coverage plus quantile-local knots keep dense regions resolved even with remote outliers.
  const grid=new Set([lo,hi]);
  for(let i=0;i<=256;i++)grid.add(lo+(hi-lo)*i/256);
  for(let i=0;i<=128;i++){const center=quantile(i/128);for(const k of [-4,-2,-1,0,1,2,4]){const x=center+k*bandwidth;if(x>lo&&x<hi)grid.add(x);}}
  const estimate=[...grid].sort((a,b)=>a-b).map(value=>({value,proportion:Math.max(0,Math.min(1,(raw(value)-offset)/mass))}));
  return {available:true,n,bandwidth,bounds:[lo,hi],bounded:!!bounds,points:estimate};
}

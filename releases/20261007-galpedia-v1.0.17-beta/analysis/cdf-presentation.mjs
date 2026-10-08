import {cdfAt} from './statistical-tools.mjs';
// Shape-preserving cubic Hermite interpolation of cumulative observation knots.
// Real cumulative counts stay in empiricalCdf; never replace them with this display estimate.
const cache=new WeakMap();
export function cdfTangents(curve){
  if(cache.has(curve))return cache.get(curve);
  const p=curve.points,n=p.length;if(n<3)return null;
  const h=p.slice(1).map((v,i)=>v.value-p[i].value),d=h.map((v,i)=>(p[i+1].proportion-p[i].proportion)/v);
  if(h.some(v=>!(v>0))||d.some(v=>!Number.isFinite(v)||v<0))return null;
  const edge=(h0,h1,d0,d1)=>{const m=((2*h0+h1)*d0-h0*d1)/(h0+h1);return m*d0<=0?0:Math.min(m,3*d0);};
  const slopes=[edge(h[0],h[1],d[0],d[1])];
  for(let i=1;i<n-1;i++){const a=d[i-1],b=d[i],w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];slopes.push(a&&b?(w1+w2)/(w1/a+w2/b):0);}
  slopes.push(edge(h.at(-1),h.at(-2),d.at(-1),d.at(-2)));cache.set(curve,slopes);return slopes;
}
export function cdfDisplayAt(curve,value,style='step'){
  const slopes=style==='smooth'?cdfTangents(curve):null,p=curve.points;
  if(!slopes||!p.length||value<p[0].value||value>=p.at(-1).value)return cdfAt(curve,value);
  let lo=0,hi=p.length-1;while(lo+1<hi){const mid=(lo+hi)>>1;if(p[mid].value<=value)lo=mid;else hi=mid;}
  const a=p[lo],b=p[hi],h=b.value-a.value,t=(value-a.value)/h;
  const estimate=(2*t**3-3*t*t+1)*a.proportion+(t**3-2*t*t+t)*h*slopes[lo]+(-2*t**3+3*t*t)*b.proportion+(t**3-t*t)*h*slopes[hi];
  return Math.max(a.proportion,Math.min(b.proportion,estimate));
}
export function cdfCanvasPath(curve,style,x,y,left,right){
  if(!curve.points.length)return [];
  const p=curve.points,slopes=style==='smooth'?cdfTangents(curve):null;
  const out=[{x:Math.min(left,x(p[0].value)),y:y(0)}];let previous=0;
  for(let i=0;i<p.length;i++){
    const b=p[i];
    if(slopes&&i){const a=p[i-1],h=(b.value-a.value)/3;out.push({x:x(b.value),y:y(b.proportion),c1:{x:x(a.value+h),y:y(a.proportion+h*slopes[i-1])},c2:{x:x(b.value-h),y:y(b.proportion-h*slopes[i])}});}
    else{out.push({x:x(b.value),y:y(previous)},{x:x(b.value),y:y(b.proportion)});}
    previous=b.proportion;
  }
  out.push({x:Math.max(right,x(p.at(-1).value)),y:y(1)});return out;
}
export function traceCdfPath(ctx,points){
  points.forEach((p,i)=>{if(!i)ctx.moveTo(p.x,p.y);else if(p.c1)ctx.bezierCurveTo(p.c1.x,p.c1.y,p.c2.x,p.c2.y,p.x,p.y);else ctx.lineTo(p.x,p.y);});
}

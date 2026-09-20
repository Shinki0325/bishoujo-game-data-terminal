// Statistical transforms are independent of selection, viewport and Canvas geometry.
export function empiricalCdf(values){
  const frequency=new Map();
  for(const v of values)if(Number.isFinite(v))frequency.set(v,(frequency.get(v)??0)+1);
  const n=[...frequency.values()].reduce((a,b)=>a+b,0);let cumulative=0;
  return {n,points:[...frequency].sort((a,b)=>a[0]-b[0]).map(([value,count])=>{
    cumulative+=count;return {value,count,cumulative,proportion:cumulative/n};
  })};
}
export function cdfAt(curve,value){
  let lo=0,hi=curve.points.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(curve.points[mid].value<=value)lo=mid+1;else hi=mid;}
  return lo?curve.points[lo-1].proportion:0;
}
// Marching squares, with linear edge interpolation and a bilinear saddle decider.
export function contourSegments(xs,ys,grid,level){
  const out=[],nx=xs.length;
  for(let j=0;j<ys.length-1;j++)for(let i=0;i<nx-1;i++){
    const corners=[[xs[i],ys[j]],[xs[i+1],ys[j]],[xs[i+1],ys[j+1]],[xs[i],ys[j+1]]];
    const v=[grid[j*nx+i],grid[j*nx+i+1],grid[(j+1)*nx+i+1],grid[(j+1)*nx+i]];
    const crossings=[];
    for(let e=0;e<4;e++){const next=(e+1)%4;if((v[e]>=level)===(v[next]>=level))continue;
      const f=(level-v[e])/(v[next]-v[e]);crossings.push({edge:e,x:corners[e][0]+f*(corners[next][0]-corners[e][0]),y:corners[e][1]+f*(corners[next][1]-corners[e][1])});
    }
    if(crossings.length===2)out.push(crossings);
    else if(crossings.length===4){
      const q=(v[0]-level)*(v[2]-level)-(v[1]-level)*(v[3]-level);
      for(const [a,b] of q>=0?[[0,1],[2,3]]:[[0,3],[1,2]])out.push([crossings[a],crossings[b]]);
    }
  }
  return out;
}
export function jointDensity(rows,xKey,yKey,{logX=false,scale=1}={}){
  const points=rows.filter(r=>Number.isFinite(r[xKey])&&Number.isFinite(r[yKey])&&(!logX||r[xKey]>0))
    .map(r=>[logX?Math.log10(r[xKey]):r[xKey],r[yKey]]),n=points.length;
  if(n<3)return {available:false,n,reason:'二维密度至少需要 3 个有效版本。'};
  const bandwidth=[0,1].map(axis=>{
    const mean=points.reduce((sum,p)=>sum+p[axis],0)/n;
    return Math.sqrt(points.reduce((sum,p)=>sum+(p[axis]-mean)**2,0)/(n-1))*n**(-1/6)*scale;
  });
  if(bandwidth.some(h=>!(h>0)||!Number.isFinite(h)))return {available:false,n,reason:'一个坐标轴数值完全相同，无法估计二维密度。'};
  const size=129,axes=[0,1].map(axis=>{
    const values=points.map(p=>p[axis]),lo=Math.min(...values)-3*bandwidth[axis],hi=Math.max(...values)+3*bandwidth[axis];
    return Array.from({length:size},(_,i)=>lo+(hi-lo)*i/(size-1));
  });
  // Product Gaussian kernels with Scott's 2D factor; repeated pairs retain their full weight.
  const frequency=new Map();for(const p of points){const key=JSON.stringify(p),old=frequency.get(key);if(old)old.weight++;else frequency.set(key,{p,weight:1});}
  const grid=new Float64Array(size*size),factor=1/(2*Math.PI*n*bandwidth[0]*bandwidth[1]);
  for(const {p,weight} of frequency.values()){
    const kernels=axes.map((axis,k)=>axis.map(v=>Math.exp(-.5*((v-p[k])/bandwidth[k])**2)));
    for(let j=0;j<size;j++){const yw=kernels[1][j]*weight*factor;for(let i=0;i<size;i++)grid[j*size+i]+=kernels[0][i]*yw;}
  }
  const maxDensity=Math.max(...grid),ratios=[.1,.25,.5,.75];
  // Extract in transformed coordinates, then map to original X units for the renderer.
  const contours=ratios.map(ratio=>({ratio,level:ratio*maxDensity,segments:contourSegments(axes[0],axes[1],grid,ratio*maxDensity)
    .map(segment=>segment.map(p=>({x:logX?10**p.x:p.x,y:p.y})))}));
  return {available:true,n,logX,bandwidth,size,maxDensity,contours};
}

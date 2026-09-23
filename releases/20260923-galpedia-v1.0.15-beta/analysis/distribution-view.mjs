// Zoom complete histogram bins; never alter samples, bin membership or denominators.
export function histogramViewport(bins,{mode='auto',bounded=false,calendar=false}={}){
  const total=bins.reduce((n,b)=>n+b.count,0),full=[bins[0]?.start??0,bins.at(-1)?.end??1];
  const plain={available:false,active:false,min:full[0],max:full[1],full,total,outsideCount:0};
  if(bounded||calendar||total<100)return plain;
  let cumulative=0,first=null,last=null;
  for(const bin of bins){cumulative+=bin.count;if(first===null&&cumulative>total*.01)first=bin.start;if(last===null&&cumulative>=total*.99)last=bin.end;}
  if(first===null||last===null||last<=first||(full[1]-full[0])<2*(last-first))return plain;
  const outsideCount=bins.filter(b=>b.end<=first||b.start>=last).reduce((n,b)=>n+b.count,0);
  if(!outsideCount)return plain;
  return {...plain,available:true,active:mode!=='full',min:mode==='full'?full[0]:first,max:mode==='full'?full[1]:last,focus:[first,last],outsideCount};
}
const textOrder=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
export function sortDetailRows(rows,{key,direction=-1},numeric=true){
  const missing=v=>v===null||v===undefined||(numeric&&!Number.isFinite(v));
  return [...rows].sort((a,b)=>{
    const av=a[key],bv=b[key],am=missing(av),bm=missing(bv);
    if(am!==bm)return am?1:-1;
    const difference=am?0:numeric?av-bv:textOrder.compare(String(av),String(bv));
    return direction*difference||textOrder.compare(String(a.id),String(b.id));
  });
}

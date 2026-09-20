import {THEME,seriesColor} from './chart-theme.mjs';
export function drawOverlay(chart){
  const overlay=chart.result.overlay;if(!overlay)return;
  const ctx=chart.ctx,{l,r,t,b}=chart.plot;
  ctx.save();ctx.globalAlpha=1;ctx.beginPath();ctx.rect(l,t,r-l,b-t);ctx.clip();
  const stroke=(points,color,closed=false,dashed=false)=>{
    if(points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return;
    chart.overlayPaths.push({points,color,closed});
    ctx.setLineDash(dashed?[6,4]:[]);
    for(const [lineColor,width] of [['#ffffff',3.6],[color,2]]){
      ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));if(closed)ctx.closePath();
      ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle=lineColor;ctx.lineWidth=width;ctx.stroke();
    }ctx.setLineDash([]);
  };
  if(overlay.kind==='scatter-layers'&&overlay.density.available){
    overlay.density.contours.forEach((contour,i)=>{
      const color=['#85b7b8','#529799','#207578','#084c50'][i];
      // Batch disjoint segments into one path per level to avoid thousands of stroke calls.
      const segments=contour.segments.map(segment=>segment.map(p=>({x:chart.x(p.x),y:chart.y(p.y)})));
      chart.overlayPaths.push({kind:'contour',ratio:contour.ratio,color,segments});
      for(const [lineColor,width] of [['#ffffff99',2.5],[color,1+i*.2]]){
        ctx.strokeStyle=lineColor;ctx.lineWidth=width;ctx.beginPath();
        for(const [a,b] of segments){ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);}ctx.stroke();
      }
    });
  }
  if(['regression','scatter-layers'].includes(overlay.kind)&&overlay.fit?.available){
    stroke(overlay.fit.points.map(p=>({x:chart.x(p.x),y:chart.y(p.y)})),overlay.fit.method==='lowess'?'#2670bb':'#bf682e',false,true);
  }else if(['histogram-kde','histogram-layers'].includes(overlay.kind)&&overlay.curve?.available){
    const factor=overlay.curve.n*chart.result.actualBinWidth;
    stroke(overlay.curve.points.map(p=>({x:chart.x(p.value),y:chart.y(p.pdf*factor)})),'#167a81');
  }else if(overlay.kind==='group-kde'&&overlay.maxDensity>0){
    const groups=chart.displayGroups??chart.result.groups,step=(r-l)/groups.length;
    const curves=new Map(overlay.curves.map(c=>[c.key,c]));
    groups.forEach((group,i)=>{const curve=curves.get(group.key);
      if(!curve?.available)return;
      const center=chart.x(i+.5),factor=(overlay.countScale?curve.n:1)/overlay.maxDensity*step*.34;
      const side=sign=>curve.points.map(p=>({x:center+sign*p.pdf*factor,y:chart.y(p.value)}));
      stroke([...side(1),...side(-1).reverse()],seriesColor(curve.key),true);
    });
  }
  ctx.restore();
  if(overlay.cdf)drawCdf(chart,overlay.cdf,true);
}

export function drawCdf(chart,curve,secondary=false){
  if(!curve.n)return;
  const ctx=chart.ctx,{l,r,t,b}=chart.plot,y=v=>b-v*(b-t),points=[{x:l,y:y(0)}];
  let previous=0;
  for(const p of curve.points){const x=chart.x(p.value);points.push({x,y:y(previous)},{x,y:y(p.proportion)});previous=p.proportion;}
  points.push({x:Math.max(r,points.at(-1).x),y:y(1)});
  // The left endpoint must precede the first sample even when that sample is outside the viewport.
  points[0].x=Math.min(l,points[1].x);
  chart.overlayPaths.push({kind:'ecdf',points,color:'#b13a73'});
  ctx.save();ctx.beginPath();ctx.rect(l,t,r-l,b-t);ctx.clip();
  if(!secondary){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.lineTo(points.at(-1).x,b);ctx.lineTo(points[0].x,b);ctx.closePath();ctx.fillStyle=THEME.cdf+'0b';ctx.fill();}
  for(const [color,width] of [['#ffffff',4.4],['#b13a73',2.2]]){
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }ctx.restore();
  if(secondary){
    ctx.save();ctx.strokeStyle='#dcb6c9';ctx.beginPath();ctx.moveTo(r,t);ctx.lineTo(r,b);ctx.stroke();ctx.fillStyle='#a13068';ctx.textAlign='left';ctx.font='11px "Segoe UI",sans-serif';
    ctx.fillText('累计 %',r-2,t-12);
    for(let i=0;i<=4;i++)ctx.fillText(i*25+'%',r+7,y(i/4)+3);
    ctx.restore();
  }
}

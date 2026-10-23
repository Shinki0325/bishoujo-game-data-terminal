import {field,inScoreView} from './model.mjs';
import {THEME,seriesColor,shortLabel} from './chart-theme.mjs';

// Density coordinates are presentation-only. Selection always resolves to original edition IDs.
export function drawDensityCurves(chart){
  const {ctx,result:r}=chart,s=r.state,curves=r.densityCurves;
  const groups=r.groups,lookup=new Map(r.rows.map(row=>[row.id,row]));
  const rugHeight=groups.length*12;
  const p={l:chart.w<400?48:62,r:chart.w-24,t:39,b:chart.h-55-rugHeight};chart.plot=p;
  let [min,max]=field(s.y).range??chart.domain(groups.flatMap(g=>[g.min,g.max]).filter(Number.isFinite),s.y);
  if(r.view.active)[min,max]=[r.view.min,r.view.max];
  const peak=Math.max(0,...curves.filter(c=>c.available).map(c=>c.maxPdf));
  const raw=(peak||1)*1.12/4,power=10**Math.floor(Math.log10(raw)),tickStep=[1,2,2.5,5,10].find(v=>v*power>=raw)*power,ymax=Math.ceil((peak||1)*1.12/tickStep)*tickStep;
  chart.x=v=>p.l+(v-min)/(max-min)*(p.r-p.l);chart.invertX=x=>min+(x-p.l)/(p.r-p.l)*(max-min);
  chart.y=v=>p.b-v/ymax*(p.b-p.t);chart.brushPoints=[];
  ctx.font=THEME.font;ctx.fillStyle=THEME.muted;ctx.textAlign='left';ctx.fillText('估计密度 · 各组共用刻度',p.l,20);
  for(let i=0;i<=Math.round(ymax/tickStep);i++){
    const value=tickStep*i,y=chart.y(value);ctx.strokeStyle=THEME.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(p.r,y);ctx.stroke();
    ctx.textAlign='right';ctx.fillStyle=THEME.muted;ctx.fillText(value===0?'0':value.toLocaleString('zh-CN',{maximumSignificantDigits:3}),p.l-8,y+4);
  }
  for(let i=0;i<=4;i++){const v=min+(max-min)*i/4;ctx.textAlign='center';ctx.fillText(Number.isInteger(v)?String(v):v.toFixed(1),chart.x(v),p.b+rugHeight+29);}
  for(const [i,g] of groups.entries()){
    const c=curves[i],color=seriesColor(g.key),faded=s.brushGroup&&s.brushGroup!==String(g.key);
    const members=g.ids.map(id=>lookup.get(id)).filter(row=>Number.isFinite(row?.[s.y]));
    const pdf=value=>{if(!c.available)return 0;const index=Math.max(0,Math.min(c.points.length-2,Math.floor((value-c.bounds[0])/(c.bounds[1]-c.bounds[0])*(c.points.length-1))));const a=c.points[index],b=c.points[index+1],t=Math.max(0,Math.min(1,(value-a.value)/(b.value-a.value)));return a.pdf+(b.pdf-a.pdf)*t;};
    ctx.save();ctx.beginPath();ctx.rect(p.l,p.t,p.r-p.l,p.b-p.t);ctx.clip();ctx.globalAlpha=faded?.14:1;
    if(c.available){
      const points=c.points.map(v=>({x:chart.x(v.value),y:chart.y(v.pdf)}));chart.overlayPaths.push({kind:'density-curve',groupKey:String(g.key),points,color});
      ctx.beginPath();points.forEach((v,j)=>j?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.lineTo(points.at(-1).x,p.b);ctx.lineTo(points[0].x,p.b);ctx.closePath();ctx.fillStyle=color+'18';ctx.fill();
      ctx.beginPath();points.forEach((v,j)=>j?ctx.lineTo(v.x,v.y):ctx.moveTo(v.x,v.y));ctx.strokeStyle=color;ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.stroke();
    }
    for(const row of members){if(r.view.active&&!inScoreView(row.median,r.view))continue;const x=chart.x(row[s.y]),y=chart.y(pdf(row[s.y]));if(x<p.l||x>p.r)continue;
      const selected=chart.selected.has(row.id);chart.brushPoints.push({x,y,ids:[row.id],groupKey:String(g.key)});
      if(selected){ctx.fillStyle=color;ctx.strokeStyle='#fff';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();ctx.stroke();}
    }ctx.restore();
    const rugY=p.b+10+i*12;
    ctx.font='10px "Segoe UI", "Microsoft YaHei", sans-serif';ctx.textAlign='right';ctx.fillStyle=color;ctx.fillText(shortLabel(ctx,g.label??g.key,p.l-8),p.l-7,rugY+4);
    const byValue=new Map();for(const row of members){const value=row[s.y];if(r.view.active&&!inScoreView(row.median,r.view))continue;if(!byValue.has(value))byValue.set(value,[]);byValue.get(value).push(row.id);}
    for(const [value,ids] of byValue){const x=chart.x(value);if(x<p.l||x>p.r)continue;const selected=ids.some(id=>chart.selected.has(id));ctx.globalAlpha=faded?.12:chart.selected.size&&!selected?.18:.65;ctx.strokeStyle=color;ctx.lineWidth=selected?2.5:1.5;ctx.beginPath();ctx.moveTo(x,rugY-3);ctx.lineTo(x,rugY+4);ctx.stroke();
      const hit={kind:'point',x,y:rugY,ids,groupKey:String(g.key),text:`${g.label??g.key}\n${field(s.y).short}：${value}\n此分数 ${ids.length} / ${g.n} 个有效记录\n点击查看这些记录；轮廓为平滑估计`};chart.hits.push(hit);chart.brushPoints.push(hit);
    }ctx.globalAlpha=1;
  }
  ctx.textAlign='left';ctx.fillStyle=THEME.muted;ctx.font='11px "Microsoft YaHei",sans-serif';
  const unavailable=curves.filter(c=>!c.available);if(unavailable.length)ctx.fillText(`${unavailable.length} 组无法估计密度，保留原始分数短线`,p.l,chart.h-31);
}

import {field,inScoreView} from './model.mjs';
import {cdfAt} from './statistical-tools.mjs';
import {THEME,seriesColor,shortLabel,chartLabel,correlationColor} from './chart-theme.mjs';
export {SERIES_COLORS} from './chart-theme.mjs';
const label=v=>Number.isInteger(v)?String(v):v.toFixed(1);
const clipped=(ctx,p,fn)=>{ctx.save();ctx.beginPath();ctx.rect(p.l,p.t,p.r-p.l,p.b-p.t);ctx.clip();fn();ctx.restore();};
function ticks(ctx,p,x,y,xmin,xmax,ymin,ymax,ecdf,s){
  ctx.font=THEME.font;ctx.lineWidth=1;ctx.textAlign='right';
  for(let i=0;i<=4;i++){const value=ymin+(ymax-ymin)*i/4,py=y(value);ctx.strokeStyle=THEME.grid;ctx.beginPath();ctx.moveTo(p.l,py);ctx.lineTo(p.r,py);ctx.stroke();ctx.fillStyle=THEME.muted;ctx.fillText(ecdf?Math.round(value*100)+'%':label(value),p.l-8,py+4);}
  ctx.textAlign='center';
  let xticks=Array.from({length:5},(_,i)=>xmin+(xmax-xmin)*i/4);
  if(['year','month'].includes(s.x)&&xmax-xmin>=2){const raw=(xmax-xmin)/6,power=10**Math.floor(Math.log10(Math.max(1,raw))),step=[1,2,5,10].find(v=>v*power>=raw)*power;xticks=[];for(let v=Math.ceil(xmin/step)*step;v<=xmax;v+=step)xticks.push(v);}
  for(const value of xticks){let text=label(value);
    if(s.x==='year'){const yr=Math.floor(value);text=xmax-xmin>=2?String(Math.round(value)):new Date(Date.UTC(yr,0,1)+(value-yr)*(Date.UTC(yr+1,0,1)-Date.UTC(yr,0,1))).toISOString().slice(0,xmax-xmin<.1?10:7);}
    ctx.fillText(text,x(value),p.b+20);
  }
  ctx.fillText(field(s.x).short,(p.l+p.r)/2,p.b+39);
}
export function drawSeries(chart){
  const {ctx,result:r}=chart,s=r.state,ecdf=s.chart==='ecdf',groups=r.series,cols=s.facet&&chart.w>=640?2:1;
  const values=ecdf?groups.flatMap(g=>g.cdf.points.map(p=>p.value)):groups.flatMap(g=>g.points.map(p=>p.x));
  let [xmin,xmax]=chart.domain(values,s.x),[ymin,ymax]=ecdf?[0,1]:chart.domain(groups.flatMap(g=>g.points.map(p=>p.y)),s.y);
  if(!values.length){[xmin,xmax]=field(s.x).range??(s.x==='year'?[s.yearFrom,Math.max(s.yearFrom+1,s.yearTo)]:[0,1]);if(!ecdf)[ymin,ymax]=field(s.y).range??[0,1];}
  if(!ecdf&&values.length&&xmin<xmax){xmin-=(xmax-xmin)*.008;}
  if(r.view.active){if(r.view.axis==='x')[xmin,xmax]=[r.view.min,r.view.max];else[ymin,ymax]=[r.view.min,r.view.max];}
  const panels=s.facet?groups.map((g,i)=>({groups:[g],index:i})): [{groups,index:0}];chart.panels=[];chart.brushPoints=[];
  for(const panel of panels){
    const index=panel.index,width=chart.w/cols,height=s.facet?250:chart.h,ox=(index%cols)*width,oy=s.facet?Math.floor(index/cols)*height:0;
    const p={l:ox+(width<400?60:53),r:ox+width-(!s.facet&&groups.length<=4?(width<500?76:125):22),t:oy+39,b:oy+height-50},x=v=>p.l+(v-xmin)/(xmax-xmin)*(p.r-p.l),y=v=>p.b-(v-ymin)/(ymax-ymin)*(p.b-p.t);
    chart.panels.push({...p,xmin,xmax,groups:panel.groups});if(!index){chart.plot=p;chart.x=x;chart.y=y;chart.invertX=px=>xmin+(px-p.l)/(p.r-p.l)*(xmax-xmin);}
    if(s.facet){ctx.fillStyle='#f8f9fb';ctx.fillRect(ox+8,oy+3,width-16,29);ctx.fillStyle=seriesColor(panel.groups[0].key);ctx.fillRect(ox+8,oy+3,3,29);}
    ticks(ctx,p,x,y,xmin,xmax,ymin,ymax,ecdf,s);ctx.textAlign='left';ctx.fillStyle=THEME.muted;ctx.font='600 12px "Microsoft YaHei",sans-serif';
    ctx.fillText(s.facet?shortLabel(ctx,`${panel.groups[0].label} · n=${panel.groups[0].n}`,p.r-p.l):ecdf?'累计比例 · 每组独立计算':field(s.y).short+' · '+(s.lineUnit==='edition'?'每个点是一部作品':s.aggregation==='mean'?'每个点是组内均值':'每个点是组内中位数'),p.l,oy+20);
    for(const g of panel.groups){const color=seriesColor(g.key),faded=s.brushGroup&&String(g.key)!==s.brushGroup;
      clipped(ctx,p,()=>{ctx.globalAlpha=faded?.22:1;ctx.strokeStyle=color;ctx.lineWidth=2.3;ctx.lineJoin='round';ctx.beginPath();
        if(ecdf){let previous=0;const points=g.cdf.points;if(!points.length)return;ctx.moveTo(Math.min(p.l,x(points[0].value)),y(0));for(const v of points){ctx.lineTo(x(v.value),y(previous));ctx.lineTo(x(v.value),y(v.proportion));previous=v.proportion;}ctx.lineTo(Math.max(p.r,x(points.at(-1).value)),y(1));ctx.stroke();
          const ids=new Set(g.ids);for(const row of r.rows){if(!ids.has(row.id)||!Number.isFinite(row[s.x]))continue;const px=x(row[s.x]),py=y(cdfAt(g.cdf,row[s.x]));if(px>=p.l&&px<=p.r)chart.brushPoints.push({x:px,y:py,ids:[row.id],groupKey:String(g.key)});}
        }else{
          let last;for(const v of g.points){if(!last||s.lineUnit==='year'&&['year','month'].includes(s.x)&&v.x-last.x>1)ctx.moveTo(x(v.x),y(v.y));else ctx.lineTo(x(v.x),y(v.y));last=v;}ctx.stroke();
          for(const v of g.points){const px=x(v.x),py=y(v.y);if(px<p.l||px>p.r||py<p.t||py>p.b)continue;
            const selected=v.ids.some(id=>chart.selected.has(id));ctx.beginPath();ctx.arc(px,py,selected?4.8:s.lineUnit==='edition'?2.5:3.3,0,Math.PI*2);ctx.fillStyle=selected?color:'#ffffff';ctx.fill();ctx.strokeStyle=selected?'#ffffff':color;ctx.lineWidth=selected?1.6:1.8;ctx.stroke();ctx.strokeStyle=color;
            const hit={kind:'point',x:px,y:py,ids:v.ids,groupKey:String(g.key),text:`${g.label}\n${v.label}\n${field(s.y).short}：${label(v.y)} · ${v.n} 个版本\n点击查看这些作品`};chart.hits.push(hit);chart.brushPoints.push(hit);
          }
        }
      });
      if(!ecdf&&!s.facet&&groups.length<=4&&g.points.length){const end=g.points.at(-1),py=y(end.y);if(py>=p.t&&py<=p.b){ctx.font='600 11px "Microsoft YaHei",sans-serif';ctx.fillStyle=color;ctx.textAlign='left';const ly=Math.max(p.t+12,Math.min(p.b-4,py+(groups.indexOf(g)%2?16:-10)));ctx.fillText(shortLabel(ctx,g.label,Math.max(35,ox+width-x(end.x)-12)),x(end.x)+7,ly);}}
      if(!g.n&&s.facet){ctx.fillStyle='#998ca4';ctx.font='12px "Microsoft YaHei",sans-serif';ctx.fillText('当前筛选下没有有效版本',p.l+10,(p.t+p.b)/2);}
    }
    if(ecdf&&s.cdfThreshold>=xmin&&s.cdfThreshold<=xmax){
      const px=x(s.cdfThreshold);ctx.save();ctx.strokeStyle=THEME.context;ctx.lineWidth=1;ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(px,p.t);ctx.lineTo(px,p.b);ctx.stroke();ctx.setLineDash([]);
      chartLabel(ctx,'≤ '+label(s.cdfThreshold),Math.min(p.r-24,Math.max(p.l+24,px)),p.t+15,{color:THEME.muted});
      const marks=panel.groups.filter(g=>g.cdf.n).map(g=>({g,proportion:cdfAt(g.cdf,s.cdfThreshold)})).sort((a,b)=>b.proportion-a.proportion);
      let last=p.t-20;
      for(const [i,m] of marks.entries()){
        const py=y(m.proportion),color=seriesColor(m.g.key);ctx.fillStyle=color;ctx.strokeStyle='white';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(px,py,4,0,Math.PI*2);ctx.fill();ctx.stroke();
        if(!s.facet&&groups.length<=4){const labelY=Math.min(p.b-10-(marks.length-i-1)*34,Math.max(p.t+25,py,last+34));last=labelY;ctx.strokeStyle=color+'60';ctx.lineWidth=.8;ctx.beginPath();ctx.moveTo(px+5,py);ctx.lineTo(p.r+5,labelY-3);ctx.stroke();ctx.textAlign='left';ctx.fillStyle=color;ctx.font='600 11px "Microsoft YaHei",sans-serif';ctx.fillText(shortLabel(ctx,m.g.label,ox+width-p.r-16),p.r+10,labelY-7);ctx.font='600 14px "Segoe UI",sans-serif';ctx.fillText((m.proportion*100).toFixed(1)+'%',p.r+10,labelY+10);}
        else if(s.facet)chartLabel(ctx,(m.proportion*100).toFixed(1)+'%',p.r-5,Math.max(p.t+36,py-9),{color,align:'right'});
      }ctx.restore();
    }
  }
}
export function seriesHit(chart,p){
  const panel=chart.panels?.find(v=>p.x>=v.l&&p.x<=v.r&&p.y>=v.t&&p.y<=v.b);if(!panel)return null;
  const r=chart.result,s=r.state,value=panel.xmin+(p.x-panel.l)/(panel.r-panel.l)*(panel.xmax-panel.xmin);
  let best=null,distance=Infinity;
  for(const g of panel.groups){if(s.brushGroup&&s.brushGroup!==String(g.key)||!g.cdf.n)continue;const proportion=cdfAt(g.cdf,value),dy=Math.abs(p.y-(panel.b-proportion*(panel.b-panel.t)));
    if(dy<distance){const members=new Set(g.ids),ids=r.rows.filter(row=>members.has(row.id)&&Number.isFinite(row[s.x])&&row[s.x]<=value).map(row=>row.id);distance=dy;best={kind:'cdf',ids,text:`${g.label}\n${field(s.x).short} ≤ ${value.toFixed(2)}\n累计 ${ids.length} / ${g.cdf.n} 个版本 · ${(proportion*100).toFixed(1)}%\n点击查看本组对应作品`};}
  }return best;
}
export function drawMatrix(chart){
  const {ctx,result:r}=chart,s=r.state,keys=s.matrixFields,n=keys.length;
  const left=chart.w<420?69:92,t=65,size=Math.min((chart.w-left-16)/n,(chart.h-t-65)/n),l=left+Math.max(0,(chart.w-left-16-n*size)/2);
  chart.plot={l,r:l+n*size,t,b:t+n*size};ctx.font='600 12px "Microsoft YaHei",sans-serif';ctx.fillStyle=THEME.ink;ctx.textAlign='left';ctx.fillText(s.correlationMethod==='pearson'?'线性相关 · Pearson':'排名相关 · Spearman',l,18);
  ctx.font='11px "Microsoft YaHei",sans-serif';ctx.fillStyle=THEME.muted;
  keys.forEach((key,i)=>{ctx.textAlign='center';ctx.fillText(shortLabel(ctx,field(key).short,size-6),l+(i+.5)*size,t-14);ctx.textAlign='right';ctx.fillText(shortLabel(ctx,field(key).short,l-9),l-9,t+(i+.5)*size+4);});
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const cell=r.matrix[j*n+i],p={l:l+i*size+2,r:l+(i+1)*size-2,t:t+j*size+2,b:t+(j+1)*size-2},v=cell.value,diagonal=i===j;
    ctx.fillStyle=diagonal?'#f1f2f5':correlationColor(v);ctx.fillRect(p.l,p.t,p.r-p.l,p.b-p.t);
    const dark=!diagonal&&v!==null&&Math.abs(v)>.68;
    if(s.matrixStyle==='scatter'&&!diagonal){
      const pairs=r.rows.filter(row=>Number.isFinite(row[cell.x])&&Number.isFinite(row[cell.y])),xs=pairs.map(row=>row[cell.x]),ys=pairs.map(row=>row[cell.y]);const [xmin,xmax]=chart.domain(xs,cell.x),[ymin,ymax]=chart.domain(ys,cell.y);
      ctx.fillStyle='#fafbfc';ctx.fillRect(p.l,p.t,p.r-p.l,p.b-p.t);clipped(ctx,p,()=>{ctx.fillStyle=THEME.purple+'30';for(const row of pairs){const x=p.l+5+(row[cell.x]-xmin)/(xmax-xmin)*(size-14),y=p.b-18-(row[cell.y]-ymin)/(ymax-ymin)*(size-27);ctx.fillRect(x,y,1.4,1.4);}});
    }else{
      ctx.textAlign='center';ctx.fillStyle=dark?'#fff':diagonal?THEME.muted:THEME.ink;ctx.font=`600 ${Math.max(13,Math.min(27,size*.24))}px "Segoe UI",sans-serif`;ctx.fillText(v===null?'—':(v>0&&!diagonal?'+':'')+v.toFixed(2),(p.l+p.r)/2,(p.t+p.b)/2+1);
    }
    ctx.textAlign='center';ctx.font='10px "Segoe UI",sans-serif';ctx.fillStyle=s.matrixStyle==='heatmap'&&dark?'#ffffffd9':THEME.muted;ctx.fillText('n='+cell.n,(p.l+p.r)/2,p.b-7);
    chart.hits.push({kind:'rect',left:p.l,right:p.r,top:p.t,bottom:p.b,ids:[],pair:[cell.x,cell.y],text:`${field(cell.x).short} × ${field(cell.y).short}\n${s.correlationMethod==='pearson'?'线性相关':'排名相关'}：${v===null?cell.reason:v.toFixed(3)}\n共同有效版本：${cell.n}\n点击打开散点图`});
  }
  const bottom=chart.plot.b,w=Math.min(220,chart.plot.r-l),gradient=ctx.createLinearGradient(l,0,l+w,0);gradient.addColorStop(0,correlationColor(-1));gradient.addColorStop(.5,correlationColor(0));gradient.addColorStop(1,correlationColor(1));ctx.fillStyle=gradient;ctx.fillRect(l,bottom+19,w,7);
  ctx.font='10px "Microsoft YaHei",sans-serif';ctx.fillStyle=THEME.muted;ctx.textAlign='left';ctx.fillText('−1 反向',l,bottom+42);ctx.textAlign='center';ctx.fillText('0',l+w/2,bottom+42);ctx.textAlign='right';ctx.fillText('+1 同向',l+w,bottom+42);
}
export function drawMarginals(chart){
  const m=chart.result.marginals;if(!m)return;const {ctx,plot:p}=chart;
  for(const [axis,bins] of Object.entries(m)){const max=Math.max(1,...bins.map(b=>b.count));
    for(const bin of bins){if(!bin.count)continue;let left,right,top,bottom;
      if(axis==='x'){left=Math.max(p.l,chart.x(bin.start));right=Math.min(p.r,chart.x(bin.end));top=p.t-11-bin.count/max*43;bottom=p.t-11;}
      else{left=p.r+11;right=left+bin.count/max*43;top=Math.max(p.t,chart.y(bin.end));bottom=Math.min(p.b,chart.y(bin.start));}
      if(right<=left||bottom<=top)continue;const selected=bin.ids.some(id=>chart.selected.has(id));ctx.fillStyle=selected?THEME.teal:THEME.teal+'65';ctx.fillRect(left,top,right-left-.4,bottom-top-.4);
      chart.hits.push({kind:'rect',left,right,top,bottom,ids:bin.ids,text:`${axis==='x'?'横轴':'纵轴'}分布\n${label(bin.start)}–${label(bin.end)}\n${bin.count} 个版本 · 点击查看完整区间`});
    }
  }ctx.font='10px "Microsoft YaHei",sans-serif';ctx.fillStyle='#56858a';ctx.textAlign='left';ctx.fillText('横轴分布 · 数量',p.l,p.t-62);ctx.textAlign='right';ctx.fillText('最高 '+Math.max(0,...m.x.map(bin=>bin.count)),p.r,p.t-62);
}
export function brushIds(chart,a,b){
  const s=chart.result.state,xlo=Math.min(a.x,b.x),xhi=Math.max(a.x,b.x),ylo=Math.min(a.y,b.y),yhi=Math.max(a.y,b.y),ids=[];
  if(chart.result.densityCurves){for(const hit of chart.brushPoints??[])if(hit.x>=xlo&&hit.x<=xhi&&hit.y>=ylo&&hit.y<=yhi&&(!s.brushGroup||hit.groupKey===s.brushGroup))ids.push(...hit.ids);
  }else if(s.chart==='histogram'){
    for(const h of chart.hits)if(h.kind==='rect'&&h.right>=xlo&&h.left<=xhi&&h.bottom>=ylo&&h.top<=yhi)ids.push(...h.ids);
  }else if(['density','box','bar'].includes(s.chart)){
    const r=chart.result,groups=chart.displayGroups??r.groups,step=(chart.plot.r-chart.plot.l)/groups.length,lookup=new Map(r.rows.map(row=>[row.id,row]));
    groups.forEach((g,i)=>{const center=chart.x(i+.5);if(s.brushGroup&&s.brushGroup!==String(g.key)||center+step*.38<xlo||center-step*.38>xhi)return;
      if(s.chart==='bar'){const value=s.aggregation==='count'?g.count:g[s.aggregation];if(chart.y(value)<=yhi&&chart.plot.b>=ylo)ids.push(...g.ids);return;}
      for(const id of g.ids){const row=lookup.get(id),value=row?.[s.y];if(!Number.isFinite(value)||r.view.active&&!inScoreView(row.median,r.view))continue;const y=chart.y(value);if(y>=ylo&&y<=yhi&&y>=chart.plot.t&&y<=chart.plot.b)ids.push(id);}
    });
  }else for(const hit of chart.brushPoints??chart.hits){if(hit.x>=xlo&&hit.x<=xhi&&hit.y>=ylo&&hit.y<=yhi&&(!s.brushGroup||hit.groupKey===s.brushGroup))ids.push(...hit.ids);}
  return [...new Set(ids)];
}

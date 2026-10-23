import {cdfDisplayAt} from './cdf-presentation.mjs';
import {minValue,maxValue} from './numeric-extents.mjs';
import {field,inScoreView,niceWidth,unitLabel} from './model.mjs';
import {drawOverlay,drawCdf} from './overlay-chart.mjs';
import {cdfAt} from './statistical-tools.mjs';
import {drawSeries,drawMatrix,drawMarginals,brushIds,seriesHit,SERIES_COLORS} from './exploration-chart.mjs';
import {THEME,darkTheme,seriesColor,shortLabel,chartLabel,axisTicks,logDomain} from './chart-theme.mjs';
import {drawDensityCurves} from './density-chart.mjs';
const COLORS=SERIES_COLORS;
const integerFormatter=new Intl.NumberFormat('zh-CN');
export const format = v => !Number.isFinite(v)?'—':Math.abs(v)>=10000?(v/10000).toFixed(1)+'万':Number.isInteger(v)?integerFormatter.format(v):v.toFixed(1);
export function densityColor(value,max){
  const t=max>0?Math.max(0,Math.min(1,value/max)):0;
  const stops=darkTheme()?[[37,43,57],[102,77,144],[221,195,246]]:[[247,245,251],[168,143,208],[60,29,112]],n=t<=.5?0:1,u=t<=.5?t*2:(t-.5)*2;
  return 'rgb('+stops[n].map((v,i)=>Math.round(v+(stops[n+1][i]-v)*u)).join(',')+')';
}
export class Chart {
  constructor(canvas,tooltip,onSelect){
    this.canvas=canvas;this.tooltip=tooltip;this.onSelect=onSelect;this.hits=[];this.selected=new Set();
    this.resize=new ResizeObserver(()=>this.draw());this.resize.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown',e=>{if(!this.result||e.button!==0)return;this.start=this.position(e);this.brush=null;this.selectionMode=e.shiftKey?'add':e.altKey?'subtract':this.result.state.selectionMode;canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{
      const p=this.position(e);
      if(this.start&&this.result?.state.brushEnabled&&this.result.state.chart!=='matrix'&&Math.hypot(p.x-this.start.x,p.y-this.start.y)>6){this.brush={a:this.start,b:p};this.tooltip.hidden=true;this.draw();return;}
      this.hover(p);
    });
    canvas.addEventListener('pointerup',e=>{
      if(!this.start)return;const p=this.position(e);
      if(this.brush){const {a,b}=this.brush;const ids=brushIds(this,a,b);if(ids.length)this.onSelect(ids,this.selectionMode);else this.onEmptySelection?.();}
      else{const hit=this.hit(p);if(hit?.pair)this.onInspect?.(hit.pair);else this.onSelect(hit?.ids??[],this.selectionMode);}
      this.start=null;this.brush=null;this.draw();
    });
    canvas.addEventListener('pointercancel',()=>{this.start=null;this.brush=null;this.draw();});
    canvas.addEventListener('pointerleave',()=>{this.tooltip.hidden=true;});
  }
  position(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  set(result,selected){this.result=result;this.selected=selected;this.tooltip.hidden=true;this.draw();}
  hit(p){
    if(this.result?.state.chart==='ecdf'&&this.result.series)return seriesHit(this,p);
    if(this.result?.state.chart==='ecdf'&&this.result.cdf.n){
      const {l,r,t,b}=this.plot;
      if(p.x<l||p.x>r||p.y<t||p.y>b)return null;
      const value=this.invertX(p.x),key=this.result.state.x;
      const ids=this.result.rows.filter(row=>Number.isFinite(row[key])&&row[key]<=value).map(row=>row.id);
      return {kind:'cdf',ids,text:`${field(key).short} ≤ ${value.toLocaleString('zh-CN',{maximumFractionDigits:2})}\n实际累计 ${ids.length.toLocaleString()} / ${this.result.cdf.n.toLocaleString()} 个版本（${(cdfAt(this.result.cdf,value)*100).toFixed(1)}%）\n点击查看小于等于此值的版本`};
    }
    let best=null,d=Infinity;for(const h of this.hits){if(this.result.state.brushGroup&&h.groupKey&&h.groupKey!==this.result.state.brushGroup)continue;if(h.kind==='point'){const n=(p.x-h.x)**2+(p.y-h.y)**2;if(n<64&&n<d){best=h;d=n;}}
    else if(p.x>=h.left&&p.x<=h.right&&p.y>=h.top&&p.y<=h.bottom)best=h;}return best;}
  hover(p){const h=this.hit(p);if(!h){this.tooltip.hidden=true;return;}this.tooltip.textContent=h.text.replaceAll('版本',unitLabel(this.result.state));this.tooltip.hidden=false;
    const width=this.tooltip.offsetWidth,height=this.tooltip.offsetHeight;
    const wrap=this.canvas.parentElement;
    const left=p.x+14+width<=wrap.scrollLeft+wrap.clientWidth-4?p.x+14:p.x-width-14;
    const top=p.y+14+height<=this.h-4?p.y+14:p.y-height-14;
    this.tooltip.style.left=Math.max(wrap.scrollLeft+4,left)+'px';this.tooltip.style.top=Math.max(4,top)+'px';}
  draw(){
    if(!this.result)return;
    this.onBeforeDraw?.(this);
    const s=this.result.state,curveView=!!this.result.densityCurves,grouped=!curveView&&(this.result.categoryDistribution||['box','bar','density'].includes(s.chart)),wrap=this.canvas.parentElement;
    wrap.style.height=curveView?Math.max(wrap.clientWidth<500?310:360,this.result.groups.length*12+270)+'px':s.chart==='matrix'?Math.min(600,Math.max(360,wrap.clientWidth*.72))+'px':this.result.series&&s.facet?Math.max(250,Math.ceil(this.result.series.length/(wrap.clientWidth>=640?2:1))*250)+'px':'';
    this.canvas.dataset.select=String(s.brushEnabled);wrap.classList.toggle('is-grouped',grouped);wrap.classList.toggle('is-density',s.chart==='density'&&!curveView);wrap.classList.toggle('is-density-curve',curveView);
    this.displayGroups=this.groupWindow?this.result.groups.slice(this.groupWindow.start,this.groupWindow.end+1):this.result.groups;
    this.canvas.style.width=(grouped&&!this.groupWindow&&!(s.x==='birthdayMonth'&&(this.result.categoryDistribution||(s.chart==='bar'&&s.aggregation==='count'||this.result.categoryDistribution)))?Math.max(wrap.clientWidth,this.result.groups.length*74+92):wrap.clientWidth)+'px';
    const rect=this.canvas.getBoundingClientRect();if(rect.width<10)return;
    this.w=rect.width;this.h=rect.height;const ratio=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.round(this.w*ratio);this.canvas.height=Math.round(this.h*ratio);
    const ctx=this.canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,this.w,this.h);this.ctx=ctx;this.hits=[];this.overlayPaths=[];this.brushPoints=null;this.panels=null;
    this.plot={l:62,r:this.w-(this.result.overlay?.cdf?54:22),t:grouped&&s.chart!=='bar'?52:32,b:this.h-(grouped?81:49)};
    if(!this.result.plottedCount&&!this.result.groups?.length){this.onDraw?.(this);return;}
    if(curveView){drawDensityCurves(this);this.drawBrush();this.onDraw?.(this);return;}
    if(this.result.series||s.chart==='matrix'){if(s.chart==='matrix')drawMatrix(this);else drawSeries(this);this.drawBrush();this.onDraw?.(this);return;}
    if(this.result.marginals){this.plot.t+=65;this.plot.r-=58;}
    let xmin=0,xmax=1,ymin=0,ymax=100;
    if(s.chart==='scatter'){
      const xs=this.result.points.map(r=>r[s.x]),ys=this.result.points.map(r=>r[s.y]);
      [xmin,xmax]=this.domain(xs,s.x);[ymin,ymax]=this.domain(ys,s.y);
      if(s.logX)[xmin,xmax]=logDomain(xs);
    }else if(s.chart==='ecdf'){
      [xmin,xmax]=this.domain(this.result.cdf.points.map(p=>p.value),s.x);ymax=1;
    }else if(s.chart==='histogram'&&!this.result.categoryDistribution){
      xmin=field(s.x).range?.[0]??this.result.bins[0]?.start??0;xmax=Math.max(field(s.x).range?.[1]??1,this.result.bins.at(-1)?.end??1);ymax=Math.max(1,this.result.overlay?.maxCount??0,...this.result.bins.map(b=>b.count))*1.12;
    }else{
      xmax=this.displayGroups.length;
      if((s.chart==='bar'&&s.aggregation==='count'||this.result.categoryDistribution))ymax=Math.max(1,...this.result.groups.map(g=>g.count))*1.15;
      else [ymin,ymax]=this.domain(this.result.groups.flatMap(g=>[g.min,g.max]).filter(Number.isFinite),s.y);
      if(s.chart==='density')[ymin,ymax]=this.result.density.bounds;
    }
    if(this.result.histogramView?.active)[xmin,xmax]=[this.result.histogramView.min,this.result.histogramView.max];
    const countAxis=s.chart==='histogram'&&!this.result.categoryDistribution||(s.chart==='bar'&&s.aggregation==='count'||this.result.categoryDistribution);
    const countStep=countAxis?niceWidth(ymax,5):null;if(countAxis)ymax=Math.ceil(ymax/countStep)*countStep;
    const view=this.result.view;
    if(view.active){
      let end=view.max;
      if(end===100&&s.chart==='density')end=Math.max(end,this.result.density.bounds[1]);
      if(end===100&&s.chart==='histogram'&&!this.result.categoryDistribution)end=Math.max(end,this.result.bins.at(-1)?.end??end);
      if(view.axis==='y')[ymin,ymax]=[view.min,end];else [xmin,xmax]=[view.min,end];
    }
    const {l,r,t,b}=this.plot,log=s.chart==='scatter'&&s.logX;
    this.x=v=>l+(log?(Math.log(v)-Math.log(xmin))/(Math.log(xmax)-Math.log(xmin)):(v-xmin)/(xmax-xmin))*(r-l);
    this.invertX=p=>xmin+(p-l)/(r-l)*(xmax-xmin);
    this.y=v=>b-(v-ymin)/(ymax-ymin)*(b-t);
    ctx.font=THEME.font;ctx.lineWidth=1;
    const yTicks=s.chart==='ecdf'?[0,.25,.5,.75,1]:countAxis?Array.from({length:Math.round(ymax/countStep)+1},(_,i)=>i*countStep):view.active&&view.axis==='y'?axisTicks(view.min,view.max):s.chart==='density'&&s.y==='median'?[0,20,40,60,80,100]:s.y==='month'?Array.from({length:12},(_,i)=>i+1):axisTicks(ymin,ymax);
    for(const value of yTicks){const y=this.y(value);ctx.strokeStyle=THEME.grid;ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(r,y);ctx.stroke();ctx.fillStyle=THEME.muted;ctx.textAlign='right';ctx.fillText(s.chart==='ecdf'?Math.round(value*100)+'%':s.y==='year'?String(Math.round(value)):format(value),l-9,y+3);}
    ctx.strokeStyle=THEME.axis;ctx.beginPath();ctx.moveTo(l,b);ctx.lineTo(r,b);ctx.stroke();
    if(!grouped){
      let ticks=[];if(s.x==='median'&&!log&&!view.active){ticks=[0,20,40,60,80,100];}
      else if(s.x==='month'&&!log){ticks=Array.from({length:12},(_,i)=>i+1).filter(v=>v>=xmin&&v<=xmax);}
      else if(log){for(let e=Math.ceil(Math.log10(xmin));e<=Math.floor(Math.log10(xmax));e++)ticks.push(10**e);if(!ticks.length)ticks=[xmin,xmax];}
      else if(s.chart==='histogram'){ticks=axisTicks(xmin,xmax);if(ticks.length<2)ticks=[xmin,xmax];}
      else{for(let i=0;i<=5;i++)ticks.push(xmin+(xmax-xmin)*i/5);}
      ctx.textAlign='center';ctx.fillStyle=THEME.muted;for(const v of ticks){ctx.fillText(s.x==='year'?String(Math.round(v)):format(v),this.x(v),b+18);}
    }
    ctx.fillStyle=THEME.muted;ctx.font='11px "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.fillText(field(s.x).label+(s.chart==='histogram'&&!this.result.categoryDistribution?' / 每箱 '+format(this.result.actualBinWidth):''),(l+r)/2,this.h-8);
    if(s.chart==='histogram'&&!this.result.categoryDistribution||(s.chart==='bar'&&s.aggregation==='count'||this.result.categoryDistribution)||s.chart==='ecdf'){ctx.save();ctx.textAlign='left';ctx.fillText(s.chart==='ecdf'?'累计比例':unitLabel(s)+'数量',l,t-14);ctx.restore();}
    if(s.chart==='scatter')this.scatter();else if(s.chart==='histogram'&&!this.result.categoryDistribution)this.hist();else if(s.chart==='ecdf'){
      drawCdf(this,this.result.cdf);
      this.brushPoints=this.result.rows.filter(row=>Number.isFinite(row[s.x])).map(row=>({x:this.x(row[s.x]),y:this.y(this.result.cdfEstimates?.single?.available?cdfDisplayAt(this.result.cdfEstimates.single,row[s.x],'smooth'):cdfAt(this.result.cdf,row[s.x])),ids:[row.id]})).filter(p=>p.x>=l&&p.x<=r);
      const x=this.x(s.cdfThreshold),y=this.y(cdfAt(this.result.cdf,s.cdfThreshold));
      if(x>=l&&x<=r){ctx.save();ctx.strokeStyle='#c86a97';ctx.lineWidth=1;ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(l,y);ctx.lineTo(x,y);ctx.lineTo(x,b);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#b13a73';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.restore();chartLabel(ctx,`实际 ≤ ${format(s.cdfThreshold)}：${(cdfAt(this.result.cdf,s.cdfThreshold)*100).toFixed(1)}%`,Math.min(r-4,Math.max(l+4,x)),Math.max(t+14,y-12),{color:THEME.cdf,align:x>(l+r)/2?'right':'left',maxWidth:Math.min(180,r-l-8)});}
    }else if(s.chart==='density')this.density();else this.groups();
    drawMarginals(this);drawOverlay(this);
    this.drawBrush();this.onDraw?.(this);
  }
  drawBrush(){if(!this.brush)return;const ctx=this.ctx,{a,b}=this.brush;ctx.fillStyle='#73519b26';ctx.strokeStyle='#73519b';ctx.lineWidth=1.2;ctx.setLineDash([4,3]);ctx.fillRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.strokeRect(a.x,a.y,b.x-a.x,b.y-a.y);ctx.setLineDash([]);}
  domain(values,key){if(!values.length)return[0,1];if(field(key)?.range)return [...field(key).range];let min=minValue(values),max=maxValue(values);if(key==='votes')min=0;
    if(min===max)return[min-1,max+1];const pad=(max-min)*.025;return [key==='year'?min:min===0?0:min-pad,max+pad];}
  colorLegend(){
    const {state:s,points=[]}=this.result;if(this.result.series||this.result.densityCurves)return (this.result.series??this.result.groups).map(g=>({label:g.label+(this.result.densityCurves?' · '+g.n+' 个'+unitLabel(this.result.state):''),color:seriesColor(g.key),groupKey:String(g.key)}));if(s.chart!=='scatter'||s.color==='none')return[];
    return [...new Set(points.map(r=>r[s.color]??'未标注'))].sort().map((v,i)=>({label:v,color:seriesColor(v),groupKey:String(v)}));
  }
  scatter(){const ctx=this.ctx,{state:s,points}=this.result;
    const map=new Map(this.colorLegend().map(x=>[x.label,x.color]));
    const active=this.selected.size>0;
    ctx.save();ctx.beginPath();ctx.rect(this.plot.l,this.plot.t,this.plot.r-this.plot.l,this.plot.b-this.plot.t);ctx.clip();
    const order=[...points].sort((a,b)=>(this.selected.has(a.id)?2:s.brushGroup&&String(a[s.color])===s.brushGroup?1:0)-(this.selected.has(b.id)?2:s.brushGroup&&String(b[s.color])===s.brushGroup?1:0));
    for(const r of order){const x=this.x(r[s.x]),y=this.y(r[s.y]),selected=this.selected.has(r.id);
      if(this.result.view.active&&!inScoreView(r.median,this.result.view))continue;
      const focused=s.brushGroup&&String(r[s.color])===s.brushGroup;
      ctx.globalAlpha=s.brushGroup&&!focused?.08:active?(selected?1:.12):focused?.85:s.color==='none'?.23:.3;ctx.fillStyle=(active&&!selected||s.brushGroup&&!focused)?THEME.context:map.get(r[s.color])??THEME.purple;ctx.beginPath();ctx.arc(x,y,selected?4:focused?2.8:1.9,0,Math.PI*2);ctx.fill();
      if(selected){ctx.globalAlpha=.9;ctx.strokeStyle='#ffffff';ctx.lineWidth=1.3;ctx.stroke();}
      this.hits.push({kind:'point',x,y,ids:[r.id],groupKey:String(r[s.color]??''),text:r.title+'\n'+field(s.x).label+'：'+format(r[s.x])+'  ·  '+field(s.y).label+'：'+format(r[s.y])+'\n'+(r.characterId?'角色来源 ID：'+r.characterId+(r.workTitle?'\n关联作品：'+r.workTitle+' · EGS '+r.workId:'\n关联 '+r.workIds.length+' 部主作品'):r.company+' · EGS '+r.id)});
    }ctx.restore();ctx.globalAlpha=1;
  }
  hist(){const ctx=this.ctx,{bins,overlay}=this.result,{b,t,l,r}=this.plot;
    const nonempty=bins.filter(bin=>bin.count),showValues=nonempty.length<=12&&!overlay;
    ctx.save();ctx.font=THEME.font;
    for(const bin of bins){const gap=Math.min(.8,(this.x(bin.end)-this.x(bin.start))*.08),left=Math.max(l,this.x(bin.start)+gap),right=Math.min(r,this.x(bin.end)-gap),top=this.y(bin.count);
      if(right<=left)continue;
      const selected=bin.ids.some(id=>this.selected.has(id));ctx.globalAlpha=this.selected.size&&!selected?.18:overlay?.48:.76;ctx.fillStyle=THEME.purple;
      ctx.fillRect(left,top,Math.max(1,right-left),b-top);
      if(selected){ctx.globalAlpha=1;ctx.strokeStyle=THEME.selection;ctx.lineWidth=1.6;ctx.strokeRect(left,top,Math.max(1,right-left),b-top);}
      if(bin.count&&(showValues||selected)&&right-left>=28){ctx.globalAlpha=1;chartLabel(ctx,format(bin.count),(left+right)/2,Math.max(t+12,top-7),{maxWidth:right-left-4});}
      this.hits.push({kind:'rect',left,right,top,bottom:b,ids:bin.ids,text:`[${format(bin.start)}, ${format(bin.end)})\n${bin.count.toLocaleString()} 个版本 · 占 ${(bin.count/this.result.plottedCount*100).toFixed(1)}%\n点选使用完整分箱`});
    }ctx.restore();
  }
  countText(g){const {state:s,plottedCount,categoryDistribution}=this.result;return categoryDistribution||s.chart==='bar'&&s.aggregation==='count'?`${g.label??g.key}\n${g.count.toLocaleString()} 个${unitLabel(s)} · 占已知资料 ${plottedCount?(g.count/plottedCount*100).toFixed(1):'0.0'}%\n点击查看明细`:null;}
  groupHeader(g,center,step){
    const ctx=this.ctx,{b,t}=this.plot;
    const compact=!!this.groupWindow&&step<74,index=this.displayGroups?.indexOf(g)??0,last=(this.displayGroups?.length??1)-1,stride=Math.max(1,Math.ceil(64/step));
    const labelVisible=!compact||index===last||index%stride===0&&index<=last-stride;
    const labelWidth=Math.min(step*(compact?stride:1)*.88,center*2-8,(this.w-center)*2-8);
    ctx.save();ctx.globalAlpha=1;ctx.textAlign='center';ctx.fillStyle=THEME.muted;ctx.font='11px "Microsoft YaHei", sans-serif';if(labelVisible&&!((this.result.state.chart==='bar'&&this.result.state.aggregation==='count'||this.result.categoryDistribution))){const n=this.result.state.chart==='bar'?g.count:g.n;ctx.fillStyle=n>0&&n<5?'#98632e':THEME.muted;const count=n.toLocaleString()+' 个';const text=ctx.measureText(count).width<=labelWidth?count:format(n);if(ctx.measureText(text).width<=labelWidth)ctx.fillText(text,center,23);}
    const name=this.result.state.x==='birthdayMonth'&&step<36?String(parseInt(g.key)):g.label??String(g.key);ctx.fillStyle=THEME.ink;
    if(labelVisible){if(this.groupWindow||ctx.measureText(name).width<=step*.88)ctx.fillText(shortLabel(ctx,name,labelWidth),center,b+23);
    else{const chars=[...name];let first='';while(chars.length&&ctx.measureText(first+chars[0]).width<=step*.88)first+=chars.shift();ctx.fillText(first,center,b+21);ctx.fillText(shortLabel(ctx,chars.join(''),step*.88),center,b+37);}}
    const shared={kind:'rect',left:center-step*.46,right:center+step*.46,ids:g.ids,groupKey:String(g.key),
      text:this.countText(g)??name+`\n${g.count} 个版本 · 有效数值 ${g.n}\n中位数 ${format(g.median)} · 平均值 ${format(g.mean)}\n点击选择整组`};
    this.hits.push({...shared,top:0,bottom:t-4},{...shared,top:b+3,bottom:b+52});ctx.restore();
  }
  density(){
    const ctx=this.ctx,{state:s,density}=this.result,groups=this.displayGroups,{b,t}=this.plot;
    const step=(this.plot.r-this.plot.l)/groups.length,max=s.intensity==='share'?density.maxShare:density.maxCount;
    groups.forEach((g,i)=>{
      const center=this.x(i+.5),width=step*.76,left=center-width/2;
      ctx.globalAlpha=1;ctx.fillStyle=THEME.background;ctx.fillRect(left,t,width,b-t);ctx.strokeStyle=THEME.grid;ctx.lineWidth=.8;ctx.strokeRect(left,t,width,b-t);
      this.groupHeader(g,center,step);
      for(const bin of g.density){
        const selected=bin.ids.some(id=>this.selected.has(id));ctx.globalAlpha=s.brushGroup&&String(g.key)!==s.brushGroup?.12:this.selected.size&&!selected?.18:1;
        const top=Math.max(t,this.y(bin.end)),bottom=Math.min(b,this.y(bin.start));if(bottom<=top)continue;
        ctx.fillStyle=densityColor(s.intensity==='share'?bin.share:bin.count,max);
        ctx.fillRect(left,top,width,Math.max(.25,bottom-top));
        if(selected){ctx.strokeStyle=THEME.selection;ctx.lineWidth=1.5;ctx.strokeRect(left,top,width,Math.max(.25,bottom-top));}
        this.hits.push({kind:'density',left,right:left+width,top,bottom,ids:bin.ids,
          groupKey:String(g.key),start:bin.start,end:bin.end,share:bin.share,count:bin.count,
          text:(g.label??g.key)+` · ${field(s.y).short} [${format(bin.start)}, ${format(bin.end)})\n${bin.count} / ${g.n} 个有效版本 · 组内占比 ${(bin.share*100).toFixed(1)}%\n整组中位数 ${format(g.median)}\n点击查看完整区间的作品`+(this.result.view.active&&(bin.start<this.result.view.min||bin.end>this.result.view.max)?'（色块跨越视野边界）':'')});
      }
    });ctx.globalAlpha=1;
  }
  groups(){const ctx=this.ctx,{state:s}=this.result,groups=this.displayGroups,{b,t}=this.plot;
    const step=(this.plot.r-this.plot.l)/groups.length;
    groups.forEach((g,i)=>{const center=this.x(i+.5),width=Math.min(s.chart==='bar'||this.result.categoryDistribution?86:64,step*.56),selected=g.ids.some(id=>this.selected.has(id));
      ctx.save();ctx.beginPath();ctx.rect(this.plot.l,t,this.plot.r-this.plot.l,b-t);ctx.clip();
      ctx.globalAlpha=s.brushGroup&&String(g.key)!==s.brushGroup?.18:this.selected.size&&!selected?.2:1;ctx.strokeStyle=seriesColor(g.key);ctx.fillStyle=seriesColor(g.key)+(selected?'50':'20');ctx.lineWidth=1.2;
      if(selected){ctx.fillStyle=seriesColor(g.key)+'0c';ctx.fillRect(center-step*.42,t,step*.84,b-t);ctx.fillStyle=seriesColor(g.key)+'30';}
      if(s.chart==='box'&&g.n){
        ctx.strokeStyle=THEME.context;ctx.beginPath();ctx.moveTo(center,this.y(g.min));ctx.lineTo(center,this.y(g.max));ctx.moveTo(center-width*.2,this.y(g.min));ctx.lineTo(center+width*.2,this.y(g.min));ctx.moveTo(center-width*.2,this.y(g.max));ctx.lineTo(center+width*.2,this.y(g.max));ctx.stroke();
        ctx.strokeStyle=seriesColor(g.key);ctx.fillRect(center-width/2,this.y(g.q3),width,Math.max(2,this.y(g.q1)-this.y(g.q3)));ctx.strokeRect(center-width/2,this.y(g.q3),width,Math.max(2,this.y(g.q1)-this.y(g.q3)));
        ctx.strokeStyle=seriesColor(g.key);ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(center-width/2,this.y(g.median));ctx.lineTo(center+width/2,this.y(g.median));ctx.stroke();
      }else if(s.chart==='bar'||this.result.categoryDistribution){const val=s.aggregation==='count'||this.result.categoryDistribution?g.count:g[s.aggregation];if(Number.isFinite(val)){const baseline=this.y(0);ctx.fillStyle=seriesColor(g.key);ctx.fillRect(center-width/2,this.y(val),width,Math.max(1,Math.min(b,baseline)-this.y(val)));}}
      ctx.restore();this.groupHeader(g,center,step);
      const value=s.chart==='box'?g.median:s.aggregation==='count'||this.result.categoryDistribution?g.count:g[s.aggregation];
      if(!(s.x==='birthdayMonth'&&step<48)&&Number.isFinite(value)&&this.y(value)>=t&&this.y(value)<=b){const beside=s.chart==='box'&&step>=210;chartLabel(ctx,(s.chart==='box'&&step>=90?'中位 ':'')+format(value),beside?center+width/2+8:center,beside?this.y(value)+4:Math.max(t+13,this.y(s.chart==='box'?g.q3:value)-9),{color:seriesColor(g.key),align:beside?'left':'center',maxWidth:beside?(step-width)/2-16:step*.88});}
      this.hits.push({kind:'rect',left:center-step*.46,right:center+step*.46,top:t,bottom:b+55,ids:g.ids,groupKey:String(g.key),text:this.countText(g)??String(g.key)+`\n${g.count} 个版本 · 有效数值 ${g.n}\n中位数 ${format(g.median)} · 平均值 ${format(g.mean)}\n范围 ${format(g.min)} – ${format(g.max)}`});
    });
  }
}

// Shared drawing language; object colors do not depend on sort order or chart type.
export const THEME=Object.freeze({ink:'#30323c',muted:'#676c76',grid:'#e8e9ed',axis:'#d8dbe1',purple:'#7550a7',teal:'#137e85',background:'#ffffff',context:'#87909e',selection:'#493066',fit:'#a75e2c',cdf:'#a83c70',font:'12px "Segoe UI", "Microsoft YaHei", sans-serif'});
export const SERIES_COLORS=Object.freeze(['#7550a7','#137e85','#b16a30','#3c71aa','#ab4276','#667d35','#8b5945','#5c61a9','#32745b','#a35b91','#69707c','#9a791f']);
export function seriesColor(key){
  if(String(key)==='Key')return SERIES_COLORS[0];if(String(key)==='AUGUST')return SERIES_COLORS[1];
  if(/^\d{4}年代$/.test(String(key)))return SERIES_COLORS[(Number(String(key).slice(0,4))/10)%SERIES_COLORS.length];
  let hash=2166136261;for(const c of String(key))hash=Math.imul(hash^c.codePointAt(0),16777619);
  return SERIES_COLORS[(hash>>>0)%SERIES_COLORS.length];
}
export function shortLabel(ctx,label,width){
  let value=String(label);if(ctx.measureText(value).width<=width)return value;
  while(value.length&&ctx.measureText(value+'…').width>width)value=value.slice(0,-1);return value+'…';
}
export function chartLabel(ctx,text,x,y,{color=THEME.ink,align='center',maxWidth=160}={}){
  ctx.save();ctx.font='600 11px "Segoe UI", "Microsoft YaHei", sans-serif';
  const value=shortLabel(ctx,text,maxWidth),width=ctx.measureText(value).width;
  const left=align==='right'?x-width:align==='left'?x:x-width/2;
  ctx.fillStyle='#ffffffed';ctx.fillRect(left-4,y-12,width+8,17);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);ctx.restore();
}
export function correlationColor(value){
  if(value===null)return '#f0f1f4';
  const end=value<0?[19,126,133]:[117,80,167],t=Math.min(1,Math.abs(value));
  return `rgb(${end.map(v=>Math.round(250+(v-250)*t)).join(',')})`;
}
export function axisTicks(min,max,target=5){
  const raw=(max-min)/target;if(!(raw>0))return [min];
  const power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(v=>v*power>=raw)*power;
  const ticks=[];for(let i=Math.ceil(min/step);i<=Math.floor(max/step+1e-9);i++)ticks.push(Number((i*step).toPrecision(12)));return ticks;
}

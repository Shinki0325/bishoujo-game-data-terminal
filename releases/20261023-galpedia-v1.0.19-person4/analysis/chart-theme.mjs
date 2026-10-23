import {minValue,maxValue} from './numeric-extents.mjs';
// Shared drawing language; object colors do not depend on sort order or chart type.
export const darkTheme=()=>globalThis.document?.documentElement?.dataset?.theme==='dark';
const light={ink:'#252b39',muted:'#656477',grid:'#edeaf1',axis:'#d9d6e1',purple:'#6b4a8d',teal:'#137e85',background:'#ffffff',context:'#87909e',selection:'#573a73',fit:'#a75e2c',trend:'#2670bb',cdf:'#a83c70',font:'12px Inter, "Segoe UI", "Noto Sans SC", "Noto Sans JP", sans-serif'};
const dark={...light,ink:'#f3f0f6',muted:'#b8b6c1',grid:'#354054',axis:'#5a667e',purple:'#c6a8df',teal:'#68c3cb',background:'#252b39',context:'#99a5b8',selection:'#dfc5f2',fit:'#e6a16d',trend:'#8fb7ee',cdf:'#e993be'};
export const THEME=Object.freeze(Object.defineProperties({},Object.fromEntries(Object.keys(light).map(key=>[key,{enumerable:true,get:()=>(darkTheme()?dark:light)[key]}]))));
export const SERIES_COLORS=Object.freeze(['#7550a7','#137e85','#b16a30','#3c71aa','#ab4276','#667d35','#8b5945','#5c61a9','#32745b','#a35b91','#69707c','#9a791f']);
export function seriesColor(key){
  const colors=darkTheme()?['#bda0ec','#68c3cb','#e6a16d','#8fb7ee','#e993be','#b1c778','#d3a18c','#aaaee8','#7ac5a0','#d6a1c8','#b5bfcc','#dbc275']:SERIES_COLORS;
  if(String(key)==='Key')return colors[0];if(String(key)==='AUGUST')return colors[1];
  if(/^\d{4}年代$/.test(String(key)))return colors[(Number(String(key).slice(0,4))/10)%colors.length];
  let hash=2166136261;for(const c of String(key))hash=Math.imul(hash^c.codePointAt(0),16777619);
  return colors[(hash>>>0)%colors.length];
}
export function shortLabel(ctx,label,width){
  let value=String(label);if(ctx.measureText(value).width<=width)return value;
  while(value.length&&ctx.measureText(value+'…').width>width)value=value.slice(0,-1);return value+'…';
}
export function chartLabel(ctx,text,x,y,{color=THEME.ink,align='center',maxWidth=160}={}){
  ctx.save();ctx.font='600 11px "Segoe UI", "Microsoft YaHei", sans-serif';
  const value=shortLabel(ctx,text,maxWidth),width=ctx.measureText(value).width;
  const left=align==='right'?x-width:align==='left'?x:x-width/2;
  ctx.fillStyle=THEME.background+'ed';ctx.fillRect(left-4,y-12,width+8,17);ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);ctx.restore();
}
export function correlationColor(value){
  if(darkTheme()){const start=[37,43,57],end=value<0?[30,99,105]:[96,65,133],t=value===null?0:Math.min(1,Math.abs(value));return `rgb(${start.map((v,i)=>Math.round(v+(end[i]-v)*t)).join(',')})`;}
  if(value===null)return '#f0f1f4';
  const end=value<0?[19,126,133]:[117,80,167],t=Math.min(1,Math.abs(value));
  return `rgb(${end.map(v=>Math.round(250+(v-250)*t)).join(',')})`;
}
export function axisTicks(min,max,target=5){
  const raw=(max-min)/target;if(!(raw>0))return [min];
  const power=10**Math.floor(Math.log10(raw)),step=[1,2,2.5,5,10].find(v=>v*power>=raw)*power;
  const ticks=[];for(let i=Math.ceil(min/step);i<=Math.floor(max/step+1e-9);i++)ticks.push(Number((i*step).toPrecision(12)));return ticks;
}
export function logDomain(values){
  const positive=values.filter(v=>Number.isFinite(v)&&v>0);
  if(!positive.length)return [1,10];
  const min=minValue(positive),max=maxValue(positive);
  // Only identical values need expansion; a narrow real range must stay narrow.
  return min<max?[min,max]:[min/Math.sqrt(1.1),max*Math.sqrt(1.1)];
}

import {kernelCdf} from './cumulative-estimate.mjs';
import {validateContext} from './site-context.mjs';
import {histogramViewport} from './distribution-view.mjs';
import {minValue,maxValue} from './numeric-extents.mjs';
import {comparisonKeys} from './comparison-selection.mjs';
import {gaussianKde,buildOverlays} from './overlays.mjs';
import {empiricalCdf} from './statistical-tools.mjs';
import {comparisonSeries,correlation,marginalBins} from './exploration.mjs';
export const groupField=s=>['line','ecdf'].includes(s.chart)&&s.seriesField!=='none'?s.seriesField:s.x;
export let FIELDS = Object.freeze([
  {id:'median',label:'EGS 评分中位数',short:'EGS 评分',type:'number',unit:'分',range:[0,100],source:'median'},
  {id:'votes',label:'EGS 评价人数',short:'评价人数',type:'number',unit:'人',source:'voteCount'},
  {id:'year',label:'发行年份',short:'发行年份',type:'number',unit:'年',source:'releaseDate → 年份'},
  {id:'month',label:'发行月份',short:'发行月份',type:'number',unit:'月',range:[1,12],source:'releaseDate → 月份'},
  {id:'decade',label:'发行年代',short:'发行年代',type:'category',source:'releaseDate → 十年分组'},
  {id:'company',label:'会社',short:'会社',type:'category',source:'companyId → company.name'},
  {id:'tags',label:'内容标签',short:'内容标签',type:'category',multi:true,source:'filterIds → 已发布标签字典'},
  {id:'genre',label:'游戏类型',short:'游戏类型',type:'category',multi:true,source:'genreIds → 已发布类型字典'},
  {id:'platform',label:'平台',short:'平台',type:'category',source:'platformId → 已发布平台字典'}
]);
let fieldIndex=new Map(FIELDS.map(f=>[f.id,f]));
export const field = id => fieldIndex.get(id);
export const supportsLogX = id => field(id)?.type==='number'&&!['year','month','birthdayMonth'].includes(id);
export const plottedFields=s=>(s.chart==='matrix'?s.matrixFields:s.chart==='scatter'?[s.x,s.y,s.color]:s.chart==='line'?[s.x,s.y,s.seriesField]:s.chart==='ecdf'?[s.x,s.seriesField]:s.chart==='histogram'?[s.x]:s.chart==='bar'&&s.aggregation==='count'?[s.x]:[s.x,s.y]).filter(id=>field(id));
export function analysisGrain(s){
  if(['work','edition'].includes(s.grain))return s.grain;
  const fields=plottedFields(s);return !fields.some(id=>field(id).character)?'work':fields.every(id=>field(id).character)?'character':'appearance';
}
export const unitLabel=s=>({work:'主作品',edition:'版本',character:'角色',appearance:'角色—主作品关系'}[analysisGrain(s)]);
export function configureFields(fields){FIELDS=Object.freeze(fields.map(f=>Object.freeze({...f})));fieldIndex=new Map(FIELDS.map(f=>[f.id,f]));}
export const DEFAULT = Object.freeze({chart:'scatter',x:'year',y:'median',color:'decade',minVotes:30,
  yearFrom:1980,yearTo:2030,tag:'',search:'',top:12,aggregation:'median',binWidth:5,histogramRange:'auto',logX:false,
  densityStyle:'bins',densityWidth:1,intensity:'share',groupSort:'count',minGroup:1,
  groupMode:'auto',groupSelections:Object.freeze({}),viewActive:false,viewMin:60,viewMax:90,
  trendLine:false,densityCurve:false,scatterDensity:false,cumulativeCurve:false,cdfStyle:'step',cdfSmoothing:2,cdfThreshold:80,smoothing:1,seriesField:'none',facet:false,lineUnit:'year',marginals:false,trendMethod:'linear',lowessFraction:.5,correlationMethod:'spearman',matrixStyle:'heatmap',matrixFields:Object.freeze(['median','votes','year','month']),brushGroup:'',selectionMode:'replace',brushEnabled:true});
export function sanitize(input={}) {
  const s={...DEFAULT};
  if(!input || typeof input!=='object')return s;
  s.grain=['work','edition'].includes(input.grain)?input.grain:'auto';s.grainPolicyVersion=2;
  s.characterScope=['primary','female'].includes(input.characterScope)?input.characterScope:'all';
  s.characterAggregation=['mean','max'].includes(input.characterAggregation)?input.characterAggregation:'median';
  s.voteSource=['bangumiVotes','vndbVotes'].includes(input.voteSource)?input.voteSource:'votes';
  if(['scatter','density','box','histogram','ecdf','bar','line','matrix'].includes(input.chart))s.chart=input.chart;
  if(field(input.x))s.x=input.x;
  if(field(input.y)?.type==='number')s.y=input.y;
  if(['none','decade','platform'].includes(input.color))s.color=input.color;
  for(const [key,min,max] of [['minVotes',0,1000000],['yearFrom',1900,2100],['yearTo',1900,2100],['top',3,30],['binWidth',.1,10000],['densityWidth',.1,10000],['minGroup',1,1000000],['viewMin',0,100],['viewMax',0,100]]){
    const n=Number(input[key]);if(input[key]!==undefined&&Number.isFinite(n))s[key]=Math.min(max,Math.max(min,n));
  }
  if(s.yearFrom>s.yearTo)[s.yearFrom,s.yearTo]=[s.yearTo,s.yearFrom];
  if(typeof input.tag==='string')s.tag=input.tag.slice(0,100);
  if(typeof input.search==='string')s.search=input.search.slice(0,200);
  if(['count','mean','median'].includes(input.aggregation))s.aggregation=input.aggregation;
  if(['share','count'].includes(input.intensity))s.intensity=input.intensity;
  if(['count','median','name'].includes(input.groupSort))s.groupSort=input.groupSort;
  s.minGroup=Math.round(s.minGroup);s.top=Math.round(s.top);
  s.cdfSmoothing=Number.isFinite(input.cdfSmoothing)?Math.min(4,Math.max(.5,input.cdfSmoothing)):2;
  s.cdfStyle=input.cdfStyle==='smooth'?'smooth':'step';
  s.histogramRange=input.histogramRange==='full'?'full':'auto';
  s.densityStyle=input.densityStyle==='curve'?'curve':'bins';
  s.groupMode=input.groupMode==='manual'?'manual':'auto';s.groupSelections={};
  for(const f of FIELDS.filter(f=>f.type==='category')){
    const keys=input.groupSelections?.[f.id];
    if(Array.isArray(keys))s.groupSelections[f.id]=comparisonKeys(keys);
  }
  s.viewActive=input.viewActive===true&&s.viewMin<s.viewMax;
  s.trendLine=input.trendLine===true;s.densityCurve=input.densityCurve===true;
  s.scatterDensity=input.scatterDensity===true;s.cumulativeCurve=input.cumulativeCurve===true;
  if(typeof input.cdfThreshold==='number'&&Number.isFinite(input.cdfThreshold))s.cdfThreshold=Math.max(-1e9,Math.min(1e9,input.cdfThreshold));
  if([.5,1,2].includes(Number(input.smoothing)))s.smoothing=Number(input.smoothing);
  s.logX=input.logX===true;
  if(input.seriesField==='none'||field(input.seriesField)?.type==='category')s.seriesField=input.seriesField;
  if(s.chart==='line'&&s.seriesField==='none')s.seriesField='company';
  s.facet=input.facet===true;s.marginals=input.marginals===true;s.brushEnabled=input.brushEnabled!==false;
  s.lineUnit=input.lineUnit==='edition'?'edition':'year';s.trendMethod=input.trendMethod==='lowess'?'lowess':'linear';
  if([.25,.5,.75].includes(Number(input.lowessFraction)))s.lowessFraction=Number(input.lowessFraction);
  s.correlationMethod=input.correlationMethod==='pearson'?'pearson':'spearman';s.matrixStyle=input.matrixStyle==='scatter'?'scatter':'heatmap';
  if(Array.isArray(input.matrixFields)){const ids=[...new Set(input.matrixFields)].filter(id=>field(id)?.type==='number');if(ids.length>=2)s.matrixFields=ids;}
  if(typeof input.brushGroup==='string')s.brushGroup=input.brushGroup.slice(0,200);
  if(['replace','add','subtract'].includes(input.selectionMode))s.selectionMode=input.selectionMode;
  if(s.chart==='line'&&s.aggregation==='count')s.aggregation='median';
  if(['scatter','ecdf','line'].includes(s.chart)&&field(s.x).type!=='number')s.x='year';
  s.logX=s.logX&&supportsLogX(s.x);
  const filter=input.recordFilter;
  s.recordFilter=filter&&filter.grain===analysisGrain(s)&&Array.isArray(filter.ids)?{grain:filter.grain,ids:[...new Set(filter.ids.filter(id=>typeof id==='string'&&id.length<=500))].slice(0,200000)}:null;
  s.sourceContext=input.sourceContext?validateContext(input.sourceContext):null;
  return s;
}
// Migrate saved v1 plans at the persistence boundary, never during field assignment.
export function restoreState(input){
  return sanitize({...input,...(!input?.grainPolicyVersion&&plottedFields({...DEFAULT,...input}).some(id=>field(id).character)?{grain:'auto'}:{}),...(input?.chart==='box'&&input?.distribution==='density'?{chart:'density',densityWidth:5}:{})});
}
// Assigning a field never changes the chart explicitly chosen by the user.
export function assignField(state,channel,id){
  const f=field(id);
  if(!f||!['x','y','color'].includes(channel))return {error:'字段不可用。'};
  if(channel==='y'&&f.type!=='number')return {error:'纵轴需要数值字段；分类字段可用于分布图的横轴。'};
  if(channel==='color'&&!['decade','platform'].includes(id))return {error:'颜色支持发行年代和平台；多值标签请用于分组。'};
  if(channel==='x'&&['scatter','ecdf','line'].includes(state.chart)&&f.type!=='number')return {error:'当前图表横轴需要数值。查看分类数量请先选择“分布图”，再添加分类字段。'};
  const next={...state,[channel]:id};
  if(['x','y'].includes(channel)&&next.chart==='scatter'&&field(next.x)?.character&&field(next.y)?.character)next.color='none';
  return {state:sanitize(next)};
}
export function filterRows(rows,s){
  const query=s.search.toLocaleLowerCase();
  const subset=s.recordFilter?new Set(s.recordFilter.ids):null;
  return rows.filter(r=>(!subset||subset.has(r.id))&&(r.entityKind==='character'||((s.minVotes===0||Number.isFinite(r[s.voteSource??'votes'])&&r[s.voteSource??'votes']>=s.minVotes)&&
    (Number.isFinite(r.year)?r.year>=s.yearFrom&&r.year<=s.yearTo:s.yearFrom===1900&&s.yearTo===2100)&&(!s.tag||r.tags?.includes(s.tag))))&&(!query||[r.title,r.originalTitle,r.company,r.id,r.workTitle,r.characterId,r.workId].some(v=>String(v??'').toLocaleLowerCase().includes(query))));
}
export function quantile(sorted,p){
  if(!sorted.length)return null;
  const h=(sorted.length-1)*p,i=Math.floor(h);return sorted[i]+(sorted[Math.min(i+1,sorted.length-1)]-sorted[i])*(h-i);
}
export function describe(values){
  const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
  return {n:v.length,min:v[0]??null,q1:quantile(v,.25),median:quantile(v,.5),q3:quantile(v,.75),max:v.at(-1)??null,
    mean:v.length?v.reduce((a,b)=>a+b,0)/v.length:null};
}
export function groupRows(rows,key,metric,width=null){
  const map=new Map();
  for(const row of rows){
    if(field(key)?.type==='number'&&!Number.isFinite(row[key]))continue;
    const value=width&&Number.isFinite(row[key])?Math.floor(row[key]/width)*width:row[key];
    const raw=Array.isArray(value)?value:[value];
    const keys=[...new Set(raw.filter(v=>v!==null&&v!==undefined&&v!==''))];
    for(const k of keys){if(!map.has(k))map.set(k,[]);map.get(k).push(row);}
  }
  return [...map].map(([key,members])=>({key,ids:members.map(r=>r.id),count:members.length,...describe(members.map(r=>r[metric]))}));
}
export function niceWidth(span,target=20){
  const raw=Math.max(1,span/target),power=10**Math.floor(Math.log10(raw));
  return [1,2,5,10].find(n=>n*power>=raw)*power;
}
const binStart=(value,width)=>{
  const q=value/width;
  return Number((Math.floor(q+Number.EPSILON*Math.max(1,Math.abs(q))*4)*width).toPrecision(12));
};
export function densityBins(groups,rows,metric,requestedWidth=1){
  const lookup=new Map(rows.map(r=>[r.id,r]));
  const values=groups.flatMap(g=>g.ids.map(id=>lookup.get(id)?.[metric])).filter(Number.isFinite);
  const min=values.length?minValue(values):0,max=values.length?maxValue(values):1;
  const extent=field(metric)?.range??[min,max];
  const width=Math.max(requestedWidth,['month','year','votes','bangumiVotes','vndbVotes','versionCount'].includes(metric)?1:metric==='bangumi'?.1:.5,
    extent[1]-extent[0]>requestedWidth*240?niceWidth(extent[1]-extent[0],240):0);
  const bounds=[Math.floor(extent[0]/width)*width,(Math.floor(extent[1]/width)+1)*width];
  // Uniform left-closed, right-open bins: score 100 has its own interval at width 1.
  let maxShare=0,maxCount=0;
  for(const g of groups){
    const map=new Map();
    for(const id of g.ids){const value=lookup.get(id)?.[metric];if(!Number.isFinite(value))continue;
      const start=binStart(value,width);
      if(!map.has(start))map.set(start,{start,end:start+width,count:0,ids:[]});const bin=map.get(start);bin.count++;bin.ids.push(id);
    }
    g.density=[...map.values()].sort((a,b)=>a.start-b.start).map(bin=>({...bin,share:g.n?bin.count/g.n:0}));
    maxShare=Math.max(maxShare,...g.density.map(d=>d.share),0);maxCount=Math.max(maxCount,...g.density.map(d=>d.count),0);
  }
  return {width,bounds,maxShare,maxCount};
}
export function histogram(rows,key,width){
  if(!Number.isFinite(width)||width<=0)throw new TypeError('Invalid bin width');
  const map=new Map();
  for(const r of rows){const v=r[key];if(!Number.isFinite(v))continue;const start=binStart(v,width);
    if(!map.has(start))map.set(start,{start,end:start+width,count:0,ids:[]});
    const b=map.get(start);b.count++;b.ids.push(r.id);}
  if(!map.size)return [];
  const starts=[...map.keys()],min=minValue(starts),max=maxValue(starts);
  if((max-min)/width>200)return [...map.values()].sort((a,b)=>a.start-b.start);
  const bins=[];for(let n=0;n<=Math.round((max-min)/width);n++){
    const start=Number((min+n*width).toPrecision(12));bins.push(map.get(start)??{start,end:start+width,count:0,ids:[]});}
  return bins;
}
function analyzeBase(rows,input){
  const s=sanitize(input),filtered=filterRows(rows,s);
  if(s.chart==='matrix'){
    const matrix=s.matrixFields.flatMap(y=>s.matrixFields.map(x=>({x,y,...correlation(filtered,x,y,s.correlationMethod)})));
    const points=filtered.filter(r=>s.matrixFields.filter(k=>Number.isFinite(r[k])).length>=2);
    return {state:s,rows:filtered,points,matrix,filteredCount:filtered.length,plottedCount:points.length,missingCount:filtered.length-points.length};
  }
  if(s.chart==='line'||s.chart==='ecdf'&&s.seriesField!=='none'){
    const base=analyzeBase(rows,{...s,chart:'box',x:s.seriesField,y:s.chart==='ecdf'?s.x:s.y});
    const validIds=new Set(base.rows.filter(r=>Number.isFinite(r[s.x])).map(r=>r.id));
    const series=comparisonSeries(base.groups,base.rows,s,describe),ids=new Set(series.flatMap(g=>s.chart==='line'?g.points.flatMap(p=>p.ids):g.ids.filter(id=>validIds.has(id))));
    return {...base,state:s,series,plottedCount:ids.size,...(s.chart==='ecdf'?{cdf:empiricalCdf(base.rows.filter(r=>ids.has(r.id)).map(r=>r[s.x]))}:{})};
  }
  if(s.chart==='scatter'){
    const points=filtered.filter(r=>Number.isFinite(r[s.x])&&Number.isFinite(r[s.y])&&(!s.logX||r[s.x]>0));
    return {state:s,filteredCount:filtered.length,plottedCount:points.length,missingCount:filtered.length-points.length,rows:filtered,points,...(s.marginals?{marginals:{x:marginalBins(points,s.x,s.logX),y:marginalBins(points,s.y)}}:{})};
  }
  if(s.chart==='ecdf'){
    const cdf=empiricalCdf(filtered.map(r=>r[s.x]));
    return {state:s,rows:filtered,filteredCount:filtered.length,plottedCount:cdf.n,missingCount:filtered.length-cdf.n,cdf};
  }
  if(s.chart==='histogram'){
    if(field(s.x).type==='category')return {...analyzeBase(rows,{...s,chart:'bar',aggregation:'count'}),state:s,categoryDistribution:true};
    let width=s.binWidth;
    const numbers=filtered.map(r=>r[s.x]).filter(Number.isFinite);
    if(numbers.length){const span=maxValue(numbers)-minValue(numbers);width*=Math.max(1,Math.ceil(span/(width*2000)-1e-10));}
    const bins=histogram(filtered,s.x,width);
    return {state:s,rows:filtered,filteredCount:filtered.length,plottedCount:numbers.length,
      missingCount:filtered.length-numbers.length,bins,actualBinWidth:width,histogramView:histogramViewport(bins,{mode:s.histogramRange,bounded:!!field(s.x).range,calendar:['year','month','birthdayMonth'].includes(s.x)})};
  }
  const numeric=field(s.x).type==='number',calendar=['month','birthdayMonth'].includes(s.x),ordered=numeric||calendar;
  const xvalues=filtered.map(r=>r[s.x]).filter(Number.isFinite);
  const xGroupWidth=s.x==='median'?5:s.x==='votes'?niceWidth(xvalues.length?maxValue(xvalues)-minValue(xvalues):1):null;
  const rawGroups=groupRows(filtered,s.x,s.y,xGroupWidth);
  const groups=rawGroups.filter(g=>s.chart==='bar'&&s.aggregation==='count'||g.n>0);
  if(calendar)for(let month=1;month<=12;month++){const key=s.x==='birthdayMonth'?month+'月':month;if(!groups.some(g=>g.key===key))groups.push({key,ids:[],count:0,...describe([])});}
  const byName=(a,b)=>s.x==='birthdayMonth'?parseInt(a.key)-parseInt(b.key):String(a.key).localeCompare(String(b.key),'zh-CN');
  groups.sort(calendar?(a,b)=>parseInt(a.key)-parseInt(b.key):numeric?(a,b)=>a.key-b.key:s.groupSort==='name'?byName:s.groupSort==='median'?(a,b)=>(b.median??-Infinity)-(a.median??-Infinity)||b.count-a.count||byName(a,b):(a,b)=>b.count-a.count||byName(a,b));
  for(const g of groups)g.label=s.x==='month'?g.key+'月':s.x==='year'?String(g.key):xGroupWidth?`${g.key}–<${g.key+xGroupWidth}`:String(g.key);
  // Sample threshold applies only to categorical comparisons; keep calendar axes complete.
  const eligible=ordered?groups:groups.filter(g=>g.n>=s.minGroup||(s.chart==='bar'&&s.aggregation==='count'&&g.count>=s.minGroup));
  const manual=!ordered&&s.groupMode==='manual';
  const rawByKey=new Map(rawGroups.map(g=>[g.key,g]));
  const availableGroups=manual?groupRows(rows,s.x,s.y).map(g=>({key:g.key,count:rawByKey.get(g.key)?.count??0}))
    .sort((a,b)=>b.count-a.count||byName(a,b)):[];
  const known=new Set(availableGroups.map(g=>g.key));
  const manualKeys=manual?(s.groupSelections[s.x]??[]).filter(key=>known.has(key)):[];
  const countsOnly=s.chart==='bar'&&s.aggregation==='count';
  const validMetric=new Set(filtered.filter(r=>countsOnly||Number.isFinite(r[s.y])).map(r=>r.id));
  const chosen=manual?manualKeys.map(key=>({...rawByKey.get(key)??{key,ids:[],count:0,...describe([])},label:key})):
    ordered?eligible:eligible.slice(0,s.top);
  const visible=chosen.map(g=>({...g,memberIds:g.ids,ids:g.ids.filter(id=>validMetric.has(id))})),ids=new Set(visible.flatMap(g=>g.ids));
  const assignedIds=new Set(rawGroups.flatMap(g=>g.ids).filter(id=>validMetric.has(id)));
  const density=s.chart==='density'?densityBins(visible,filtered,s.y,s.densityWidth):null;
  return {state:s,rows:filtered,filteredCount:filtered.length,plottedCount:ids.size,
    missingCount:filtered.length-assignedIds.size,groups:visible,totalGroups:groups.length,
    availableGroups,manualKeys,eligibleGroups:eligible.length,excludedSmallGroups:manual?0:groups.length-eligible.length,
    membershipCount:visible.reduce((n,g)=>n+g.ids.length,0),density,xGroupWidth,groupOrder:manual?'manual':ordered?'numeric':s.groupSort};
}
export function chartRows(result){
  if(result.series){const ids=new Set(result.series.flatMap(g=>result.state.chart==='line'?g.points.flatMap(p=>p.ids):g.ids));return result.rows.filter(r=>ids.has(r.id)&&Number.isFinite(r[result.state.chart==='ecdf'?result.state.x:result.state.y]));}
  if(result.points)return result.points;
  if(result.bins||result.cdf)return result.rows.filter(r=>Number.isFinite(r[result.state.x]));
  const ids=new Set(result.groups.flatMap(g=>g.ids));return result.rows.filter(r=>ids.has(r.id));
}
export function scoreAxis(s){
  if(s.chart==='density'&&s.densityStyle==='curve'&&s.y==='median')return 'x';
  if(['density','box','scatter','line'].includes(s.chart)&&s.y==='median')return 'y';
  if(['histogram','scatter','ecdf','line'].includes(s.chart)&&s.x==='median'&&!(s.chart==='scatter'&&s.logX))return 'x';
  return null;
}
export function inScoreView(value,view){
  return Number.isFinite(value)&&value>=view.min&&(value<view.max||view.max===100&&value===100);
}
export function analyze(rows,input){
  const result=analyzeBase(rows,input),s=result.state,axis=scoreAxis(s);
  if(s.brushGroup){const keys=result.groups?.map(g=>String(g.key))??(s.chart==='scatter'&&s.color!=='none'?result.points.map(r=>String(r[s.color]??'')):[]);if(!keys.includes(s.brushGroup))s.brushGroup='';}
  const view={axis,active:!!axis&&s.viewActive,min:s.viewMin,max:s.viewMax};
  if(view.active){const scope=chartRows(result),valid=scope.filter(r=>Number.isFinite(r.median));
    view.insideCount=valid.filter(r=>inScoreView(r.median,view)).length;view.outsideCount=valid.length-view.insideCount;
  }
  const curveView=s.chart==='density'&&s.densityStyle==='curve';
  const lookup=curveView?new Map(result.rows.map(row=>[row.id,row[s.y]])):null;
  const densityCurves=curveView?result.groups.map(g=>({key:g.key,...gaussianKde(g.ids.map(id=>lookup.get(id)),{bounds:field(s.y)?.range,scale:s.smoothing,minPoints:513})})):null;
  const overlay=curveView?null:buildOverlays(result,field(s.chart==='histogram'?s.x:s.y)?.range);
  let cdfEstimates=null;
  if(s.cdfStyle==='smooth'){
    const options={scale:s.cdfSmoothing,bounds:field(s.x)?.range};cdfEstimates={};
    if(result.cdf)cdfEstimates.single=kernelCdf(result.cdf,options);
    if(overlay?.cdf)cdfEstimates.overlay=kernelCdf(overlay.cdf,options);
    if(s.chart==='ecdf'&&result.series)cdfEstimates.groups=Object.fromEntries(result.series.map(g=>[g.key,kernelCdf(g.cdf,options)]));
  }
  return {...result,view,densityCurves,overlay,cdfEstimates};
}
export function csvCell(value){
  let s=String(value??'');if(/^[=+@\-\t\r]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}

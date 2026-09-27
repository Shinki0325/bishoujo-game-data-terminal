import {DEFAULT,sanitize,field,analysisGrain} from './model.mjs';
export const objectFor=s=>({work:'work',edition:'work',character:'character',appearance:'appearance'}[analysisGrain(s)]);
export const purposeFor=s=>s.chart==='line'?'trend':['scatter','matrix'].includes(s.chart)?'relation':['histogram','ecdf'].includes(s.chart)?'distribution':'compare';
export function purposePatch(s,purpose,object=objectFor(s)){
  const role=object==='character',mixed=object==='appearance';
  const shared={grain:'auto',color:'none',seriesField:'none',groupMode:'auto',groupSelections:{},brushGroup:'',logX:false,viewActive:false};
  if(purpose==='distribution')return {...shared,chart:'histogram',x:role?'height':mixed?'height':'median',...(mixed?{chart:'density',x:'year',y:'height',densityStyle:'curve'}:{})};
  if(purpose==='compare')return {...shared,chart:'box',x:role?'birthdayMonth':'company',y:role||mixed?'height':'median',groupSort:role?'name':'count',top:12};
  if(purpose==='trend')return {...shared,chart:'line',x:'year',y:role||mixed?'height':'median',seriesField:'company',aggregation:'median',lineUnit:'year'};
  return {...shared,chart:'scatter',x:role||mixed?'height':'votes',y:role?'weight':'median'};
}
export function newAnalysis(object='work',purpose='distribution'){
  return sanitize({...DEFAULT,...purposePatch(DEFAULT,purpose,object),minVotes:0,yearFrom:1900,yearTo:2100,characterScope:'all',search:'',tag:'',recordFilter:null,trendLine:false,scatterDensity:false,densityCurve:false,cumulativeCurve:false,marginals:false});
}
export function chartRequirement(s,chart){
  if(['scatter','line','ecdf'].includes(chart)&&field(s.x)?.type!=='number')return '需要数值横轴；请先在构建区选择数值字段';
  if(s.chart==='histogram'&&field(s.x)?.type==='category'&&['box','density'].includes(chart))return '需要观察数值；请用“比组别”添加一个数值字段';
  return '';
}
export function changeChart(s,chart){
  const error=chartRequirement(s,chart);if(error)return {error};
  return {patch:{chart,brushGroup:'',...(chart==='bar'&&s.chart==='histogram'?{aggregation:'count'}:{}),...(chart==='line'&&s.seriesField==='none'?{seriesField:'company'}:{})}};
}
export const scopeText=s=>({character:'每名角色一次',appearance:'每个角色—主作品关系一次',edition:'每个发行版本一次',work:'每部主作品一次'}[analysisGrain(s)]);

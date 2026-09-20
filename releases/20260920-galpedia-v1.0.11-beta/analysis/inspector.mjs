import {describe,field,groupField} from './model.mjs';
import {format} from './chart.mjs';
const $=id=>document.getElementById(id);

export function groupStatistics(result){
  return (result.groups??[]).map(g=>{
    const peak=g.density?.reduce((best,bin)=>!best||bin.count>best.count?bin:best,null);
    return {group:g,values:[g.label,g.count,g.n,g.median,
      g.n?`${format(g.q1)}–${format(g.q3)}`:'—',
      ...(result.density?[peak?`[${format(peak.start)}, ${format(peak.end)}) · ${(peak.share*100).toFixed(1)}%`:'—']:[])]};
  });
}
export function groupColumns(result){
  return [field(groupField(result.state)).short,result.state.grain==='edition'?'版本数':'作品数','有效数值','中位数','中间 50% 范围',...(result.density?['最集中区间 · 组内占比']:[])];
}
export function renderOverview(result,rows,selected){
  const metric=result.state.chart==='matrix'?result.state.matrixFields[0]:['histogram','ecdf'].includes(result.state.chart)?result.state.x:result.state.y;
  const countOnly=result.state.chart==='bar'&&result.state.aggregation==='count';
  const values=describe(rows.map(r=>r[metric])),unit=field(metric).unit;
  const cards=[{label:selected?'已选作品':'图中作品',value:rows.length.toLocaleString(),note:selected?'明细与导出使用此范围':result.state.grain==='edition'?'每个发行版本计一次':'每部主作品计一次'},
    ...(countOnly?[{label:'可见分组',value:String(result.groups.length),note:'多值字段的组间成员可能重叠'}]:[
      {label:field(metric).short+' · 中位数',value:format(values.median),note:values.n?`${values.n.toLocaleString()} 个有效数值 · ${unit}`:'当前范围暂无有效数值'},
      {label:'中间 50% 范围',value:values.n?`${format(values.q1)}–${format(values.q3)}`:'—',note:'第 25–75 百分位 · '+unit}])];
  $('overview').classList.toggle('has-selection',selected);
  $('overview').replaceChildren(...cards.map(c=>{
    const el=document.createElement('div'),label=document.createElement('span'),value=document.createElement('strong'),note=document.createElement('small');
    label.textContent=c.label;value.textContent=c.value;note.textContent=c.note;el.append(label,value,note);return el;
  }));
}
export function renderGroupStatistics(result,selected,onSelect){
  $('group-summary').hidden=!result.groups;
  if(!result.groups)return;
  $('group-summary-count').textContent=result.groups.length+' 组';
  const countOnly=result.state.chart==='bar'&&result.state.aggregation==='count';
  $('group-summary-note').textContent=`与图中分组及顺序一致。统计${field(result.state.chart==='ecdf'?result.state.x:result.state.y).short}，按${result.state.grain==='edition'?'版本':'主作品'}等权。`+
    (result.density?'最集中区间若并列，显示数值最低的一格。':'')+
    (field(groupField(result.state)).multi?'同一版本可属于多个组，数量不可直接相加。':'')+
    (countOnly?'图表按版本数绘制，数值统计仅供参考。':'');
  const heading=document.createElement('tr');
  for(const name of [...groupColumns(result),'作品']){const th=document.createElement('th');th.scope='col';th.textContent=name;heading.append(th);}
  $('group-table-head').replaceChildren(heading);
  $('group-table-body').replaceChildren(...groupStatistics(result).map(({group:g,values})=>{
    const tr=document.createElement('tr');tr.classList.toggle('group-selected',selected.size>0&&g.ids.length>0&&g.ids.every(id=>selected.has(id)));
    for(const value of values){const td=document.createElement('td');td.textContent=typeof value==='number'?format(value):value??'—';tr.append(td);}
    const td=document.createElement('td'),button=document.createElement('button');button.textContent='查看 →';button.disabled=!g.ids.length;
    button.setAttribute('aria-label','查看 '+g.label+' 的 '+g.count+' 个版本');button.addEventListener('click',()=>onSelect(g.ids));td.append(button);tr.append(td);return tr;
  }));
}

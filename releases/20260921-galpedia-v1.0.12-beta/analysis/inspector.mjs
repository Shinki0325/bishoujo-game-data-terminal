import {field,groupField,unitLabel} from './model.mjs';
import {format} from './chart.mjs';
import {numericSummary,categoricalSummary,statisticsFields,statisticsRows,statisticFormat,numericColumns,numericValues} from './descriptive-statistics.mjs';
const $=id=>document.getElementById(id);
const groupCache=new WeakMap(),overviewCache=new WeakMap();

export function groupStatistics(result){
  if(groupCache.has(result))return groupCache.get(result);
  if(result.categoryDistribution||result.state.chart==='bar'&&result.state.aggregation==='count')return (result.groups??[]).map(g=>({group:g,values:[g.label,g.count,result.plottedCount?(g.count/result.plottedCount*100).toFixed(1)+'%':'—']}));
  const lookup=new Map(result.rows.map(r=>[r.id,r])),metric=result.state.chart==='ecdf'?result.state.x:result.state.y;
  const rows=(result.groups??[]).map(g=>{
    const peak=g.density?.reduce((best,bin)=>!best||bin.count>best.count?bin:best,null);
    const stats=numericSummary(g.ids.map(id=>lookup.get(id)?.[metric]));
    return {group:g,values:[g.label,g.count,...numericValues(stats),
      ...(result.density?[peak?`[${format(peak.start)}, ${format(peak.end)}) · ${(peak.share*100).toFixed(1)}%`:'—']:[])]};
  });
  groupCache.set(result,rows);return rows;
}
export function groupColumns(result){
  if(result.categoryDistribution||result.state.chart==='bar'&&result.state.aggregation==='count')return [field(groupField(result.state)).short,unitLabel(result.state)+'数','占已知资料比例'];
  return [field(groupField(result.state)).short,unitLabel(result.state)+'数',...numericColumns,...(result.density?['最集中区间 · 组内占比']:[])];
}
export function renderOverview(result,rows,selected){
  const calculate=scope=>({count:scope.length,fields:statisticsFields(result).map(key=>({field:field(key),stats:field(key).type==='number'?numericSummary(scope.map(r=>r[key])):categoricalSummary(scope.map(r=>r[key]))}))});
  if(!overviewCache.has(result))overviewCache.set(result,calculate(statisticsRows(result)));
  const summary=selected?calculate(rows):overviewCache.get(result),root=$('overview');
  const grouped=result.groups&&!result.categoryDistribution&&!(result.state.chart==='bar'&&result.state.aggregation==='count');
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const heading=el('header'),title=el('h3','描述性统计'),scope=el('p',`${selected?'已选范围':grouped?'当前显示各组':'筛选范围'} · ${summary.count.toLocaleString()} 个${unitLabel(result.state)}`);
  heading.append(title,scope);
  const note=el('p',selected?'随框选更新；清除选择可回到完整统计。':
    `${grouped?`全部筛选 ${result.filteredCount.toLocaleString()} 个，统计仅含当前显示各组，组间重复记录计一次。`:`图中 ${result.plottedCount.toLocaleString()} 个；统计保留筛选范围内的全部取值及缺失记录。`} 数值来自原始记录。`);
  note.className='statistics-scope';
  const numeric=summary.fields.filter(r=>r.field.type==='number'),category=summary.fields.filter(r=>r.field.type!=='number');
  const tables=[];
  function table(columns,data){
    const scroll=el('div');scroll.className='statistics-scroll';scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','描述性统计表，可横向滚动');
    const t=el('table'),caption=el('caption','当前分析的基础统计'),thead=el('thead'),tr=el('tr'),tbody=el('tbody');
    for(const label of columns){const th=el('th',label);th.scope='col';tr.append(th);}thead.append(tr);
    for(const values of data){const row=el('tr');values.forEach((value,i)=>{const cell=el(i?'td':'th',typeof value==='number'?statisticFormat(value):value??'—');if(!i)cell.scope='row';row.append(cell);});tbody.append(row);}
    t.append(caption,thead,tbody);scroll.append(t);return scroll;
  }
  if(numeric.length)tables.push(table(['字段',...numericColumns],numeric.map(({field:f,stats:s})=>[f.short+(f.unit?`（${f.unit}）`:''),...numericValues(s)])));
  if(category.length)tables.push(table(['字段','已知数','缺失数','不同取值数','最多的类别','数量','占已知资料'],category.map(({field:f,stats:s})=>[f.short,s.n,s.missing,s.distinct,s.mode===null?'—':`${s.mode}${s.tiedModes>1?`（${s.tiedModes} 类并列）`:''}`,s.modeCount,s.n?statisticFormat(s.modeCount/s.n*100)+'%':'—'])));
  const help=el('details'),label=el('summary','这些数值怎么看？');
  help.append(label,el('p','均值是平均水平；中位数把样本分成两半。标准差越大，数值越分散；这里使用样本标准差，少于 2 个有效值时不计算。下、上四分位之间包含中间 50% 的数值。各字段独立排除缺失值，均按当前统计单位等权计算；分类的多值成员可重叠。'));
  root.classList.add('descriptive-statistics');root.classList.toggle('has-selection',selected);root.replaceChildren(heading,note,...tables,help);
}
export function renderGroupStatistics(result,selected,onSelect){
  $('group-summary').hidden=!result.groups;
  if(!result.groups)return;
  $('group-summary-count').textContent=result.groups.length+' 组';
  const countOnly=(result.categoryDistribution||result.state.chart==='bar'&&result.state.aggregation==='count');
  $('group-summary-note').textContent=`与图中分组及顺序一致；不随框选变化。统计原始记录的${field(result.state.chart==='ecdf'?result.state.x:result.state.y).short}，按${unitLabel(result.state)}等权。标准差使用样本标准差。`+
    (result.density?'最集中区间若并列，显示数值最低的一格。':'')+
    (field(groupField(result.state)).multi?'同一记录可属于多个组，数量不可直接相加。':'')+
    (countOnly?'图表按记录数绘制，数值统计仅供参考。':'');
  if(countOnly)$('group-summary-note').textContent='各组数量与占图中已知资料的比例；缺失资料不分配到任何组。多值字段的组间成员可重叠。';
  const heading=document.createElement('tr');
  for(const name of [...groupColumns(result),'明细']){const th=document.createElement('th');th.scope='col';th.textContent=name;heading.append(th);}
  $('group-table-head').replaceChildren(heading);
  $('group-table-body').replaceChildren(...groupStatistics(result).map(({group:g,values})=>{
    const tr=document.createElement('tr');tr.classList.toggle('group-selected',selected.size>0&&g.ids.length>0&&g.ids.every(id=>selected.has(id)));
    for(const value of values){const td=document.createElement('td');td.textContent=typeof value==='number'?statisticFormat(value):value??'—';tr.append(td);}
    const td=document.createElement('td'),button=document.createElement('button');button.textContent='查看 →';button.disabled=!g.ids.length;
    button.setAttribute('aria-label','查看 '+g.label+' 的 '+g.count+' 个'+unitLabel(result.state));button.addEventListener('click',()=>onSelect(g.ids));td.append(button);tr.append(td);return tr;
  }));
}

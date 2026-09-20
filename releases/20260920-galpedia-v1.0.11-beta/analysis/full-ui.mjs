import {FIELDS,field,groupField} from './model.mjs';
import {usedFields} from './full-data.mjs';
const $=id=>document.getElementById(id);
function select(id,label,values,change){
  const wrap=document.createElement('label');wrap.className='full-control';wrap.append(document.createTextNode(label));
  const input=document.createElement('select');input.id=id;
  for(const [key,name] of values){const o=document.createElement('option');o.value=key;o.textContent=name;input.append(o);}
  input.addEventListener('change',()=>change(input.value));wrap.append(input);return wrap;
}
export function mountFullUI(data,apply,dashboard){
  $('bin-width').min='0.1';$('bin-width').step='0.1';
  for(const value of ['0.2','0.1']){const o=document.createElement('option');o.value=value;o.textContent=value+' · 小数评分';$('density-width').prepend(o);}
  const toolbar=document.createElement('div');toolbar.className='full-data-toolbar';toolbar.id='full-data-toolbar';
  toolbar.append(select('analysis-grain','统计单位',[['work','主作品 · 每作一次'],['edition','发行版本 · 每版一次']],grain=>apply({grain})));
  const character=document.createElement('div');character.id='character-controls';character.hidden=true;
  character.append(select('character-aggregation','每作角色数值',[['median','中位数'],['mean','平均值'],['max','最大值']],characterAggregation=>apply({characterAggregation})),
    select('character-scope','角色范围',[['all','全部角色'],['primary','主要角色'],['female','标注为女性的角色']],characterScope=>apply({characterScope})));
  toolbar.append(character);document.querySelector('.company-chart-tools').after(toolbar);
  const note=document.createElement('p');note.id='full-data-note';note.className='full-data-note';note.setAttribute('role','status');toolbar.after(note);
  $('min-votes').closest('label').before(select('vote-source','评价人数来源',[['votes','EGS'],['bangumiVotes','Bangumi'],['vndbVotes','VNDB']],voteSource=>apply({voteSource})));
  const search=document.createElement('input');search.type='search';search.id='field-search';search.placeholder='搜索字段，例如 身高、剧本、评分';search.setAttribute('aria-label','搜索分析字段');
  document.querySelector('.field-instruction').after(search);
  const groups=document.createElement('div');groups.id='full-field-groups';search.after(groups);
  for(const name of ['作品','评分','标签','会社与制作人员','角色']){
    const d=document.createElement('details');d.className='full-field-group';d.open=name==='作品'||name==='评分';
    const summary=document.createElement('summary');summary.textContent=name;d.append(summary);
    for(const f of FIELDS.filter(f=>f.group===name)){
      const b=document.querySelector(`[data-field="${f.id}"]`);const badge=document.createElement('small');badge.textContent=f.coverage.toLocaleString()+' 版本';b.append(badge);
      b.title=f.label+' · '+f.coverage.toLocaleString()+' 个版本有有效资料'+(f.character?'；数值按每作角色汇总，版本专属资料优先':'');d.append(b);
    }
    groups.append(d);
  }
  for(const e of document.querySelectorAll('.data-panel .field-section-label,#number-fields,#category-fields'))e.hidden=true;
  search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();for(const d of groups.children){let count=0;for(const b of d.querySelectorAll('[data-field]')){b.hidden=!field(b.dataset.field).label.toLowerCase().includes(q);if(!b.hidden)count++;}d.hidden=!count;if(q&&count)d.open=true;}});
  const presets=[
    ['两位剧本家，评分怎样变化？',{chart:'line',x:'year',y:'median',seriesField:'scenario',groupMode:'auto',top:3,grain:'work'}],
    ['不同站点，评分一致吗？',{chart:'scatter',x:'bangumi',y:'vndb',trendLine:true,logX:false,minVotes:0,yearFrom:1900,yearTo:2100,grain:'work'}],
    ['角色身高与作品评分',{chart:'scatter',x:'height',y:'median',trendLine:true,logX:false,grain:'work',characterAggregation:'median'}],
    ['角色生日月份与评分分布',{chart:'density',x:'birthdayMonth',y:'median',densityStyle:'curve',groupSort:'name',top:12,grain:'work'}]
  ];
  for(const [label,patch] of presets){const b=document.createElement('button');b.className='preset';b.textContent=label;b.addEventListener('click',async()=>{
    dashboard.editor.open=false;$('company-presets').open=false;
    await apply({groupMode:'auto',search:'',tag:'',...patch});
    if(patch.seriesField==='scenario'&&window.workbenchDebug.state().seriesField==='scenario'){
      const keys=window.workbenchDebug.result().groups.slice(0,2).map(g=>String(g.key));
      await apply({groupMode:'manual',groupSelections:{...window.workbenchDebug.state().groupSelections,scenario:keys}});
    }
  });$('company-preset-menu').append(b);}
  document.querySelector('.dataset strong').textContent='全量公开作品';
  document.querySelector('.source-mini').textContent='v1.0.10-beta · 公开快照 · 字段组按需加载';
  document.querySelector('.settings-panel .method').textContent='主作品使用网站指定的代表版本。角色数值先按每作汇总；标签、会社与人物允许组间重叠，各组内只计一次。';
  for(const p of [...$('source-dialog').querySelectorAll(':scope > p')])p.remove();
  const info=document.createElement('p');info.textContent=`当前公开快照：${data.releaseId}。共 ${data.counts.works.toLocaleString()} 部主作品、${data.counts.editions.toLocaleString()} 个版本、${data.counts.characters.toLocaleString()} 个关联角色。主作品沿用指定代表版本，不合并评分。角色属性按需加载，版本专属属性优先；冲突、缺失和无法解析的值不填零。EGS 为版本评分中位数，Bangumi 为 0–10 分，VNDB 为 0–100 分；保留来源评分，不使用站内调整分。`;
  $('source-dialog').querySelector('.dialog-top').after(info);
  $('source-dialog').querySelector('a').href='full-data/manifest.json';
}
export function syncFullUI(result,data){
  if(!$('full-data-toolbar'))return;
  const s=result.state,unit=s.grain==='edition'?'版本':'主作品',chars=usedFields(s).filter(id=>field(id)?.character);
  $('analysis-grain').value=s.grain;$('character-aggregation').value=s.characterAggregation;$('character-scope').value=s.characterScope;$('vote-source').value=s.voteSource;
  $('character-controls').hidden=!chars.length;$('character-aggregation').closest('label').hidden=!chars.some(id=>field(id)?.type==='number');
  const aggregate={median:'中位数',mean:'平均值',max:'最大值'}[s.characterAggregation];
  const label=id=>field(id).character&&field(id).type==='number'?'每作'+field(id).short+aggregate:field(id).short;
  if(s.chart==='scatter')$('chart-title').textContent=label(s.x)+'与'+label(s.y);
  let note=s.grain==='work'?'每部主作品只计一次 · 日期、评分及关联资料取网站指定代表版本':'每个发行版本计一次 · 同作品的不同版本可能共享来源评分';
  if(chars.length){const summary=result.dataSummary;note+=' · 筛选内涉及 '+summary.characterCount.toLocaleString()+' 个版本—角色关系';
    for(const id of chars)if(summary.validCharacters[id]!==undefined)note+=' · '+field(id).short+'有效 '+summary.validCharacters[id].toLocaleString();
    if(summary.excludedFacts)note+=' · 排除冲突或不可解析属性 '+summary.excludedFacts.toLocaleString()+' 项';
  }
  if(field(groupField(s))?.multi)note+=' · 各组内去重，组间可重叠';
  if(s.grain==='edition'&&usedFields(s).some(id=>field(id)?.grain==='work'))note+=' · 制作/发行会社只有作品级关系，请切换到主作品视图';
  $('full-data-note').textContent=note;
  const counter=s.grain==='edition'?'个':'部';
  $('result-summary').textContent=`筛选 ${result.filteredCount.toLocaleString()} ${counter}${unit} · 图中 ${result.plottedCount.toLocaleString()} ${counter}${unit}`+(result.missingCount?` · 缺失/不可绘制 ${result.missingCount.toLocaleString()}`:'');
  $('chart-subtitle').textContent=$('chart-subtitle').textContent.replaceAll('EGS 发行版本',unit).replaceAll('发行版本',unit).replaceAll('版本',unit==='版本'?'版本':'作品');
  $('table-scope').textContent='明细与导出对应图中'+unit+'，使用代表版本 ID 打开网站详情。';
  document.querySelector('.company-metrics-heading > span').textContent='当前筛选 · '+unit+'等权';
  $('dataset-count').textContent=data.counts[s.grain==='edition'?'editions':'works'].toLocaleString();
  const small=$('dataset-count').parentElement;small.lastChild.textContent=' '+counter+unit;
  const detail=$('company-table-details').querySelector(':scope > summary');detail.firstChild.textContent=unit+'明细 ';$('company-detail-count').textContent=result.plottedCount.toLocaleString()+' '+counter+unit;
  const step=$('steps').lastElementChild;if(step)step.textContent=step.textContent.replace('按 EGS 版本 ID 计数','按'+unit+'去重计数');
}
export function migratePlan(plan,data){
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='company-dialog';const h=document.createElement('h2');h.textContent='将旧方案迁移到全量快照';
    const p=document.createElement('p'),ids=new Set(data.rows.map(r=>r.id)),kept=(Array.isArray(plan.selection)?plan.selection:[]).filter(id=>ids.has(id)).length;
    p.textContent=`原快照 ${plan.releaseId}；当前 ${data.releaseId}。字段和筛选将重新计算，样本数与统计结果会变化。原选择中 ${kept} 个版本 ID 仍存在，最终选择还需符合当前图表筛选。旧版方案保留发行版本口径。`;
    const missing=[plan.state?.x,plan.state?.y,...(Array.isArray(plan.state?.matrixFields)?plan.state.matrixFields:[])].filter(id=>id&&!field(id));
    if(missing.length)p.textContent+=' 不再可用的字段：'+missing.join('、')+'；将恢复默认字段。';
    const ok=document.createElement('button');ok.textContent='迁移并重新计算';const cancel=document.createElement('button');cancel.textContent='取消';
    const finish=value=>{d.close();d.remove();resolve(value);};ok.onclick=()=>finish(true);cancel.onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};
    d.append(h,p,ok,cancel);document.body.append(d);d.showModal();
  });
}

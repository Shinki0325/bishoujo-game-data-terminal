import {FIELDS,field,groupField,analysisGrain,unitLabel} from './model.mjs';
import {usedFields} from './full-data.mjs';
const $=id=>document.getElementById(id);
function select(id,label,values,change){
  const wrap=document.createElement('label');wrap.className='full-control';wrap.append(document.createTextNode(label));
  const input=document.createElement('select');input.id=id;
  for(const [key,name] of values){const o=document.createElement('option');o.value=key;o.textContent=name;input.append(o);}
  input.addEventListener('change',()=>change(input.value));wrap.append(input);return wrap;
}
export function mountFullUI(data,apply,dashboard){
  const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./birthday-distribution.css',import.meta.url).href;document.head.append(css);
  const birthday={chart:'histogram',x:'birthdayMonth',grain:'auto',characterScope:'all',minVotes:0,yearFrom:1900,yearTo:2100,search:'',tag:'',groupMode:'auto',groupSort:'name',top:12,minGroup:1,densityCurve:false,cumulativeCurve:false};
  const shortcut=document.createElement('button');shortcut.id='birthday-shortcut';shortcut.textContent='角色生日分布';shortcut.addEventListener('click',()=>apply(birthday));document.querySelector('.company-chart-tools').append(shortcut);
  const months=document.createElement('section');months.id='birthday-months';months.hidden=true;months.setAttribute('aria-label','一月至十二月人数与占比');$('chart-wrapper').after(months);
  $('bin-width').min='0.1';$('bin-width').step='0.1';
  for(const value of ['0.2','0.1']){const o=document.createElement('option');o.value=value;o.textContent=value+' · 小数评分';$('density-width').prepend(o);}
  const toolbar=document.createElement('div');toolbar.className='full-data-toolbar';toolbar.id='full-data-toolbar';
  toolbar.append(select('analysis-grain','统计单位',[['auto','自动 · 随字段选择'],['work','主作品 · 每作一次'],['edition','发行版本 · 每版一次']],grain=>apply({grain})));
  const character=document.createElement('div');character.id='character-controls';character.hidden=true;
  character.append(select('character-aggregation','每作角色数值',[['median','中位数'],['mean','平均值'],['max','最大值']],characterAggregation=>apply({characterAggregation})),
    select('character-scope','角色范围',[['all','全部角色'],['primary','仅主要角色'],['female','仅女性角色']],characterScope=>apply({characterScope})));
  toolbar.append(character);document.querySelector('.company-chart-tools').after(toolbar);
  const scope=$('character-scope').closest('label');scope.id='character-scope-control';scope.hidden=true;document.querySelector('.company-quick-options').prepend(scope);
  $('character-scope').setAttribute('aria-label','角色范围');
  const note=document.createElement('p');note.id='full-data-note';note.className='full-data-note';note.setAttribute('role','status');toolbar.after(note);
  $('min-votes').closest('label').before(select('vote-source','评价人数来源',[['votes','EGS'],['bangumiVotes','Bangumi'],['vndbVotes','VNDB']],voteSource=>apply({voteSource})));
  const search=document.createElement('input');search.type='search';search.id='field-search';search.placeholder='搜索字段，例如 身高、剧本、评分';search.setAttribute('aria-label','搜索分析字段');
  document.querySelector('.field-instruction').after(search);
  const groups=document.createElement('div');groups.id='full-field-groups';search.after(groups);
  for(const name of ['作品','评分','标签','会社与制作人员','角色']){
    const d=document.createElement('details');d.className='full-field-group';d.open=name==='作品'||name==='评分';
    const summary=document.createElement('summary');summary.textContent=name;d.append(summary);
    for(const f of FIELDS.filter(f=>f.group===name)){
      const b=document.querySelector(`[data-field="${f.id}"]`);
      if(f.id==='contextGroup'){b.title='由来源页面选定的会社或人物及其作品组成';const badge=document.createElement('small');badge.textContent='来源限定';b.append(badge);d.append(b);continue;}
      const coverage=f.character?data.characterEntityCoverage[f.id]:f.coverage;const badge=document.createElement('small');badge.textContent=coverage.toLocaleString()+(f.character?' 角色':' 版本');b.append(badge);
      b.title=f.label+' · '+coverage.toLocaleString()+(f.character?' 名角色有有效通用资料；角色与作品混用时按关联关系统计':' 个版本有有效资料');d.append(b);
    }
    groups.append(d);
  }
  for(const e of document.querySelectorAll('.data-panel .field-section-label,#number-fields,#category-fields'))e.hidden=true;
  search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();for(const d of groups.children){let count=0;for(const b of d.querySelectorAll('[data-field]')){b.hidden=!field(b.dataset.field).label.toLowerCase().includes(q);if(!b.hidden)count++;}d.hidden=!count;if(q&&count)d.open=true;}});
  const presets=[
    ['两位剧本家，评分怎样变化？',{chart:'line',x:'year',y:'median',seriesField:'scenario',groupMode:'auto',top:3,grain:'work'}],
    ['不同站点，评分一致吗？',{chart:'scatter',x:'bangumi',y:'vndb',trendLine:true,logX:false,minVotes:0,yearFrom:1900,yearTo:2100,grain:'work'}],
    ['角色身高如何分布？',{chart:'histogram',x:'height',color:'none',grain:'auto',minVotes:0,yearFrom:1900,yearTo:2100,binWidth:5}],
    ['角色生日集中在哪些月份？',birthday],
    ['角色身高与作品评分',{chart:'scatter',x:'height',y:'median',trendLine:true,logX:false,grain:'auto'}],
    ['角色生日月份与评分分布',{chart:'density',x:'birthdayMonth',y:'median',densityStyle:'curve',groupSort:'name',top:12,grain:'auto'}]
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
  for(const option of document.querySelectorAll('[data-chart="histogram"],#workbench-chart-type option[value="histogram"]'))option.textContent='分布图';
  document.querySelector('.source-mini').textContent='v1.0.10-beta · 公开快照 · 字段组按需加载';
  document.querySelector('.settings-panel .method').textContent='主作品使用网站指定的代表版本。纯角色图每人一次；混合图每个角色—主作品关系一次。标签、会社与人物允许组间重叠，各组内只计一次。';
  for(const p of [...$('source-dialog').querySelectorAll(':scope > p')])p.remove();
  const info=document.createElement('p');info.textContent=`当前公开快照：${data.releaseId}。共 ${data.counts.works.toLocaleString()} 部主作品、${data.counts.editions.toLocaleString()} 个版本、${data.counts.characters.toLocaleString()} 个关联角色。主作品沿用指定代表版本，不合并评分。纯角色图使用角色通用属性并按身份去重。混合图按角色—主作品关系去重，同作版本专属属性一致时优先；冲突、缺失和无法解析的值不填零。EGS 为版本评分中位数，Bangumi 为 0–10 分，VNDB 为 0–100 分；保留来源评分，不使用站内调整分。`;
  $('source-dialog').querySelector('.dialog-top').after(info);
  $('source-dialog').querySelector('a').href='full-data/manifest.json';
}
export function syncFullUI(result,data,selectRows,selection=new Set()){
  if(!$('full-data-toolbar'))return;
  const s=result.state,grain=analysisGrain(s),unit=unitLabel(s),individual=['character','appearance'].includes(grain),chars=usedFields(s).filter(id=>field(id)?.character);
  $('analysis-grain').value=s.grain;$('character-aggregation').value=s.characterAggregation;$('character-scope').value=s.characterScope;$('vote-source').value=s.voteSource;
  const opts=$('analysis-grain').options;opts[0].textContent='自动 · '+unitLabel({...s,grain:'auto'});opts[1].textContent=chars.length?'按主作品汇总角色':'主作品 · 每作一次';opts[2].textContent=chars.length?'按发行版本汇总角色':'发行版本 · 每版一次';
  $('character-scope-control').hidden=!chars.length;
  $('character-scope').title=s.characterScope==='primary'?'仅包含在关联作品中标注为主要角色的记录。':s.characterScope==='female'?'仅包含资料中明确标注为女性的角色；未知性别不计入。':'包含全部角色，不限制角色地位或性别。';
  $('character-controls').hidden=!chars.length;$('character-aggregation').closest('label').hidden=individual||!chars.some(id=>field(id)?.type==='number');
  const aggregate={median:'中位数',mean:'平均值',max:'最大值'}[s.characterAggregation];
  const label=id=>!individual&&field(id).character&&field(id).type==='number'?'每'+(grain==='edition'?'版':'作')+field(id).short+aggregate:field(id).short;
  if(s.chart==='scatter')$('chart-title').textContent=label(s.x)+'与'+label(s.y);
  else if(!individual)for(const id of chars)if(field(id).type==='number'&&!$('chart-title').textContent.includes(label(id)))$('chart-title').textContent=$('chart-title').textContent.replace(field(id).short,label(id));
  let note={work:'每部主作品只计一次 · 日期、评分及关联资料取网站指定代表版本',edition:'每个发行版本计一次 · 同作品的不同版本可能共享来源评分',character:'每名角色只计一次 · 按角色来源 ID 去重，使用角色通用属性',appearance:'每个角色—主作品关系计一次 · 同作多个发行版本合并 · 日期与评分取主作品代表版本'}[grain];
  if(individual)note+=' · 作品筛选先限定关联作品，再统计角色；缺失、冲突属性不填零';
  if(grain==='appearance')note+=' · 同一角色跨作品可多次出现，评分属于作品';
  if(chars.length){const summary=result.dataSummary;note+=' · 筛选内 '+summary.characterCount.toLocaleString()+(individual?' 名不同角色':' 个版本—角色关系');
    for(const id of chars)if(summary.validCharacters[id]!==undefined)note+=' · '+field(id).short+'有效 '+summary.validCharacters[id].toLocaleString()+(individual?' 条':' 人次');
    if(summary.excludedFacts)note+=' · 排除冲突或不可解析属性 '+summary.excludedFacts.toLocaleString()+' 项';
  }
  if(field(groupField(s))?.multi&&grain!=='character')note+=' · 各组内去重，组间可重叠';
  $('full-data-note').textContent=note;
  $('result-summary').textContent=`筛选 ${result.filteredCount.toLocaleString()} 个${unit} · 图中 ${result.plottedCount.toLocaleString()} 个${unit}`+(result.missingCount?` · 缺失/不可绘制 ${result.missingCount.toLocaleString()}`:'');
  const replace=text=>text.replaceAll('EGS 发行版本',unit).replaceAll('发行版本',unit).replaceAll('版本',unit==='版本'?'版本':unit);
  for(const id of ['chart-subtitle','chart-method','chart-purpose','chart-hint','mark-legend','density-unit','cdf-readout'])$(id).textContent=replace($(id).textContent);
  $('chart-hint').textContent=$('chart-hint').textContent.replaceAll('作品',individual?'记录':'作品');
  for(const li of $('steps').children)li.textContent=replace(li.textContent).replace('EGS '+unit+' ID','统计单位 ID');
  $('chart').setAttribute('aria-label',$('chart-title').textContent+'；'+$('chart-subtitle').textContent+'。下方提供对应'+unit+'明细。');
  document.querySelector('.company-metrics-heading > span').textContent='当前筛选 · '+unit+'等权';
  const total=grain==='character'?data.counts.characters:grain==='appearance'?result.filteredCount:data.counts[grain==='edition'?'editions':'works'];
  $('dataset-count').textContent=total.toLocaleString();$('dataset-count').parentElement.lastChild.textContent=' 个'+unit;
  const detail=$('company-table-details').querySelector(':scope > summary');detail.firstChild.textContent=unit+'明细 ';
  $('search').placeholder=individual?'查找角色名或来源 ID':'查找作品或会社';
  const brush=$('company-brush').parentElement.lastChild;if(brush.nodeType===Node.TEXT_NODE)brush.textContent=' 拖动框选';
  const brushHelp='拖动鼠标框选多个点或柱子，查看对应'+(individual?'角色':'作品')+'的明细，或继续筛选；关闭后仍可点击图形选择。';
  $('company-brush').parentElement.title=brushHelp;$('company-brush').setAttribute('aria-description',brushHelp);
  const count=result.categoryDistribution||s.chart==='bar'&&s.aggregation==='count',birthday=count&&s.x==='birthdayMonth';
  $('birthday-months').hidden=!birthday;$('birthday-shortcut').setAttribute('aria-pressed',String(birthday&&grain==='character'));
  if(result.categoryDistribution){
    $('chart-subtitle').textContent='每个分类一根柱 · 按'+unit+'计数';$('chart-purpose').textContent='看各类有多少记录。点击柱子或分类名称查看明细。';
    $('chart-method').textContent='柱高表示各类数量。占比以图中有可用分类资料的记录为分母；未标注资料不归入任何类别。';
    $('chart-hint').textContent='点击分类查看明细';$('mark-legend').textContent='柱高：'+unit+'数量';
  }
  if(birthday){
    const known=result.plottedCount,missing=result.filteredCount-known;
    $('chart-title').textContent='角色生日的月份分布';
    $('chart-subtitle').textContent=`1—12 月完整显示 · 已知 ${known.toLocaleString()} / ${result.filteredCount.toLocaleString()} 个${unit} · ${missing.toLocaleString()} 个暂无可用生日月份`;
    $('chart-purpose').textContent='按自然月份比较人数，不按热度截取前几个月。';
    $('chart-method').textContent='按 1—12 月排序，零人数月份也保留。占比只以有可用生日月份的记录为分母，未知或冲突资料不分配月份。月份是周期分类，不叠加连续密度或累计曲线。';
    $('chart-hint').textContent='下方列出每月人数与占比 · 点击月份查看角色';
    $('birthday-months').replaceChildren(...result.groups.map(g=>{
      const b=document.createElement('button');b.type='button';b.disabled=!g.count;b.dataset.month=String(parseInt(g.key));
      const month=document.createElement('span'),n=document.createElement('strong'),share=document.createElement('small');month.textContent=g.label;n.textContent=g.count.toLocaleString();share.textContent=(known?(g.count/known*100).toFixed(1):'0.0')+'%';
      b.append(month,n,share);b.setAttribute('aria-label',`${g.label}，${g.count} 个${unit}，占已知生日 ${share.textContent}`);b.setAttribute('aria-pressed',String(!!g.count&&g.ids.every(id=>selection.has(id))));b.addEventListener('click',()=>selectRows?.(g.ids));return b;
    }));
  }
  $('chart').setAttribute('aria-label',$('chart-title').textContent+'；'+$('chart-subtitle').textContent);

}
export function migratePlan(plan,data){
  return new Promise(resolve=>{
    const d=document.createElement('dialog');d.className='company-dialog';const h=document.createElement('h2');h.textContent='将旧方案迁移到全量快照';
    const p=document.createElement('p'),ids=new Set(data.rows.map(r=>r.id)),kept=(Array.isArray(plan.selection)?plan.selection:[]).filter(id=>ids.has(id)).length;
    p.textContent=`原快照 ${plan.releaseId}；当前 ${data.releaseId}。字段和筛选将重新计算，样本数与统计结果会变化。原选择中 ${kept} 个版本 ID 仍存在，最终选择还需符合当前图表筛选。旧角色方案自动迁移到角色统计，旧选择将重新验证。`;
    const missing=[plan.state?.x,plan.state?.y,...(Array.isArray(plan.state?.matrixFields)?plan.state.matrixFields:[])].filter(id=>id&&!field(id));
    if(missing.length)p.textContent+=' 不再可用的字段：'+missing.join('、')+'；将恢复默认字段。';
    const ok=document.createElement('button');ok.textContent='迁移并重新计算';const cancel=document.createElement('button');cancel.textContent='取消';
    const finish=value=>{d.close();d.remove();resolve(value);};ok.onclick=()=>finish(true);cancel.onclick=()=>finish(false);d.oncancel=e=>{e.preventDefault();finish(false);};
    d.append(h,p,ok,cancel);document.body.append(d);d.showModal();
  });
}

import {describe,groupField,chartRows} from './model.mjs';
import {seriesColor} from './chart-theme.mjs';
import {format} from './chart.mjs';
const $=id=>document.getElementById(id);
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
const button=(text,action,className)=>{const b=el('button',className,text);b.type='button';b.addEventListener('click',action);return b;};

export function companySummaries(result,threshold=result.state.cdfThreshold){
  const byId=new Map(chartRows(result).map(row=>[row.id,row]));
  return (result.groups??[]).map((group,index)=>{
    const rows=group.ids.map(id=>byId.get(id)).filter(r=>r&&Number.isFinite(r.median));
    const stats=describe(rows.map(r=>r.median)),high=rows.filter(r=>r.median>=threshold).length;
    const years=rows.map(r=>r.year).filter(Number.isFinite);
    return {key:String(group.key),color:seriesColor(group.key),rows,...stats,high,
      share:rows.length?high/rows.length:null,period:years.length?`${Math.min(...years)}–${Math.max(...years)}`:'暂无版本',
      recent:[...rows].sort((a,b)=>String(b.date).localeCompare(String(a.date))||Number(b.id)-Number(a.id)).slice(0,6)};
  });
}
const eligible=r=>r.state.groupMode==='manual'&&groupField(r.state)==='company'&&(
  r.state.chart==='line'&&r.state.x==='year'&&r.state.y==='median'||
  r.state.chart==='ecdf'&&r.state.x==='median'||
  ['density','box'].includes(r.state.chart)&&r.state.y==='median');

export class CompanyDashboard{
  constructor(getResult,onChange,onSelect){
    this.getResult=getResult;this.onChange=onChange;this.onSelect=onSelect;this.active=false;this.exploring=false;
    this.hero=el('section','company-dashboard');this.hero.id='company-dashboard';this.hero.hidden=true;
    this.hero.innerHTML='<div class="comparison-heading"><div class="comparison-title"><h1>会社对比</h1><details id="company-presets"><summary>换个问题 ▾</summary><div id="company-preset-menu"></div></details></div><div class="comparison-actions"><button id="company-edit" aria-expanded="false" aria-controls="company-editor">编辑图表</button><button id="company-explore">自由探索</button></div></div><div id="company-cards" class="company-cards"></div><div class="company-metrics-heading"><span>当前筛选 · 版本等权</span><label>高分门槛 ≥ <input id="company-threshold" aria-label="高分门槛" type="number" min="0" max="100" step="0.5" value="80"> 分</label></div><div id="company-metrics" class="company-metrics"></div>';
    const actions=el('details','company-actions-menu');actions.innerHTML='<summary aria-label="更多操作">···</summary><div id="company-actions-extra"></div>';
    this.hero.querySelector('.comparison-actions').append(actions);actions.querySelector('#company-actions-extra').append(this.hero.querySelector('#company-explore'));
    actions.addEventListener('click',e=>{if(e.target.closest('button'))actions.open=false;});
    for(const menu of [actions,$('company-presets')??this.hero.querySelector('#company-presets')])menu.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();menu.open=false;menu.querySelector('summary').focus();}});
    document.addEventListener('pointerdown',e=>{for(const menu of [actions,this.hero.querySelector('#company-presets')])if(!menu.contains(e.target))menu.open=false;});
    const sheet=document.querySelector('.sheet');sheet.before(this.hero);
    this.editor=el('details','company-editor');this.editor.id='company-editor';this.editor.hidden=true;
    this.editor.innerHTML='<summary>编辑图表 <span>点击收起</span></summary><nav class="editor-tabs" aria-label="编辑面板"><button data-editor-tab="fields">字段</button><button data-editor-tab="main">图表</button><button data-editor-tab="filters">筛选与方案</button></nav><div class="company-editor-grid"><div id="company-editor-fields"></div><div id="company-editor-main"></div><div id="company-editor-filters"></div></div>';
    document.body.append(this.editor);
    this.editor.setAttribute('aria-label','图表编辑侧栏');
    this.editor.querySelectorAll('[data-editor-tab]').forEach(b=>b.addEventListener('click',()=>this.setEditorTab(b.dataset.editorTab)));
    this.setEditorTab('main');
    $('company-editor-main').append(this.hero.querySelector('.company-metrics-heading'));
    const selectionSlot=el('div');selectionSlot.id='company-selection-slot';document.querySelector('.chart-footer').append(selectionSlot);
    this.quick=el('div','company-chart-tools');this.quick.hidden=true;
    this.quick.innerHTML='<div class="company-view-tabs" role="group" aria-label="会社对比视图"><button data-company-view="line">评分走势</button><button data-company-view="density">分布比较</button><button data-company-view="ecdf">累计比例</button><button id="company-show-recent">逐作明细 ↓</button></div><div class="company-quick-options"><label id="company-unit-label">走势 <select id="company-line-unit"><option value="year">按年汇总</option><option value="edition">逐部作品</option></select></label><label id="company-grain-label" hidden>每格 <select id="company-grain"><option value="0.5">0.5 分</option><option value="1">1 分</option><option value="2">2 分</option><option value="5">5 分</option></select></label><button id="company-zoom">放大到 60–100 分</button></div>';
    document.querySelector('.chart-heading').before(this.quick);
    const chartPicker=el('label','workbench-chart-picker');chartPicker.id='workbench-chart-picker';
    chartPicker.append(document.createTextNode('图表'));
    const chartSelect=el('select');chartSelect.id='workbench-chart-type';chartSelect.setAttribute('aria-label','图表类型');
    for(const tab of document.querySelectorAll('button[data-chart]')){const option=el('option','',tab.textContent);option.value=tab.dataset.chart;chartSelect.append(option);}
    chartSelect.addEventListener('change',()=>document.querySelector('button[data-chart="'+chartSelect.value+'"]').click());
    chartPicker.append(chartSelect);this.quick.prepend(chartPicker);
    const shortcuts=el('div','workbench-shortcuts');
    shortcuts.append(button('字段',()=>this.openEditor('fields')),button('筛选',()=>this.openEditor('filters')));
    this.quick.querySelector('.company-quick-options').append(shortcuts);

    const brushLabel=el('label'),brush=el('input');brush.type='checkbox';brush.id='company-brush';brushLabel.append(brush,document.createTextNode('框选作品'));this.quick.querySelector('.company-quick-options').append(brushLabel);
    brush.addEventListener('change',()=>this.onChange({brushEnabled:brush.checked},{preserveSelection:true}));
    for(const axis of ['x','y'])$('axis-drop-'+axis).addEventListener('click',()=>{this.openEditor('main');$(axis+'-field').scrollIntoView({behavior:'instant',block:'center'});},{capture:true});
    this.recent=el('details','company-recent');this.recent.id='company-recent';this.recent.hidden=true;
    this.recent.innerHTML='<summary>最近作品 <span>每家最近 6 个版本</span></summary><div class="recent-heading"><div><h2>沿着发行时间，看看最近的作品</h2><p>每家最近 6 个入选 EGS 版本 · 新 → 旧 · 点击评分查看明细</p></div><div class="rating-scale"><span>评分 0</span><i></i><span>100</span></div></div><div id="company-recent-groups" class="company-recent-groups"></div>';
    sheet.after(this.recent);
    this.tableDetails=el('details','company-table-details');this.tableDetails.id='company-table-details';
    this.tableDetails.innerHTML='<summary>版本明细 <span id="company-detail-count"></span></summary>';
    $('table-panel').before(this.tableDetails);this.tableDetails.append($('table-panel'));this.tableDetails.open=false;
    $('jump-details').addEventListener('click',()=>{this.tableDetails.open=true;},{capture:true});
    this.dialog=el('dialog','company-dialog');this.dialog.id='company-dialog';this.dialog.setAttribute('aria-labelledby','company-dialog-title');
    this.dialog.innerHTML='<div class="dialog-top"><h2 id="company-dialog-title">更换对比会社</h2><button id="company-dialog-close" aria-label="关闭会社选择">×</button></div><input id="company-search" type="search" aria-label="搜索会社" placeholder="输入会社名称"><p id="company-search-note"></p><div id="company-results"></div>';
    document.body.append(this.dialog);
    $('company-edit').addEventListener('click',()=>{if(this.editor.open)this.editor.open=false;else this.openEditor('main');});
    this.editor.addEventListener('toggle',()=>{$('company-edit').setAttribute('aria-expanded',String(this.editor.open));document.body.classList.toggle('company-editing',this.editor.open);});
    this.editor.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();this.editor.open=false;(this.editorReturnFocus??$('company-edit')).focus({preventScroll:true});}});
    $('company-explore').addEventListener('click',()=>{this.exploring=true;this.editor.open=false;this.render();this.hero.scrollIntoView({behavior:'smooth',block:'start'});});
    document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{this.exploring=false;this.editor.open=false;$('company-presets').open=false;this.render();}));
    $('company-threshold').addEventListener('change',e=>{const value=Number(e.target.value);if(e.target.value!==''&&Number.isFinite(value)&&value>=0&&value<=100)this.onChange({cdfThreshold:value},{preserveSelection:true});else e.target.value=this.getResult().state.cdfThreshold;});
    this.quick.querySelectorAll('[data-company-view]').forEach(b=>b.addEventListener('click',()=>this.changeView(b.dataset.companyView)));
    $('company-line-unit').addEventListener('change',e=>this.onChange({lineUnit:e.target.value}));
    const styleLabel=el('label');styleLabel.id='company-density-style-label';styleLabel.innerHTML='显示 <select id="company-density-style"><option value="curve">平滑轮廓</option><option value="bins">精确分箱</option></select>';this.quick.querySelector('.company-quick-options').prepend(styleLabel);
    $('company-density-style').addEventListener('change',e=>this.onChange({densityStyle:e.target.value},{preserveSelection:true}));
    $('company-grain').addEventListener('change',e=>this.onChange({densityWidth:Number(e.target.value)}));
    $('company-zoom').addEventListener('click',()=>this.onChange(this.getResult().view.active?{viewActive:false}:{viewActive:true,viewMin:60,viewMax:100},{preserveSelection:true}));
    $('company-show-recent').addEventListener('click',()=>{this.recent.open=true;this.recent.scrollIntoView({behavior:'smooth',block:'start'});});
    $('company-dialog-close').addEventListener('click',()=>this.dialog.close());
    this.dialog.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();this.dialog.close();}});
    $('company-search').addEventListener('input',()=>this.renderChoices());
    this.dialog.addEventListener('close',()=>this.restoreFocus?.focus({preventScroll:true}));
  }
  setEditorTab(tab){
    this.editorTab=tab;
    for(const name of ['fields','main','filters'])$('company-editor-'+name).hidden=name!==tab;
    this.editor.querySelectorAll('[data-editor-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.editorTab===tab)));
  }
  openEditor(tab='main'){
    if(!this.editor.contains(document.activeElement))this.editorReturnFocus=document.activeElement;
    this.setEditorTab(tab);this.editor.open=true;document.body.classList.add('company-editing');
    this.editor.querySelector('[data-editor-tab="'+tab+'"]').focus({preventScroll:true});
  }
  syncSelection(count,reveal=false){
    $('company-detail-count').textContent=(count?`已选 ${count}`:`${chartRows(this.getResult()).length}`)+' 个版本';
    if(count&&reveal)this.tableDetails.open=true;
  }
  changeView(chart){
    this.onChange({chart,...(chart==='density'?{densityStyle:'curve'}:{}),x:chart==='line'?'year':chart==='ecdf'?'median':'company',y:'median',seriesField:'company',brushGroup:'',facet:false,intensity:'share'});
  }
  moveEditor(active){
    if(!this.mounted){
      $('group-summary').open=false;this.tableDetails.open=false;
      for(const [selector,target] of [
        ['#selection-tools','company-selection-slot'],['.preset-row','company-preset-menu'],['.top-actions','company-actions-extra'],['.data-panel','company-editor-fields'],['.settings-panel','company-editor-filters'],
        ...['.sheet-top','.shelves','#chart-purpose','#chart-options','#comparison-picker','#score-view-control','#selection-toolbar'].map(s=>[s,'company-editor-main'])]){
        $(target).append(document.querySelector(selector));
      }
      const notes=document.querySelector('.chart-method-details');
      notes.querySelector('summary').textContent='统计摘要与读图说明';
      notes.append($('overview'),$('overlay-summary'));
      document.querySelector('.chart-footer').append($('layer-legend'));
      this.mounted=true;document.body.classList.add('workbench-compact');
    }
    this.active=active;document.body.classList.toggle('company-mode',active);
    this.hero.hidden=this.quick.hidden=this.editor.hidden=false;
    this.recent.hidden=!active;
    $('company-cards').hidden=$('company-metrics').hidden=!active;
    document.querySelector('.company-metrics-heading').hidden=!active;
    this.quick.querySelector('.company-view-tabs').hidden=!active;
    $('workbench-chart-picker').hidden=false;
    $('company-explore').hidden=!active;
    this.hero.querySelector('h1').textContent=active?'会社对比':'数据工作台';
  }
  render(){
    const r=this.getResult();if(!r)return;this.moveEditor(!this.exploring&&eligible(r));
    const s=r.state;
    $('workbench-chart-type').value=s.chart;
    $('company-brush').closest('label').hidden=s.chart==='matrix';
    $('company-brush').checked=s.brushEnabled;
    $('company-unit-label').hidden=!this.active||s.chart!=='line';
    $('company-density-style-label').hidden=!this.active||s.chart!=='density';
    $('company-grain-label').hidden=!this.active||s.chart!=='density'||s.densityStyle==='curve';
    $('company-zoom').hidden=!this.active;
    this.syncSelection(0);
    if(!this.active)return;
    const groups=companySummaries(r);
    $('company-threshold').value=s.cdfThreshold;
    $('company-cards').replaceChildren(...groups.map((g,i)=>{
      const card=el('article','company-card');card.style.setProperty('--company-color',g.color);
      const identity=el('div','company-identity'),mark=el('span','company-monogram',g.key.slice(0,2).toUpperCase()),text=el('div');
      text.append(el('h3','',g.key));identity.append(mark,text);
      const change=button('更换 ▾',()=>this.openChoices(i,change));change.setAttribute('aria-label','更换会社 '+g.key);identity.append(change);
      card.append(identity,el('p','company-meta',`${g.n.toLocaleString()} 个有效版本 · ${g.period}`));return card;
    }));
    if(!groups.length)$('company-cards').append(button('选择要比较的会社',()=>{this.openEditor('main');$('comparison-picker').open=true;$('group-search').focus();}));
    const metrics=[
      {label:'典型评分',value:g=>format(g.median),note:'各版本评分中位数的中位数',view:'line',delta:groups.length===2&&groups.every(g=>g.n)?`相差 ${format(Math.abs(groups[0].median-groups[1].median))} 分`:''},
      {label:'中间 50% 的评分',value:g=>g.n?`${format(g.q1)}–${format(g.q3)}`:'—',note:'范围越窄，中间一半版本越集中',view:'density'},
      {label:`≥ ${format(s.cdfThreshold)} 分的比例`,value:g=>g.share===null?'—':(g.share*100).toFixed(1)+'%',note:'达到门槛的版本 / 本组有效版本',view:'ecdf',delta:groups.length===2&&groups.every(g=>g.n)?`相差 ${(Math.abs(groups[0].share-groups[1].share)*100).toFixed(1)} 个百分点`:''}
    ];
    $('company-metrics').replaceChildren(...metrics.map(m=>{
      const card=button('',()=>this.changeView(m.view),'company-metric');card.append(el('span','metric-label',m.label+' ↗'));
      const values=el('div','metric-values');for(const g of groups){const v=el('div');v.style.color=g.color;v.append(el('strong','',m.value(g)),el('small','',g.key));if(m.view==='ecdf')v.append(el('small','',`${g.high} / ${g.n} 个`));values.append(v);}
      card.append(values,el('small','metric-note',m.delta||m.note));card.title=m.note+(m.delta?'；'+m.delta:'');return card;
    }));
    this.quick.querySelectorAll('[data-company-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.companyView===s.chart)));
    $('company-unit-label').hidden=s.chart!=='line';$('company-line-unit').value=s.lineUnit;
    $('company-brush').checked=s.brushEnabled;
    $('company-density-style-label').hidden=s.chart!=='density';$('company-density-style').value=s.densityStyle;
    $('company-grain-label').hidden=s.chart!=='density'||s.densityStyle==='curve';$('company-grain').value=String(s.densityWidth);
    if(!$('company-grain').value){const o=el('option','',format(s.densityWidth)+' 分');o.value=s.densityWidth;$('company-grain').append(o);$('company-grain').value=s.densityWidth;}
    $('company-zoom').textContent=r.view.active?'恢复完整评分范围':'放大到 60–100 分';
    $('company-recent-groups').replaceChildren(...groups.map(g=>{
      const section=el('section','recent-company');section.style.setProperty('--company-color',g.color);
      section.append(el('h3','',g.key));const list=el('div','recent-editions');
      for(const row of g.recent){const b=button('',()=>{this.tableDetails.open=true;this.onSelect([row.id]);$('table-panel').scrollIntoView({behavior:'smooth',block:'start'});},'recent-edition');b.dataset.editionId=row.id;
        b.title=`${row.title}\n${row.date} · EGS ${row.id}\n评分 ${row.median} · ${row.votes.toLocaleString()} 人评价`;
        b.setAttribute('aria-label',`查看 ${row.title}，${row.date}，评分 ${row.median}，EGS ${row.id}`);
        const badge=el('strong','rating-badge',format(row.median));badge.style.background=`hsl(265 42% ${96-row.median*.58}%)`;badge.style.color=row.median>=60?'#fff':'#30223f';
        const title=el('span','edition-title',row.title);b.append(badge,title,el('small','',row.date));list.append(b);
      }
      if(!g.recent.length)list.append(el('p','', '当前条件下暂无版本，请调整筛选。'));section.append(list);return section;
    }));
  }
  openChoices(index,trigger){this.replaceIndex=index;this.restoreFocus=trigger;$('company-search').value='';$('company-dialog-title').textContent='更换 '+this.getResult().manualKeys[index];this.renderChoices();this.dialog.showModal();$('company-search').focus();}
  renderChoices(){
    const r=this.getResult(),query=$('company-search').value.trim().toLocaleLowerCase(),keys=r.manualKeys;
    const choices=r.availableGroups.filter(g=>String(g.key).toLocaleLowerCase().includes(query));
    $('company-search-note').textContent=`${choices.length} 家匹配 · 数量对应当前筛选${choices.length>60?' · 显示前 60 家':''}`;
    $('company-results').replaceChildren(...choices.slice(0,60).map(g=>{
      const b=button('',()=>{const updated=[...keys];updated[this.replaceIndex]=String(g.key);this.dialog.close();this.onChange({groupSelections:{...r.state.groupSelections,company:updated},brushGroup:''});this.hero.querySelectorAll('.company-identity button')[this.replaceIndex]?.focus({preventScroll:true});});
      b.disabled=keys.includes(String(g.key));b.append(el('strong','',g.key),el('small','',g.count+' 个版本'+(b.disabled?' · 已在对比':'')));return b;
    }));
    if(!choices.length)$('company-results').append(el('p','','没有匹配的会社，试试其他名称。'));
  }
}

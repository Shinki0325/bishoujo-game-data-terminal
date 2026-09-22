import {field,analysisGrain,unitLabel,plottedFields} from './model.mjs';
import {lineSegments} from './exploration.mjs';
import {newAnalysis,purposePatch,purposeFor,objectFor,scopeText,chartRequirement} from './builder-state.mjs';
const $=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const button=(text,action,id)=>{const b=node('button',text);b.type='button';if(id)b.id=id;b.addEventListener('click',action);return b;};
const choices=(id,label,options,change)=>{const wrap=node('label',label),select=node('select');select.id=id;select.setAttribute('aria-label',label);for(const [value,text] of options){const o=node('option',text);o.value=value;select.append(o);}select.onchange=()=>change(select.value);wrap.append(select);return wrap;};
const OBJECTS=[['work','作品'],['character','角色'],['appearance','角色与作品']];
const PURPOSES=[['distribution','看分布'],['compare','比组别'],['trend','看变化'],['relation','找关系']];
export class WorkbenchBuilder{
  constructor(api,dashboard){
    this.api=api;this.dashboard=dashboard;
    for(const name of ['workbench-builder.css','site-theme.css'])if(!document.querySelector(`link[rel="stylesheet"][href$="${name}"]`)){const css=node('link');css.rel='stylesheet';css.href=new URL('./'+name,import.meta.url).href;document.head.append(css);}
    document.body.classList.add('guided-workbench');
    const brand=document.querySelector('.site-header .brand'),home=brand.href,logo=node('img');
    logo.src=new URL('./brand-logo.webp',import.meta.url).href;logo.alt='少女箱庭 GALPEDIA';logo.width=1774;logo.height=887;
    brand.replaceChildren(logo);brand.setAttribute('aria-label','少女箱庭 GALPEDIA 首页');brand.removeAttribute('target');
    const nav=document.querySelector('.site-nav');nav.replaceChildren();nav.setAttribute('role','navigation');nav.setAttribute('aria-label','主站导航');
    for(const [label,hash] of [['作品库','works'],['会社库','companies'],['人物','persons'],['排榜','ranking'],['工作台',null]]){
      const link=node('a',label);link.href=hash?home+'#'+hash:new URL('analysis/',home).href;if(!hash)link.setAttribute('aria-current','page');nav.append(link);
    }
    const back=document.querySelector('.site-header .back');back.href=home;back.textContent='返回首页 ↗';back.removeAttribute('target');
    const title=document.querySelector('.comparison-title');title.append(button('新建分析',()=>this.launch('templates'),'new-analysis'),button('我的方案',()=>this.launch('saved'),'my-analyses'));
    const actions=document.querySelector('.comparison-actions');actions.prepend($('save-button'),choices('export-scope','导出范围',[['chart','整张图'],['selected','已选记录']],()=>this.syncExport()),$('export-button'));
    $('save-button').textContent='保存当前方案';$('company-edit').textContent='编辑图表';
    const context=node('div',null,'builder-context');context.id='builder-context';context.append(
      choices('analysis-object','分析对象',OBJECTS,value=>api.apply(purposePatch(api.result().state,purposeFor(api.result().state),value))),
      choices('analysis-purpose','我想',PURPOSES,value=>api.apply(purposePatch(api.result().state,value))),
      node('span',null,'builder-scope'),button('添加筛选',()=>dashboard.openEditor('filters'),'builder-filter'),button('添加曲线',()=>{dashboard.openEditor('main');$('inspector-layers').open=true;$('inspector-layers').scrollIntoView({block:'nearest'});},'builder-curves'));
    context.querySelector('.builder-scope').id='builder-scope';document.querySelector('.sheet').before(context);
    $('analysis-object').parentElement.hidden=true;$('analysis-purpose').parentElement.hidden=true;
    const question=node('strong');question.id='analysis-question';context.prepend(question);
    const config=node('div',null,'builder-config');config.id='builder-config';context.after(config);
    const status=node('div');status.id='builder-status';status.hidden=true;status.setAttribute('role','status');config.after(status);
    // Keep the actual, already-bound field wells and field list together.
    const slots=node('div',null,'builder-slots');slots.id='builder-slots';const metric=node('p');metric.id='builder-metric';slots.append(document.querySelector('.shelves'),metric,$('aggregation-control'));
    $('company-editor-fields').prepend(slots);
    const stats=node('details');stats.id='builder-statistics';stats.append(node('summary','汇总方式'),$('line-unit-control'),$('aggregation-control'));slots.append(stats);
    $('company-editor-fields').querySelector('.data-panel').prepend($('comparison-picker'));
    $('comparison-picker').querySelector('summary').after($('group-mode-control'));
    const library=node('details');library.id='builder-library';library.append(node('summary','浏览字段库 · 拖拽或点击添加'),document.querySelector('.field-instruction'),$('field-search'),$('full-field-groups'));$('company-editor-fields').querySelector('.data-panel').append(library);
    const finish=node('div',null,'builder-finish');finish.append(node('small','修改即时生效 · 可撤销'),button('完成编辑',()=>{dashboard.editor.open=false;$('company-edit').focus();},'finish-editing'));dashboard.editor.append(finish);
    dashboard.editor.querySelector(':scope > summary').firstChild.textContent='图表配置 ';
    const presentation=node('div',null,'comparison-presentation');presentation.id='comparison-presentation';presentation.append(node('span','呈现方式'),button('叠在一张图',()=>api.apply({facet:false},{preserveSelection:true}),'series-overlay'),button('每组一张小图',()=>api.apply({facet:true},{preserveSelection:true}),'series-facets'),node('small','点击图例突出某组，再点一次恢复'),button('取消突出',()=>api.apply({brushGroup:''},{preserveSelection:true}),'series-unfocus'));document.querySelector('.company-chart-tools').after(presentation);
    const gaps=node('p','虚线跨过当前筛选下没有可用数值的年份或月份，仅连接前后观测值，不补值、不预测。','series-gaps-note');gaps.id='series-gaps-note';presentation.after(gaps);
    document.querySelector('.field-instruction').textContent='拖到上方字段槽；也可点字段选择用途。';
    document.querySelector('[data-editor-tab=fields]').textContent='数据与字段';document.querySelector('[data-editor-tab=main]').textContent='图形与分析';document.querySelector('[data-editor-tab=filters]').textContent='筛选';
    // Keep long provenance and advanced counting controls out of the main reading path.
    const methodology=node('details');methodology.id='builder-method';methodology.append(node('summary','统计口径与资料说明'),$('full-data-toolbar'),$('full-data-note'));document.querySelector('.chart-method-details').append(methodology);
    $('builder-filter').after($('filter-chips')); // Conditions remain visible beside the object and purpose.
    const selectionSlot=$('company-selection-slot');document.querySelector('.chart-wrapper').closest('.sheet').after(selectionSlot);
    $('jump-details').textContent='看明细';$('clear-selection').textContent='清除选择';
    $('jump-details').after(button('仅看这些',()=>{const ids=[...api.selection()];if(ids.length)api.apply({recordFilter:{grain:analysisGrain(api.result().state),ids}});},'filter-selection'));
    const fieldDialog=node('dialog');fieldDialog.id='builder-field-dialog';fieldDialog.setAttribute('aria-labelledby','builder-field-title');fieldDialog.innerHTML='<div class="dialog-top"><h2 id="builder-field-title"></h2></div><p id="builder-field-note"></p><div id="builder-field-actions"></div>';fieldDialog.querySelector('.dialog-top').append(button('关闭',()=>fieldDialog.close()));document.body.append(fieldDialog);
    this.makeLauncher();
    const layerButton=$('builder-curves');layerButton.title='打开趋势线、密度曲线和累计占比设置';
    for(const shelf of document.querySelectorAll('.shelf')){
      shelf.addEventListener('dragover',e=>{const id=e.dataTransfer.getData('text/plain');if(id&&field(id))shelf.title='放到这里：'+field(id).label;});
    }
    this.sync();
  }
  makeLauncher(){
    const d=node('dialog');d.id='analysis-launcher';d.setAttribute('aria-labelledby','launcher-title');d.innerHTML='<div class="dialog-top"><h2 id="launcher-title">新建分析</h2></div><p id="launcher-note"></p><div id="launcher-object"></div><div id="launcher-new" class="analysis-cards"></div><div id="launcher-templates" class="analysis-cards"></div><details id="launcher-recent"><summary>已保存的方案</summary></details>';
    d.querySelector('.dialog-top').append(button('返回当前图表',()=>d.close()));
    const outside=e=>{const r=d.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
    let startedOutside=false;d.addEventListener('pointerdown',e=>{startedOutside=e.target===d&&outside(e);});
    d.addEventListener('click',e=>{if(startedOutside&&e.target===d&&outside(e))d.close();startedOutside=false;});
    const tabs=node('nav',null,'launcher-tabs');tabs.setAttribute('aria-label','开始分析');for(const [mode,label] of [['templates','从示例开始'],['new','自由搭图'],['saved','我的方案']]){const b=button(label,()=>this.launch(mode));b.dataset.launcherMode=mode;tabs.append(b);}d.querySelector('.dialog-top').after(tabs);
    d.querySelector('#launcher-recent').append($('saved-list'));
    d.querySelector('#launcher-object').append(choices('new-object','分析对象',OBJECTS,()=>{}));
    for(const [purpose,label] of PURPOSES){const b=button(label,()=>this.create($('new-object').value,purpose));b.dataset.intent=purpose;const descriptions={distribution:'各类有多少，数值集中在哪里',compare:'不同会社、标签或角色组有何差异',trend:'沿发行时间比较变化',relation:'把两个数值放在一起观察'};b.append(node('small',descriptions[purpose]));d.querySelector('#launcher-new').append(b);}
    const templates=[
      ['birthday','角色生日月份','角色 · 每人一次 · 全部角色',()=>({...newAnalysis('character'),x:'birthdayMonth'})],
      ['height','角色身高分布','角色 · 每人一次 · 全部角色',()=>newAnalysis('character')],
      ['companies','会社对比','自选最多 30 家会社 · 走势或分布',()=>({...newAnalysis('work','trend'),groupMode:'manual',groupSelections:{company:this.companyKeys()}})],
      ['writers','剧本家对比','自选最多 30 位剧本家 · 支持批量名单',()=>({...newAnalysis('work','trend'),seriesField:'scenario',groupMode:'auto',top:3})],
      ['tags','不同标签的评分分布','作品 · 标签可重叠 · 全部已知评分',()=>({...newAnalysis('work','compare'),chart:'density',x:'tags',y:'median',densityStyle:'curve'})],
      ['height-score','角色身高与作品评分','角色—主作品关系 · 同作版本去重',()=>newAnalysis('appearance','relation')]
    ];
    for(const [id,label,note,patch] of templates){const b=button(label,async()=>{d.close();await this.runNew(patch(),true);if(id==='writers'){const result=this.api.result();if(result.state.seriesField==='scenario'){const keys=result.groups.slice(0,2).map(g=>String(g.key));await this.api.apply({groupMode:'manual',groupSelections:{scenario:keys}});}}$('comparison-picker').open=!this.api.result().manualKeys?.length;});b.dataset.template=id;b.append(node('small',note));d.querySelector('#launcher-templates').append(b);}
    document.body.append(d);
  }
  companyKeys(){const all=new Set(this.api.data().rows.map(r=>r.company));return [...new Set(['Key','AUGUST'].filter(k=>all.has(k)).concat([...all]))].slice(0,2);}
  launch(mode='new'){
    $('launcher-title').textContent=mode==='saved'?'我的方案':'新建分析';$('launcher-note').textContent=mode==='new'?'选择统计对象和问题类型。新建会从全部数据开始，现有分析可以撤销恢复。':mode==='saved'?'保存在这台设备上的方案，点击继续分析。':'先打开一个示例，再调整字段、名单和筛选。';
    $('launcher-new').hidden=$('launcher-object').hidden=mode!=='new';$('launcher-templates').hidden=mode!=='templates';$('launcher-recent').hidden=mode!=='saved';$('launcher-recent').open=true;
    for(const b of document.querySelectorAll('[data-launcher-mode]'))b.setAttribute('aria-pressed',String(b.dataset.launcherMode===mode));
    $('new-object').value=objectFor(this.api.result().state);if(!$('analysis-launcher').open)$('analysis-launcher').showModal();
  }
  async create(object,purpose){$('analysis-launcher').close();await this.runNew(newAnalysis(object,purpose));}
  async runNew(state,fromTemplate=false){await this.api.apply(state);$('plan-name').value='';$('field-search').value='';$('field-search').dispatchEvent(new Event('input'));$('builder-library').open=!fromTemplate;$('builder-statistics').open=false;this.dashboard.openEditor('fields');}
  compact(){ $('comparison-picker').open=!this.api.result().manualKeys?.length;$('builder-library').open=false;$('builder-statistics').open=false; }
  chooseField(id){
    const f=field(id),s=this.api.result().state,actions=$('builder-field-actions');$('builder-field-title').textContent=f.label;
    $('builder-field-note').textContent=(f.character?'角色属性':'作品资料')+' · 请选择放置位置。'+(!!f.character!==!!field(s.x)?.character?'混用角色与作品字段时，按角色—主作品关系计数。':'');actions.replaceChildren();
    for(const [key,label] of [['x','放到横轴 / 分组'],['y','放到观察数值'],['color','用于颜色 / 对照']]){
      const possible=!$(key+'-field').disabled&&(key!=='y'||f.type==='number')&&(key!=='color'||(['line','ecdf'].includes(s.chart)?f.type==='category':['decade','platform'].includes(id)))&&(key!=='x'||!['scatter','line','ecdf'].includes(s.chart)||f.type==='number');
      const control=$(key+'-field'),current=control.selectedOptions[0]?.textContent;
      const b=button(label,()=>{$('builder-field-dialog').close();this.api.assign(key,id);});b.dataset.place=key;b.disabled=!possible;if(!possible)b.title='当前图表或字段类型不支持此位置';else if(current)b.append(node('small','当前：'+current));actions.append(b);
    }
    actions.append(button('查看这个字段的分布',()=>{$('builder-field-dialog').close();this.api.apply({chart:'histogram',x:id,grain:'auto',seriesField:'none',color:'none'});}));
    if(['year','votes','tags'].includes(id))actions.append(button('添加筛选条件',()=>{$('builder-field-dialog').close();this.dashboard.openEditor('filters');$(id==='year'?'year-from':id==='votes'?'min-votes':'tag-filter').focus();}));
    $('builder-field-dialog').showModal();
  }
  busy(value,message=''){$('builder-status').hidden=!value&&!message;$('builder-status').textContent=value?'正在更新图表…':message;}
  syncExport(){const selected=this.api.selection().size;const option=$('export-scope').querySelector('[value=selected]');option.disabled=!selected;option.textContent='已选记录'+(selected?'（'+selected.toLocaleString()+'）':'');if(!selected)$('export-scope').value='chart';$('export-button').textContent=$('export-scope').value==='selected'?'导出已选':'导出整图';}
  sync(){
    const result=this.api.result();if(!result)return;const s=result.state,grain=analysisGrain(s),selected=this.api.selection();
    document.querySelector('.comparison-title h1').textContent='数据工作台';$('analysis-object').value=objectFor(s);$('analysis-purpose').value=purposeFor(s);$('builder-scope').textContent=scopeText(s);
    const x=field(s.x).short,y=field(s.y).short,comparisonName={company:'会社',scenario:'剧本家'}[s.seriesField]??field(s.seriesField)?.short;
    $('analysis-question').textContent=s.chart==='line'?`${comparisonName}的${y}走势`:s.chart==='scatter'?`${x}与${y}的关系`:s.chart==='matrix'?'多个字段之间的关系':['histogram','ecdf'].includes(s.chart)?`${x}的${s.chart==='ecdf'?'累计分布':'分布'}`:`按${x}比较${s.aggregation==='count'&&s.chart==='bar'?unitLabel(s)+'数量':y}`;
    $('builder-statistics').hidden=$('aggregation-control').hidden&&$('line-unit-control').hidden;$('builder-statistics').querySelector('summary').textContent=s.chart==='line'&&s.lineUnit==='edition'?'每部作品一个点':`汇总方式 · ${s.aggregation==='mean'?'平均值':s.aggregation==='count'?'数量':'中位数'}`;
    $('comparison-presentation').hidden=!result.series;$('series-overlay').setAttribute('aria-pressed',String(!s.facet));$('series-facets').setAttribute('aria-pressed',String(s.facet));$('series-unfocus').hidden=!s.brushGroup;
    $('series-gaps-note').hidden=s.chart!=='line'||!result.series?.some(g=>lineSegments(g.points,s).some(edge=>edge.gap));
    const labels={x:s.chart==='line'?'时间':result.categoryDistribution?'按什么分组':s.chart==='histogram'?'观察字段':['density','box','bar'].includes(s.chart)?'按什么分组':'横轴',y:'观察数值',color:['line','ecdf'].includes(s.chart)?'对照组':'颜色分组'};
    for(const key of ['x','y','color']){const shelf=document.querySelector(`[data-shelf=${key}]`);shelf.querySelector('label').textContent=labels[key];shelf.hidden=$(key+'-field').disabled;}
    $('builder-metric').hidden=!(['histogram','ecdf'].includes(s.chart)||s.chart==='bar'&&s.aggregation==='count');$('builder-metric').textContent='看什么：'+unitLabel(s)+(s.chart==='ecdf'?'累计占比':'数量')+' · 自动计数';
    for(const option of $('aggregation').options)option.textContent=option.value==='count'?unitLabel(s)+'数量':`各${unitLabel(s)}数值的${option.value==='mean'?'平均值':'中位数'}`;
    const fields=plottedFields(s).map(id=>field(id).short).join(' / ');$('builder-config').textContent=fields+' · 图中 '+result.plottedCount.toLocaleString()+' 个'+unitLabel(s)+(result.missingCount?' · 暂无可用资料 '+result.missingCount.toLocaleString():'');
    for(const o of $('workbench-chart-type').options){const reason=chartRequirement(s,o.value);o.disabled=!!reason;o.title=reason;}
    $('builder-curves').hidden=$('builder-curves').disabled=!['scatter','density','box','histogram'].includes(s.chart)||!!result.categoryDistribution;$('builder-curves').title='添加趋势线、集中程度曲线或累计占比';
    if(selected!==this.lastSelection){$('export-scope').value=selected.size?'selected':'chart';this.lastSelection=selected;}
    this.syncExport();
    const object=objectFor(s);if(object!==this.lastObject){const groups=$('full-field-groups'),order=object==='character'?['角色','作品','评分','标签','会社与制作人员']:object==='appearance'?['角色','评分','作品','标签','会社与制作人员']:['作品','评分','标签','会社与制作人员','角色'];for(const name of order){const group=[...groups.children].find(g=>g.querySelector('summary').textContent===name);if(group){groups.append(group);group.open=object==='character'?name==='角色':object==='appearance'?['角色','评分'].includes(name):['作品','评分'].includes(name);}}this.lastObject=object;}
    if(selected.size){const group=result.groups?.find(g=>g.ids.length===selected.size&&g.ids.every(id=>selected.has(id)));$('selection-count').textContent='已选'+(group?' '+group.label+' · ':' ')+selected.size.toLocaleString()+' 个'+unitLabel(s);}
    // Show a scope change without interrupting exploration; undo remains available.
    if(this.lastGrain&&this.lastGrain!==grain)this.api.toast('统计对象已更新：'+scopeText(s)+'。可使用撤销返回。');this.lastGrain=grain;
  }
}

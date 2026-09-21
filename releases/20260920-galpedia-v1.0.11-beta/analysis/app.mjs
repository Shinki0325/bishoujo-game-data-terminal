import {sortDetailRows} from './distribution-view.mjs';
import {WorkbenchBuilder} from './workbench-builder.mjs';
import {changeChart} from './builder-state.mjs';
import {Timeline,DRAFT_KEY,readDraft} from './workbench-session.mjs';
import {loadFullData,usedFields} from './full-data.mjs';
import {mountFullUI,syncFullUI,migratePlan} from './full-ui.mjs';
import {WorkbenchExperience} from './workbench-experience.mjs';
import {FIELDS,field,DEFAULT,sanitize,analyze,csvCell,assignField,restoreState,chartRows,inScoreView,groupField,supportsLogX,analysisGrain,unitLabel,plottedFields} from './model.mjs';
import {mergeSelection} from './exploration.mjs';
import {CompanyDashboard} from './company-dashboard.mjs';
import {bindExploration,syncExploration,positionAxisTargets,cumulativeScope} from './exploration-controls.mjs';
import {Chart,format} from './chart.mjs';
import {syncOverlayControls,renderOverlaySummary} from './overlay-controls.mjs';
import {ComparisonControls} from './comparison-controls.mjs';
import {renderOverview,renderGroupStatistics,groupStatistics,groupColumns} from './inspector.mjs';
const $=id=>document.getElementById(id),KEY='galpedia-analysis-prototype-v1',PLAN='galpedia-analysis-plan-v1';
const INITIAL={...DEFAULT,minVotes:0,yearFrom:1900,yearTo:2100,chart:'histogram',x:'median',color:'none',brushEnabled:innerWidth>720,top:innerWidth<=720?6:12};
let data,result,state={...INITIAL},selection=new Set(),activeShelf='x',saved=[],page=0,sort={key:'votes',direction:-1},timer;
const comparison=new ComparisonControls(()=>result,patch=>apply(patch));
let returnMatrix=null,dashboard,experience,builder,draftTimer,searchTimer,sessionReady=false,engine,refreshId=0;
const timeline=new Timeline();
const inspectPair=pair=>{returnMatrix={...state};apply({chart:'scatter',x:pair[0],y:pair[1],logX:false,brushGroup:'',color:'none'});$('back-matrix').hidden=false;};
const plot=new Chart($('chart'),$('tooltip'),(ids,mode)=>selectRows(ids,mode));plot.onInspect=inspectPair;plot.onBeforeDraw=chart=>experience?.prepareChart(chart);plot.onDraw=chart=>{positionAxisTargets(chart);experience?.onDraw(chart);};
function selectRows(ids,mode='replace'){
  const next=mergeSelection(selection,ids,mode);
  if(next.size!==selection.size||[...next].some(id=>!selection.has(id)))timeline.record(snapshot());
  selection=next;page=0;updateSelection(false);renderTable();plot.set(result,selection);syncFullUI(result,data,selectRows,selection);builder?.sync();syncHistory();queueDraft();
}
function snapshot(){return {state,selection:[...selection],name:$('plan-name').value,ui:experience?.captureUI()};}
function syncHistory(){$('undo-button').disabled=!timeline.past.length;if($('redo-button'))$('redo-button').disabled=!timeline.future.length;}
function travel(direction){
  const next=timeline[direction](snapshot());if(!next)return;
  state=restoreState(next.state);selection=new Set(next.selection);$('plan-name').value=next.name;page=0;
  if(next.ui)experience?.restoreUI(next.ui);$('dirty-label').textContent='未保存';refresh();
}
function queueDraft(){if(!sessionReady)return;clearTimeout(draftTimer);draftTimer=setTimeout(flushDraft,150);}
function flushDraft(){
  if(!sessionReady)return;clearTimeout(draftTimer);
  try{localStorage.setItem(DRAFT_KEY,JSON.stringify({...snapshot(),schemaVersion:DRAFT_KEY,releaseId:data.releaseId,catalogSha256:data.catalogSha256}));$('draft-status').textContent='草稿已自动保存 · 本机';}
  catch{$('draft-status').textContent='本机存储不可用 · 请导出方案';}
}

const toast=message=>{$('toast').textContent=message;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4000);};
plot.onEmptySelection=()=>toast('框内没有符合所选组的作品，已保留原有选择。');
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function selectOptions(element,entries,value){element.replaceChildren(...entries.map(f=>option(f.id,f.label)));element.value=value;}
function setActiveShelf(key){activeShelf=key;if($('field-target'))$('field-target').value=key;document.querySelectorAll('.shelf').forEach(e=>e.classList.toggle('active',e.dataset.shelf===key));}
function assign(key,id){
  if(key==='x'&&$('x-field').disabled||key==='y'&&$('y-field').disabled||key==='color'&&$('color-field').disabled){toast('当前图表不使用这个字段槽。');return;}
  if(key==='color'&&['line','ecdf'].includes(state.chart)){if(field(id)?.type!=='category'){toast('分组需要会社、标签等分类字段。');return;}apply({seriesField:id,brushGroup:''});return;}
  const change=assignField(state,key,id);
  if(change.error){toast(change.error);syncControls();return;}
  apply(change.state);
}
function apply(patch,{record=true,preserveSelection=false}={}){
  try{sanitize({...state,...patch});}catch(e){toast(e.message);return Promise.resolve(false);}
  if(!Object.hasOwn(patch,'brushGroup')&&['x','y','color','seriesField','chart'].some(k=>Object.hasOwn(patch,k)&&patch[k]!==state[k]))patch={...patch,brushGroup:''};
  if(data&&patch.seriesField&&patch.seriesField!=='none'&&state.groupMode==='manual'&&!patch.groupSelections&&!Object.hasOwn(state.groupSelections,patch.seriesField)){
    patch={...patch,groupMode:'auto'};
  }
  if(!plottedFields(state).some(id=>field(id).character)&&plottedFields(sanitize({...state,...patch})).some(id=>field(id).character)){
    patch={...patch,...(!Object.hasOwn(patch,'grain')||patch.grain===state.grain?{grain:'auto'}:{})};
  }
  if(record)timeline.record(snapshot());
  const previousFilter=state.recordFilter;state=sanitize({...state,...patch});if(previousFilter&&!state.recordFilter&&!Object.hasOwn(patch,'recordFilter'))toast('统计对象已改变，已移除仅看所选条件；可撤销。');if(!preserveSelection)selection.clear();page=0;$('dirty-label').textContent='未保存';
  document.querySelectorAll('.preset').forEach(b=>b.classList.remove('active'));return refresh();
}
function syncControls(){
  selectOptions($('x-field'),['scatter','ecdf','line'].includes(state.chart)?FIELDS.filter(f=>f.type==='number'):FIELDS,state.x);selectOptions($('y-field'),FIELDS.filter(f=>f.type==='number'),state.y);
  selectOptions($('color-field'),[{id:'none',label:'统一颜色'},...FIELDS.filter(f=>['decade','platform'].includes(f.id))],state.color);
  if(!['scatter','line','ecdf'].includes(state.chart))selectOptions($('color-field'),[{id:'none',label:state.chart==='density'?(state.densityStyle==='curve'?'按分组着色':state.intensity==='share'?'按组内占比着色':'按版本数量着色'):'不使用分类颜色'}],'none');
  $('x-field').disabled=state.chart==='matrix';
  if(['line','ecdf'].includes(state.chart))selectOptions($('color-field'),[...(state.chart==='ecdf'?[{id:'none',label:'不分组 · 全部版本'}]:[]),...FIELDS.filter(f=>f.type==='category')],state.seriesField);
  $('y-field').disabled=['histogram','ecdf','matrix'].includes(state.chart)||state.chart==='bar'&&state.aggregation==='count';
  $('color-field').disabled=!['scatter','line','ecdf'].includes(state.chart);
  document.querySelector('[data-shelf=color] label').textContent=['line','ecdf'].includes(state.chart)?'分组 / 对照':'颜色';
  for(const id of ['y','color'])document.querySelector(`[data-shelf="${id}"]`).classList.toggle('disabled',$(id+'-field').disabled);
  document.querySelector('[data-shelf="color"]').classList.toggle('density-mode',state.chart==='density');
  for(const [id,key] of [['min-votes','minVotes'],['year-from','yearFrom'],['year-to','yearTo'],['tag-filter','tag'],['search','search'],['top-groups','top'],['aggregation','aggregation'],['bin-width','binWidth'],['group-sort','groupSort'],['min-group','minGroup']])$(id).value=state[key];
  $('log-x').checked=state.logX;
  $('log-x').disabled=!supportsLogX(state.x);
  $('log-control').title=supportsLogX(state.x)?'适合比较相差多个数量级的数值':'年份和月份使用等间距刻度';
  $('density-width').value=state.densityWidth;$('intensity-mode').value=state.intensity;
  $('density-style-control').hidden=state.chart!=='density';$('density-style').value=state.densityStyle;
  $('density-control').hidden=state.chart!=='density'||state.densityStyle==='curve';$('intensity-control').hidden=state.chart!=='density'||state.densityStyle==='curve';$('density-width-unit').textContent=field(state.y).unit;
  $('log-control').hidden=state.chart!=='scatter';$('top-control').hidden=!['bar','box','density'].includes(state.chart)||field(state.x).type==='number';$('aggregation-control').hidden=!['bar','line'].includes(state.chart)||state.chart==='line'&&state.lineUnit==='edition';$('aggregation').querySelector('[value=count]').disabled=state.chart==='line';$('bin-control').hidden=state.chart!=='histogram'||result.categoryDistribution;
  const grouped=!!result.categoryDistribution||['bar','box','density'].includes(state.chart)||!!result.series,categorical=grouped&&field(groupField(state)).type==='category'&&!['month','birthdayMonth'].includes(state.x);
  const manual=categorical&&state.groupMode==='manual';
  $('group-mode-control').hidden=!categorical;$('group-mode').value=state.groupMode;
  $('group-sort-control').hidden=!categorical||manual;$('min-group-control').hidden=!categorical||manual;$('top-control').hidden=!categorical||manual;
  comparison.render();
  $('score-view-control').hidden=!result.view.axis;$('score-view-label').textContent=(result.view.axis==='x'?'横轴':'纵轴')+'评分视野';
  $('view-min').value=state.viewMin;$('view-max').value=state.viewMax;$('reset-score-view').disabled=!result.view.active;
  $('score-view-control').classList.toggle('view-active',result.view.active);
  $('apply-score-view').textContent=result.view.active?'更新视野':'放大区间';
  syncOverlayControls(state);syncExploration(result);
  $('cdf-query').hidden=state.chart!=='ecdf';$('cdf-threshold').value=state.cdfThreshold;
  if(result.cdf){const cdfRows=cumulativeScope(result),denominator=cdfRows.length,count=cdfRows.filter(row=>row[state.x]<=state.cdfThreshold).length;
    $('cdf-readout').textContent=(result.series?(state.brushGroup?state.brushGroup+' · ':'合并去重 · '):'')+`≤ ${format(state.cdfThreshold)}：${count.toLocaleString()} / ${denominator.toLocaleString()} 个版本`+(denominator?` · ${(count/denominator*100).toFixed(1)}%`:' · 暂无有效数值');
    $('select-cumulative').disabled=count===0;
  }
  $('chart-options').hidden=![...$('chart-options').children].some(el=>!el.hidden);
  document.querySelector('[data-shelf=x] label').textContent=(result.categoryDistribution||['bar','box','density'].includes(state.chart))?'分组依据':'横轴';
  document.querySelector('[data-shelf=y] label').textContent=$('y-field').disabled?'数值 · 此图不使用':'观察数值';
  for(const f of FIELDS){const el=document.querySelector(`[data-field="${f.id}"]`);const used=state.chart==='matrix'?state.matrixFields.includes(f.id):f.id===state.x||!$('y-field').disabled&&f.id===state.y||state.chart==='scatter'&&f.id===state.color||['line','ecdf'].includes(state.chart)&&f.id===state.seriesField;el.classList.toggle('in-use',used);}
  const purposes={line:'比较不同组的数值走势。可以按年汇总，也能沿发行时间逐部查看作品；点击一个点查看对应版本。',matrix:'把多个字段放在一起看关系。颜色越深，关系越强；点击任意格子继续看散点。相关不表示因果。',ecdf:'看多少版本低于某个数值。阶梯线表示小于等于横轴数值的累计比例，无需分箱或平滑。',scatter:'看两个数值是否一起变化。拖动画布可框选一批版本。',density:'看数值集中在哪里。颜色越深，该区间的占比或版本数越高；各组共用色阶。',box:'比较各组的中位数与分散范围。箱体越短，中间一半版本的数值越集中。',histogram:'看一个数值的整体分布。每根柱子表示一个区间内的版本数。',bar:'比较各组的版本数量或数值汇总。可调整分组排序与每组样本门槛。'};
  $('chart-purpose').textContent=purposes[state.chart];
  document.querySelectorAll('[data-chart]').forEach(b=>b.title=purposes[b.dataset.chart]);
  document.querySelectorAll('[data-chart]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chart===state.chart)));
  syncHistory();experience?.sync();
}
async function refresh(){
  if(!data)return;
  const ticket=++refreshId;document.body.dataset.computing='true';builder?.busy(true);$('result-summary').textContent='正在更新图表…';
  let next;try{next=await engine.run(state);}catch(error){if(ticket===refreshId){document.body.dataset.computing='false';if(result){state=result.state;syncControls();syncFullUI(result,data);}$('result-summary').textContent=error.message;builder?.busy(false,error.message+'；已保留上一结果，请重试。');toast(error.message);}return;}
  if(ticket!==refreshId||!next)return;
  result=next;state=result.state;document.body.dataset.computing='false';builder?.busy(false);syncControls();
  const x=field(state.x).short,y=field(state.y).short;
  $('chart-title').textContent=state.chart==='scatter'?`${x}与${y}`:state.chart==='histogram'?`${x}的分布`:state.chart==='ecdf'?`${x}的累计分布`:state.chart==='density'?`不同${x}的${y}密度`:state.chart==='box'?`不同${x}的${y}箱线图`:`按${x}比较${state.aggregation==='count'?'版本数量':y}`;
  const groups=!!result.categoryDistribution||['box','bar','density'].includes(state.chart)||!!result.series;
  const grouping=result.groupOrder==='manual'?`固定 ${result.groups.length} 组 · 按选取顺序 · 不使用样本门槛`:result.groupOrder==='numeric'?`按数值顺序 · 全部 ${result.totalGroups} 组${result.xGroupWidth?' · 横轴每组 '+result.xGroupWidth:''}`:`${{count:'按版本数从多到少',median:'按数值中位数从高到低',name:'按组名顺序'}[state.groupSort]} · 显示 ${result.groups?.length} / ${result.eligibleGroups} 组${result.excludedSmallGroups?' · 样本不足隐藏 '+result.excludedSmallGroups+' 组':''}`;
  $('chart-subtitle').textContent=groups?grouping+(field(groupField(state)).multi?' · 同一版本可以属于多个组':''):state.chart==='histogram'?`每条记录代表一个 EGS 发行版本 · 分箱左闭右开 · 实际宽度 ${format(result.actualBinWidth)}`:state.chart==='ecdf'?'原始有效数值直接累计 · 每个发行版本等权 · 同值一起跃升':'每个点代表一个 EGS 发行版本 · 全部有效记录绘制，无随机抽样';
  $('chart-method').textContent=state.chart==='ecdf'?'ECDF(x) = 数值 ≤ x 的有效版本数 / 全部有效版本数。纵轴固定 0–100%，不分箱、不平滑；选中或放大视野不改变分母。':state.chart==='density'?`实际每格 ${format(result.density.width)}${field(state.y).unit}，左闭右开。颜色表示${state.intensity==='share'?'区间占本组有效版本的比例':'区间版本数'}，各组共用色阶。改变粒度会重新计算色阶；跨度过大时自动加宽至约 240 格。`:state.chart==='box'?'箱体为第 25–75 百分位，横线为中位数，须线为最小值至最大值。n 表示各组版本数。':state.chart==='histogram'?'统计每个区间的版本数量。可在图旁调整每组数值宽度。跨度过大时最多约 2,000 组，并明确提示实际宽度。':state.chart==='bar'?'按版本等权汇总。评分均值是各版本评分中位数的平均，不是玩家评分的总体均值。':'可框选点群继续查看明细。月份使用 1–12 整数刻度，开启对数横轴后非正值不参与绘图。';
  if(result.series){$('chart-title').textContent=state.chart==='line'?`不同${field(state.seriesField).short}的${y}走势`:`不同${field(state.seriesField).short}的${x}累计分布`;$('chart-method').textContent=state.chart==='line'?(state.lineUnit==='edition'?'每个点对应一个发行版本，按横轴排序连线。':'每个点汇总同组同一横轴值的版本，按版本等权取'+(state.aggregation==='mean'?'均值':'中位数')+'；没有版本的年份留空并断线。'):'各组独立计算 ≤ 横轴数值的比例；组间可重叠，整体明细按版本去重。可通过限定框选组进行组内选择。';}
  if(state.chart==='matrix'){$('chart-title').textContent='这些字段之间，有什么关系？';$('chart-subtitle').textContent=state.correlationMethod==='spearman'?'排名相关 · 看数值高低是否同向变化':'线性相关 · 看数值是否沿直线一起变化';$('chart-method').textContent='每一格按两个字段共同有效的版本计算，显示系数与样本数。系数范围 −1 至 1；常量或不足 3 个版本不计算。排名相同取平均名次。月份有周期性，结果只描述当前数值编码。';}
  if(result.densityCurves){$('chart-method').textContent='曲线是高斯核密度估计，高度表示附近分数的集中程度，各组共用密度刻度；不是区间占比。底部短线保留原始分数，同值一起选择。完整样本用于估计，放大视野或框选不会改变分母。样本不足或全部同值时保留短线。';$('chart-purpose').textContent='比较各组评分的集中程度。曲线越高，附近分数越集中；图例可限定组内框选。';}
  const overlayMethod=renderOverlaySummary(result);if(overlayMethod)$('chart-method').textContent+=' '+overlayMethod;
  $('chart-hint').textContent=state.chart==='line'?'点击一个点看作品 · 限定组后可单独框选':state.chart==='matrix'?'点击格子打开散点 · 可切换散点矩阵':state.chart==='ecdf'?'移动查看累计比例 · 点击选择此值及以下版本':state.chart==='scatter'?'拖动框选 · 悬停看作品 · 点选查看明细':state.chart==='density'?'点色块看区间 · 点组名看整组 · 横向滑动看更多组':'悬停看统计 · 点击分组查看对应作品';
  $('result-summary').textContent=`筛选 ${result.filteredCount.toLocaleString()} 个版本 · 图中 ${result.plottedCount.toLocaleString()} 个${result.missingCount?' · 缺失/不可绘制 '+result.missingCount+' 个':''}`;
  $('empty-state').hidden=result.plottedCount>0||result.groupOrder==='manual'&&result.manualKeys.length>0;
  $('empty-help').textContent=result.groupOrder==='manual'&&!result.manualKeys.length?'请在上方勾选要比较的组。':result.filteredCount&&result.excludedSmallGroups?'当前分组均低于样本门槛，请降低“每组最少版本”。':'试着放宽评价人数、年份或名称筛选。';
  renderFilterChips();
  $('steps').replaceChildren(...[
    '读取 '+data.releaseId,`${field(state.voteSource).label} ≥ ${state.minVotes}；发行年 ${state.yearFrom}–${state.yearTo}`,
    state.tag?'包含标签：'+state.tag:'不限定内容标签',
    state.search?'查找：'+state.search:null,
    `${state.chart==='scatter'?'比较':state.chart==='histogram'?'分箱':state.chart==='ecdf'?'累计': '分组'}：${field(state.x).label}`,
    groups?(result.groupOrder==='manual'?'手动固定：'+result.manualKeys.join('、'):result.groupOrder==='numeric'?'数值顺序显示全部组':`每组至少 ${state.minGroup} 个有效版本；按${{count:'版本数',median:'数值中位数',name:'组名'}[state.groupSort]}取前 ${state.top} 组`)+'；组内按 EGS 版本 ID 计数':null
  ].filter(Boolean).map(t=>{const e=document.createElement('li');e.textContent=t;return e;}));
  if(selection.size){const valid=new Set(chartRows(result).map(r=>r.id));selection=new Set([...selection].filter(id=>valid.has(id)));}
  syncCdfPresentation();syncHistogramView();dashboard?.render();plot.set(result,selection);$('chart').setAttribute('aria-label',$('chart-title').textContent+'；'+$('chart-subtitle').textContent+'。下方提供对应作品明细。');
  if(result.densityCurves)$('chart-hint').textContent='点底部短线看版本 · 图例限定分组 · 拖框选择原始分数';
  const markNotes={box:'箱体：中间 50% · 粗线：中位数 · 须线：最小–最大值',histogram:'柱高：区间版本数 · 点击柱子查看完整区间',bar:'柱高：'+(state.aggregation==='count'?'版本数':state.aggregation==='mean'?'组内平均值':'组内中位数'),ecdf:'阶梯高度：小于等于横轴值的版本比例'};
  $('mark-legend').hidden=!markNotes[state.chart];$('mark-legend').textContent=markNotes[state.chart]??'';$('mark-legend').dataset.markType=state.chart;
  const legends=plot.colorLegend();$('legend').replaceChildren(...legends.map(v=>{const e=document.createElement(v.groupKey?'button':'span'),dot=document.createElement('i');dot.style.background=v.color;e.append(dot,document.createTextNode(v.label));if(v.groupKey){e.type='button';e.setAttribute('aria-pressed',String(state.brushGroup===v.groupKey));e.title='点击突出此组并将框选限定在该组，再点一次恢复';e.setAttribute('aria-label','突出对照组 '+v.groupKey);e.addEventListener('click',()=>apply({brushGroup:state.brushGroup===v.groupKey?'':v.groupKey},{preserveSelection:true}));}return e;}));
  const densityVisible=state.chart==='density'&&state.densityStyle!=='curve';$('density-legend').hidden=!densityVisible;
  if(densityVisible){$('density-grain-label').textContent='每格 '+format(result.density.width)+field(state.y).unit;$('density-unit').textContent=state.intensity==='share'?'组内占比':'版本数量';$('density-max').textContent=state.intensity==='share'?(result.density.maxShare*100).toFixed(1)+'%':format(result.density.maxCount);}
  updateSelection();renderTable();queueDraft();
  syncFullUI(result,data,selectRows,selection);builder?.sync();
  window.workbenchDebug={state:()=>({...state}),result:()=>result,selected:()=>[...selection],hits:()=>plot.hits,plotBounds:()=>({...plot.plot}),overlayPaths:()=>plot.overlayPaths,brushPoints:()=>plot.brushPoints,panels:()=>plot.panels,apply};
}
function syncCdfPresentation(){
  if(!$('cdf-style')){
    const label=document.createElement('label');label.id='cdf-style-control';label.className='control';label.append(document.createTextNode('累计线型 '));
    const select=document.createElement('select');select.id='cdf-style';select.setAttribute('aria-label','累计线型');select.append(option('step','阶梯线'),option('smooth','平滑曲线'));label.append(select);
    select.addEventListener('change',()=>apply({cdfStyle:select.value},{preserveSelection:true}));$('cumulative-control').after(label);
    const strength=document.createElement('label');strength.id='cdf-smoothing-control';strength.className='control';strength.append(document.createTextNode('累计平滑程度'));
    const smoothing=document.createElement('select');smoothing.id='cdf-smoothing';smoothing.setAttribute('aria-label','累计平滑程度');for(const [value,text] of [[.5,'更细 · 0.5×'],[1,'常规 · 1×'],[2,'更平滑 · 2×'],[4,'更平缓 · 4×']])smoothing.append(option(value,text));strength.append(smoothing);label.after(strength);
    smoothing.addEventListener('change',()=>apply({cdfSmoothing:Number(smoothing.value)},{preserveSelection:true}));
    const note=document.createElement('p');note.id='cdf-style-note';note.className='cdf-style-note';note.setAttribute('role','status');strength.after(note);
  }
  const shown=state.chart==='ecdf'||state.chart==='histogram'&&state.cumulativeCurve&&!result.categoryDistribution;
  $('cdf-style-control').hidden=!shown;$('cdf-style').value=state.cdfStyle;
  $('cdf-smoothing-control').hidden=!shown||state.cdfStyle!=='smooth';$('cdf-smoothing').value=String(state.cdfSmoothing);
  $('cdf-style-note').hidden=!shown||state.cdfStyle!=='smooth';
  if(shown&&state.cdfStyle==='smooth'){
    $('cdf-style-note').textContent='平滑曲线为趋势估计，不必穿过每个累计点；悬停百分比、阈值和明细仍按真实样本计算。样本不足或数值相同时保留阶梯线。';
    const method='平滑累计为高斯核分布估计，使用 Silverman 带宽乘累计平滑倍数；有固定合法范围的字段在该范围内归一化。悬停百分比、阈值与导出仍按原始样本计算；框选对应曲线位置上的真实记录。选择或缩放不改变拟合样本。';
    $('chart-method').textContent=(state.chart==='ecdf'?'':$('chart-method').textContent+' ')+method;
  }
  experience?.sync();
}
function syncHistogramView(){
  if(!$('bin-width-unit')){
    const label=$('bin-control'),input=$('bin-width');label.firstChild.textContent='每组宽度 ';input.min='0.1';input.step='any';input.setAttribute('aria-label','每组数值宽度');
    const unit=document.createElement('span');unit.id='bin-width-unit';label.append(unit);
    document.querySelector('.company-quick-options').prepend(label);
    const note=document.createElement('p');note.id='bin-width-note';note.className='bin-width-note';note.setAttribute('role','status');document.querySelector('.chart-heading').after(note);
  }
  const histogram=state.chart==='histogram'&&!result.categoryDistribution;
  $('bin-control').hidden=!histogram;$('bin-width-unit').textContent=field(state.x)?.unit??'';
  const widened=histogram&&result.actualBinWidth>state.binWidth*(1+1e-9);$('bin-width-note').hidden=!widened;
  if(widened)$('bin-width-note').textContent='所选宽度 '+state.binWidth+'，实际宽度 '+format(result.actualBinWidth)+(field(state.x).unit??'')+'：完整数据跨度较大，为保持操作流畅最多绘制约 2,000 组。缩小筛选范围后可使用更细组距。';
  let panel=$('histogram-view');
  if(!panel){
    panel=document.createElement('div');panel.id='histogram-view';panel.className='histogram-view';
    panel.innerHTML='<div><span>横轴范围</span><button id="histogram-focus">主要分布</button><button id="histogram-full">完整范围</button><button id="histogram-outside">查看范围外</button></div><p id="histogram-range-note" role="status"></p>';
    document.querySelector('.chart-heading').after(panel);
    $('histogram-focus').addEventListener('click',()=>apply({histogramRange:'auto'},{preserveSelection:true}));
    $('histogram-full').addEventListener('click',()=>apply({histogramRange:'full'},{preserveSelection:true}));
    $('histogram-outside').addEventListener('click',()=>{
      const [min,max]=result.histogramView.focus;
      selectRows(representedRows().filter(r=>r[state.x]<min||r[state.x]>=max).map(r=>r.id),'replace');
      dashboard.tableDetails.open=true;$('table-panel').scrollIntoView({behavior:'smooth',block:'start'});
    });
  }
  const v=result.histogramView;panel.hidden=!v?.available;if(!v?.available)return;
  for(const [id,active] of [['histogram-focus',v.active],['histogram-full',!v.active]]){$(id).setAttribute('aria-pressed',String(active));}
  $('histogram-outside').textContent='查看范围外 '+v.outsideCount.toLocaleString()+' 个';
  const covered=((v.total-v.outsideCount)/v.total*100).toFixed(1);
  $('histogram-range-note').textContent=format(v.min)+'–'+format(v.max)+' '+(field(state.x).unit??'')+' · 主要区间包含 '+covered+'% · '+v.outsideCount.toLocaleString()+' 个在主要区间外；统计、明细和导出保留全部记录。';
  $('histogram-range-note').title='主要分布：按中间 98% 数据所在的完整分箱取范围。仅缩放横轴，不修改样本、分箱或百分比的分母，也不判定极端值为错误。';
}
function representedRows(){return chartRows(result);}
function detailFields(){return [...new Set(plottedFields(state))].filter(id=>id!=='none'&&(['character','appearance'].includes(analysisGrain(state))||!['company','year','median','votes'].includes(id)));}
function tableRows(){
  const individual=['character','appearance'].includes(analysisGrain(state)),keys=['title',...(!individual?['company','year','median','votes']:[]),...detailFields()];
  if(!keys.includes(sort.key))sort={key:detailFields().find(id=>field(id).type==='number')??'title',direction:-1};
  return sortDetailRows(representedRows().filter(r=>!selection.size||selection.has(r.id)),sort,field(sort.key)?.type==='number');
}
function updateSelection(reveal=false){
  dashboard?.syncSelection(selection.size,reveal);
  $('selection-tools').hidden=!selection.size;$('selection-count').textContent=`已选 ${selection.size.toLocaleString()} 个`;
  const rows=representedRows().filter(r=>!selection.size||selection.has(r.id));renderOverview(result,rows,selection.size>0);renderGroupStatistics(result,selection,ids=>{selectRows(ids);dashboard.tableDetails.open=true;$('table-panel').scrollIntoView({behavior:'smooth',block:'start'});});
  renderViewStatus(rows);
  $('table-scope').textContent=selection.size?'当前选中的'+unitLabel(state)+'；导出使用相同范围。':'当前图中的'+unitLabel(state)+(result.histogramView?.active?'（含视野外记录）':'')+'；点击图形可缩小明细范围。';
}
function renderViewStatus(rows){
  const v=result.view;$('score-view-status').hidden=!v.active;
  if(!v.active)return;
  const selectedOutside=selection.size?rows.filter(r=>!inScoreView(r.median,v)).length:0;
  $('score-view-status').textContent=`评分视野 [${format(v.min)}, ${format(v.max)}${v.max===100?']':')'} · 区间内 ${v.insideCount.toLocaleString()} 个 / 区间外 ${v.outsideCount.toLocaleString()} 个版本。整组统计、色阶与导出范围不变。`+(selectedOutside?` 当前选中有 ${selectedOutside} 个在区间外，仍保留。`:'')+(!v.insideCount?' 此区间暂无版本，可调整范围或恢复完整视野。':'');
}
function setScoreView(min,max){
  if(min===''||max===''||!Number.isFinite(Number(min))||!Number.isFinite(Number(max))||Number(min)<0||Number(max)>100||Number(min)>=Number(max)){toast('请输入 0–100 之间的范围，下界必须小于上界。');return;}
  apply({viewActive:true,viewMin:Number(min),viewMax:Number(max)},{preserveSelection:true});
}
function renderTable(){
  const metrics=detailFields(),individual=['character','appearance'].includes(analysisGrain(state));
  document.querySelector('.table-heading h2').firstChild.textContent='对应的'+unitLabel(state)+' ';
  const rows=tableRows(),pages=Math.max(1,Math.ceil(rows.length/10));page=Math.min(page,pages-1);
  const heading=$('table-body').closest('table').querySelector('thead tr');
  const columns=[['title',individual?'角色':'作品'],...(individual?[[null,'关联主作品']]:[['company','会社'],['year','发行年份'],['median','评分'],['votes','评价人数']]),...metrics.map(key=>[key,field(key).label])];
  heading.replaceChildren(...columns.map(([key,label])=>{
    const th=document.createElement('th');th.scope='col';
    if(!key){th.textContent=label;return th;}
    const active=sort.key===key,button=document.createElement('button');button.type='button';button.dataset.detailSort=key;
    button.textContent=label+(active?(sort.direction===1?' ↑':' ↓'):' ↕');
    button.title='点击按'+label+(active&&sort.direction===-1?'升序':'降序')+'排列全部明细';
    th.setAttribute('aria-sort',active?(sort.direction===1?'ascending':'descending'):'none');th.append(button);return th;
  }));
  $('table-scope').textContent=(selection.size?'当前选中的':'整张图的全部')+unitLabel(state)+(result.histogramView?.active&&!selection.size?'（含视野外记录）':'')+' · 点击表头排序全部明细；当前按'+(field(sort.key)?.label??'名称')+(sort.direction===1?'升序':'降序')+'。';
  $('table-count').textContent=`${rows.length.toLocaleString()} 个`;$('page-label').textContent=`${page+1} / ${pages}`;
  $('prev-page').disabled=page===0;$('next-page').disabled=page>=pages-1;
  $('table-body').replaceChildren(...rows.slice(page*10,page*10+10).map(r=>{
    const tr=document.createElement('tr'),title=document.createElement('td'),a=document.createElement('a'),small=document.createElement('small');
    a.textContent=r.title;a.title=r.originalTitle;a.href='../../../#works/work/'+encodeURIComponent(r.workId??r.workIds?.[0]??r.id);a.target='_blank';a.rel='noopener';small.textContent=individual?r.characterId:'EGS '+r.id;title.append(a,small);tr.append(title);
    if(individual){const td=document.createElement('td');for(const [i,id] of r.workIds.entries()){if(i)td.append(document.createTextNode(' / '));const link=document.createElement('a');link.textContent=r.workTitles[i];link.href='../../../#works/work/'+encodeURIComponent(id);link.target='_blank';link.rel='noopener';td.append(link);}tr.append(td);}
    if(!individual)for(const [value,cls] of [[r.company,''],[String(r.year??'—'),''],[r.median,'score'],[r.votes,'']]){const td=document.createElement('td');td.textContent=typeof value==='number'?format(value):value??'—';td.title=String(value??'');td.className=cls;tr.append(td);}
    for(const key of metrics){const td=document.createElement('td');const value=r[key];td.textContent=Array.isArray(value)?value.join(' / '):typeof value==='number'?format(value):value??'—';if(field(key).character)td.title=individual?'角色属性；缺失或冲突显示 —':'本作有效角色数：'+(r.characterValid?.[key]??0);tr.append(td);}return tr;
  }));
  if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=5+metrics.length;td.textContent='没有符合当前范围的记录。';tr.append(td);$('table-body').append(tr);}
}
function download(content,name,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function plan(){return{schemaVersion:PLAN,releaseId:data.releaseId,catalogSha256:data.catalogSha256,name:$('plan-name').value.trim()||$('chart-title').textContent,state:{...state},selection:[...selection],savedAt:new Date().toISOString()};}
async function restorePlan(p){
  if(p?.schemaVersion!==PLAN||!p.state||typeof p.state!=='object'){toast('无法读取：不是本工作台的方案文件。');return;}
  if(p.releaseId!==data.releaseId||![data.catalogSha256,...(data.compatibleCatalogSha256??[])].includes(p.catalogSha256)){if(!await migratePlan(p,data))return;p={...p,state:{...p.state,grain:p.state.grain??'edition'}};}
  let restored;try{restored=restoreState(p.state);}catch(e){toast(e.message);return;}
  await apply(restored);$('plan-name').value=typeof p.name==='string'?p.name.slice(0,80):'';const ids=new Set(representedRows().map(r=>r.id));selection=new Set(Array.isArray(p.selection)?p.selection.filter(id=>typeof id==='string'&&ids.has(id)):[]);
  updateSelection(true);renderTable();plot.set(result,selection);builder?.sync();builder?.compact();$('analysis-launcher')?.close();queueDraft();$('dirty-label').textContent='已恢复';toast('已恢复方案与图中选择。');
}
function renderSaved(){
  $('saved-list').replaceChildren();
  if(!saved.length){const t=document.createElement('div');t.className='saved-empty';t.textContent='保存一个发现，稍后从这里继续。';$('saved-list').append(t);return;}
  for(const p of saved){const wrap=document.createElement('div'),load=document.createElement('button'),del=document.createElement('button');wrap.className='saved-item';load.textContent=p.name;load.title=p.name;load.addEventListener('click',()=>restorePlan(p));del.textContent='×';del.setAttribute('aria-label','删除方案 '+p.name);del.addEventListener('click',()=>{saved=saved.filter(v=>v!==p);persist();renderSaved();});wrap.append(load,del);$('saved-list').append(wrap);}
}
function persist(){try{localStorage.setItem(KEY,JSON.stringify(saved));return true;}catch{toast('浏览器存储不可用；可以导出方案文件保留。');return false;}}
function renderFilterChips(){
  const chips=[...(state.recordFilter?[{text:'仅看所选 '+state.recordFilter.ids.length.toLocaleString()+' 个'+unitLabel(state),patch:{recordFilter:null}}]:[]),...(state.minVotes>0?[{text:field(state.voteSource??'votes').label+' ≥ '+state.minVotes,patch:{minVotes:0}}]:[]),
    ...(state.yearFrom!==1900||state.yearTo!==2100?[{text:`发行年 ${state.yearFrom}–${state.yearTo}`,patch:{yearFrom:1900,yearTo:2100}}]:[]),
    ...(state.tag?[{text:'标签：'+state.tag,patch:{tag:''}}]:[]),
    ...(state.search?[{text:'查找：'+state.search,patch:{search:''}}]:[])];
  $('filter-chips').hidden=!chips.length;
  $('filter-chips').replaceChildren(...chips.map(c=>{const button=document.createElement('button');button.textContent=c.text+' ×';button.title='移除筛选：'+c.text;button.setAttribute('aria-label',button.title);button.addEventListener('click',()=>apply(c.patch));return button;}));
}
function resetFilters(){apply({minVotes:0,yearFrom:1900,yearTo:2100,search:'',tag:'',recordFilter:null});}
function bind(){
  const markLegend=document.createElement('div');markLegend.id='mark-legend';markLegend.className='mark-legend';document.querySelector('.chart-footer').prepend(markLegend);
  const densityStyleControl=document.createElement('label');densityStyleControl.className='control';densityStyleControl.id='density-style-control';densityStyleControl.innerHTML='分布显示<select id="density-style"><option value="bins">精确分箱</option><option value="curve">平滑轮廓与原始分数</option></select>';$('density-control').before(densityStyleControl);$('density-style').addEventListener('change',e=>apply({densityStyle:e.target.value},{preserveSelection:true}));
  for(const f of FIELDS){const b=document.createElement('button');b.className='field-item '+(f.type==='category'?'category':'');b.draggable=true;b.dataset.field=f.id;b.title=f.label+' · '+f.source+(f.multi?' · 一个版本可有多个值':'');b.setAttribute('aria-label','添加字段 '+f.label);
    const glyph=document.createElement('span');glyph.className='glyph';glyph.textContent=f.type==='number'?'#':'Aa';const label=document.createElement('span');label.textContent=f.label;const grip=document.createElement('span');grip.className='grip';grip.textContent='⠿';b.append(glyph,label,grip);
    b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',f.id);e.dataTransfer.effectAllowed='copy';});b.addEventListener('click',()=>builder?builder.chooseField(f.id):assign(activeShelf,f.id));$(f.type==='number'?'number-fields':'category-fields').append(b);
  }
  document.querySelectorAll('[data-shelf]').forEach(el=>{
    el.addEventListener('pointerdown',()=>setActiveShelf(el.dataset.shelf));el.addEventListener('focusin',()=>setActiveShelf(el.dataset.shelf));
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('dragover');});el.addEventListener('dragleave',()=>el.classList.remove('dragover'));
    el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('dragover');setActiveShelf(el.dataset.shelf);assign(el.dataset.shelf,e.dataTransfer.getData('text/plain'));});
  });
  $('x-field').addEventListener('change',e=>assign('x',e.target.value));$('y-field').addEventListener('change',e=>assign('y',e.target.value));$('color-field').addEventListener('change',e=>apply(['line','ecdf'].includes(state.chart)?{seriesField:e.target.value,brushGroup:''}:{color:e.target.value,brushGroup:''}));
  document.querySelectorAll('[data-chart]').forEach(b=>b.addEventListener('click',()=>{const change=changeChart(state,b.dataset.chart);if(change.error){toast(change.error);$('workbench-chart-type').value=state.chart;return;}apply(change.patch);}));
  const defaultCompanies=()=>{const keys=[...new Set(data.rows.map(r=>r.company))];return ['Key','AUGUST','ALICESOFT','CIRCUS',...keys].filter((k,i,a)=>keys.includes(k)&&a.indexOf(k)===i).slice(0,2);};
  const presets={companies:{...INITIAL,chart:'line',x:'year',y:'median',seriesField:'company',groupMode:'manual',groupSelections:{company:defaultCompanies()},aggregation:'median'},cdfcompare:{...INITIAL,chart:'ecdf',x:'median',seriesField:'tags',groupMode:'manual',groupSelections:{tags:['校园','科幻']}},relationships:{...INITIAL,chart:'matrix'},curved:{...INITIAL,x:'votes',logX:true,trendLine:true,trendMethod:'lowess',marginals:true},year:{...INITIAL},months:{...INITIAL,chart:'density',x:'month',y:'median'},tags:{...INITIAL,chart:'density',x:'tags',y:'median'},votes:{...INITIAL,x:'votes',logX:true},histogram:{...INITIAL,chart:'histogram',x:'median',binWidth:5}};
  document.querySelectorAll('[data-preset]').forEach(b=>b.addEventListener('click',()=>{apply(presets[b.dataset.preset]);$('plan-name').value='';$('comparison-picker').open=!['companies','cdfcompare'].includes(b.dataset.preset);b.classList.add('active');}));
  for(const [id,key] of [['min-votes','minVotes'],['year-from','yearFrom'],['year-to','yearTo'],['tag-filter','tag'],['top-groups','top'],['aggregation','aggregation'],['bin-width','binWidth'],['group-sort','groupSort'],['min-group','minGroup']])$(id).addEventListener('change',e=>{if(key==='binWidth'&&(e.target.value===''||!Number.isFinite(Number(e.target.value))||Number(e.target.value)<.1||Number(e.target.value)>10000)){toast('每组宽度请输入 0.1–10,000 之间的数值。');e.target.value=state.binWidth;return;}apply({[key]:e.target.value});});
  $('search').addEventListener('input',e=>{clearTimeout(searchTimer);const value=e.target.value;searchTimer=setTimeout(()=>apply({search:value}),250);});
  $('log-x').addEventListener('change',e=>apply({logX:e.target.checked}));$('reset-button').addEventListener('click',resetFilters);$('reset-empty').addEventListener('click',()=>apply({minVotes:0,yearFrom:1900,yearTo:2100,search:'',tag:'',recordFilter:null,minGroup:1}));
  $('group-mode').addEventListener('change',e=>{
    const groupMode=e.target.value,patch={groupMode};if(groupMode==='manual')$('comparison-picker').open=true;
    if(groupMode==='manual'&&!state.groupSelections[groupField(state)]?.length)patch.groupSelections={...state.groupSelections,[groupField(state)]:(result.groups??[]).slice(0,2).map(g=>String(g.key))};
    apply(patch);
  });
  $('apply-score-view').addEventListener('click',()=>setScoreView($('view-min').value,$('view-max').value));
  for(const id of ['view-min','view-max'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();setScoreView($('view-min').value,$('view-max').value);}});
  $('focus-score-view').addEventListener('click',()=>setScoreView(60,90));
  $('reset-score-view').addEventListener('click',()=>apply({viewActive:false},{preserveSelection:true}));
  $('overlay-type').addEventListener('change',e=>apply(state.chart==='scatter'?{trendLine:e.target.value!=='none',trendMethod:e.target.value==='lowess'?'lowess':'linear'}:{densityCurve:e.target.value==='kde'},{preserveSelection:true}));
  $('scatter-density').addEventListener('change',e=>apply({scatterDensity:e.target.checked},{preserveSelection:true}));
  $('cdf-threshold').addEventListener('change',e=>{if(e.target.value!==''&&Number.isFinite(Number(e.target.value)))apply({cdfThreshold:Number(e.target.value)},{preserveSelection:true});else syncControls();});
  $('select-cumulative').addEventListener('click',()=>selectRows(cumulativeScope(result).filter(row=>row[state.x]<=state.cdfThreshold).map(row=>row.id),state.selectionMode));
  $('cumulative-curve').addEventListener('change',e=>apply({cumulativeCurve:e.target.checked},{preserveSelection:true}));
  $('smoothing').addEventListener('change',e=>apply({smoothing:e.target.value},{preserveSelection:true}));
  $('density-width').addEventListener('change',e=>apply({densityWidth:e.target.value}));$('intensity-mode').addEventListener('change',e=>apply({intensity:e.target.value}));
  $('undo-button').addEventListener('click',()=>travel('undo'));
  $('plan-name').addEventListener('input',()=>{$('dirty-label').textContent='未保存';queueDraft();});
  document.addEventListener('keydown',e=>{
    if(e.defaultPrevented||e.isComposing||!e.ctrlKey&&!e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable],dialog[open]'))return;
    const key=e.key.toLowerCase();if(key==='z'||key==='y'){e.preventDefault();travel(key==='y'||e.shiftKey?'redo':'undo');}
  });
  window.addEventListener('pagehide',()=>{
    clearTimeout(searchTimer);
    if($('search').value!==state.search){state=sanitize({...state,search:$('search').value});selection.clear();}
    flushDraft();
  });
  $('jump-details').addEventListener('click',()=>$('table-panel').scrollIntoView({behavior:'smooth',block:'start'}));
  $('export-groups').addEventListener('click',()=>{const rows=groupStatistics(result);const content=[[...groupColumns(result),'数据版本'],...rows.map(r=>[...r.values,data.releaseId])].map(row=>row.map(csvCell).join(',')).join('\r\n');download('\uFEFF'+content,'galpedia-group-statistics-'+rows.length+'.csv','text/csv;charset=utf-8');toast('已导出图中 '+rows.length+' 组统计；包含全部组成员。');});
  $('clear-selection').addEventListener('click',()=>selectRows([]));
  $('prev-page').addEventListener('click',()=>{page--;renderTable();});$('next-page').addEventListener('click',()=>{page++;renderTable();});
  $('table-body').closest('table').querySelector('thead').addEventListener('click',e=>{const button=e.target.closest('[data-detail-sort]');if(!button)return;const key=button.dataset.detailSort;sort={key,direction:sort.key===key?-sort.direction:-1};page=0;renderTable();});
  $('save-button').addEventListener('click',()=>{const p=plan();saved.unshift(p);saved=saved.slice(0,12);if(persist()){$('dirty-label').textContent='已保存';toast('已保存到本机。');}renderSaved();});
  $('export-plan').addEventListener('click',()=>download(JSON.stringify(plan(),null,2),'galpedia-analysis-plan.json','application/json'));
  $('import-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(f.size>20000000){toast('方案文件过大。');e.target.value='';return;}try{restorePlan(JSON.parse(await f.text()));}catch{toast('文件不是有效的 JSON 方案。');}e.target.value='';});
  $('export-button').addEventListener('click',()=>{const rows=$('export-scope')?.value==='chart'?representedRows():tableRows(),grain=analysisGrain(state),individual=['character','appearance'].includes(grain);
    const exportFields=FIELDS.filter(f=>result.engine.packs.includes(f.pack)&&(!f.character||usedFields(state).includes(f.id))&&(grain!=='character'||f.character));
    const columns=[...(individual?['记录ID','角色来源ID','角色名称','关联代表版本ID','关联主作品ID','关联作品名称']:['代表版本ID','主作品ID','作品']),'统计单位',...(!individual?['角色数值汇总']:[]),'角色范围',...exportFields.map(f=>f.label+(f.unit?'（'+f.unit+'）':'')),'数据版本'];
    const content=[columns,...rows.map(r=>[...(individual?[r.id,r.characterId,r.title,r.workIds.join(' / '),r.presentationIds.join(' / '),r.workTitles.join(' / ')]:[r.id,r.presentationId,r.title]),unitLabel(state),...(!individual?[state.characterAggregation]:[]),state.characterScope,...exportFields.map(f=>Array.isArray(r[f.id])?r[f.id].join(' / '):r[f.id]??''),data.releaseId])].map(row=>row.map(csvCell).join(',')).join('\r\n');
    download('\uFEFF'+content,'galpedia-analysis-'+rows.length+'-'+grain+'.csv','text/csv;charset=utf-8');toast(`已导出 ${rows.length.toLocaleString()} 个${unitLabel(state)}，${$('export-scope')?.value==='chart'?'范围为整张图':'范围为已选记录'}。`);});
  bindExploration(()=>result,apply,assign,inspectPair);$('back-matrix').addEventListener('click',()=>{if(returnMatrix){apply(returnMatrix);returnMatrix=null;}$('back-matrix').hidden=true;});
  $('source-button').addEventListener('click',()=>$('source-dialog').showModal());$('close-source').addEventListener('click',()=>$('source-dialog').close());
}
async function start(){
  try{({data,engine}=await loadFullData());
    if(!Array.isArray(data.rows)||new Set(data.rows.map(r=>r.id)).size!==data.counts.editions)throw new Error('数据契约不匹配');
    $('dataset-count').textContent=data.rows.length.toLocaleString();
    for(const tag of data.tagVocabulary)$('tag-filter').append(option(tag,tag));
    try{const raw=JSON.parse(localStorage.getItem(KEY)||'[]');saved=Array.isArray(raw)?raw.filter(p=>p?.schemaVersion===PLAN&&typeof p.name==='string').slice(0,12):[];}catch{saved=[];}
    bind();dashboard=new CompanyDashboard(()=>result,apply,selectRows);renderSaved();await refresh();
    if(!result)throw Error('首张图表计算失败');
    experience=new WorkbenchExperience(dashboard,apply,queueDraft);
    mountFullUI(data,apply,dashboard);
    builder=new WorkbenchBuilder({apply,assign,result:()=>result,selection:()=>selection,data:()=>data,toast},dashboard);
    $('redo-button').addEventListener('click',()=>travel('redo'));
    $('field-target').addEventListener('change',e=>setActiveShelf(e.target.value));
    let draft=null;try{draft=readDraft(localStorage.getItem(DRAFT_KEY),data);}catch{}
    if(draft){state=draft.state;selection=new Set(draft.selection);$('plan-name').value=draft.name;experience.restoreUI(draft.ui);}
    await refresh();sessionReady=true;queueDraft();
    if(draft){builder.compact();toast('已恢复上次的图表、筛选和选择。');}
    if(innerWidth>900)dashboard.openEditor('fields');
    // Entry dialogs are user initiated. Loading the workspace must never make it inert.
    document.body.dataset.ready='true';
  }catch(error){$('chart-title').textContent='公开快照未能加载';$('chart-subtitle').textContent='请检查网络连接，然后刷新页面重试。';$('result-summary').textContent=String(error.message);document.body.dataset.error='true';}
}
start();

import {FIELDS,field,groupField,chartRows} from './model.mjs';
const $=id=>document.getElementById(id);
const options=(el,entries,value)=>{el.replaceChildren(...entries.map(([key,label])=>{const o=document.createElement('option');o.value=key;o.textContent=label;return o;}));el.value=value;};
export function cumulativeScope(result){
  const rows=chartRows(result),g=result.series?.find(g=>String(g.key)===result.state.brushGroup);
  if(!g)return rows;const ids=new Set(g.ids);return rows.filter(r=>ids.has(r.id));
}
export function bindExploration(getResult,apply,assign,inspect){
  for(const [id,key] of [['marginals','marginals'],['facet-view','facet'],['brush-enabled','brushEnabled']])$(id).addEventListener('change',e=>apply({[key]:e.target.checked},{preserveSelection:true}));
  for(const [id,key] of [['line-unit','lineUnit'],['lowess-fraction','lowessFraction'],['correlation-method','correlationMethod'],['matrix-style','matrixStyle'],['brush-group','brushGroup'],['selection-mode','selectionMode']])$(id).addEventListener('change',e=>apply({[key]:e.target.value},{preserveSelection:['lowessFraction','brushGroup','selectionMode'].includes(key)}));
  $('matrix-fields').replaceChildren(...FIELDS.filter(f=>f.type==='number').map(f=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=f.id;input.setAttribute('aria-label','关系总览字段 '+f.short);
    input.addEventListener('change',()=>{const ids=[...$('matrix-fields').querySelectorAll('input:checked')].map(e=>e.value);if(ids.length>=2)apply({matrixFields:ids});});label.append(input,document.createTextNode(f.short));return label;}));
  const legend=document.createElement('legend');legend.textContent='选择至少两个字段';$('matrix-fields').prepend(legend);
  for(const axis of ['x','y']){const el=$('axis-drop-'+axis);
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('dragover');});el.addEventListener('dragleave',()=>el.classList.remove('dragover'));
    el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('dragover');document.body.classList.remove('field-dragging');assign(axis,e.dataTransfer.getData('text/plain'));});
    el.addEventListener('click',()=>{const input=$(axis+'-field');input.focus();try{input.showPicker?.();}catch{}});
  }
  document.addEventListener('dragstart',e=>{if(e.target.closest('[data-field]'))document.body.classList.add('field-dragging');});
  document.addEventListener('dragend',()=>document.body.classList.remove('field-dragging'));
  $('matrix-pairs').addEventListener('click',e=>{const b=e.target.closest('[data-pair]');if(b)inspect(JSON.parse(b.dataset.pair));});
}
export function syncExploration(result){
  const s=result.state,series=!!result.series,matrix=s.chart==='matrix';
  $('marginals-control').hidden=s.chart!=='scatter';$('marginals').checked=s.marginals;
  $('facet-control').hidden=!series;$('facet-view').checked=s.facet;
  $('line-unit-control').hidden=s.chart!=='line';$('line-unit').value=s.lineUnit;
  $('line-unit').querySelector('[value=year]').textContent=s.x==='year'?'按年汇总':s.x==='month'?'按月份汇总':'同一横轴值汇总';
  $('line-unit').querySelector('[value=edition]').textContent='逐部作品 · 不做汇总';
  $('matrix-controls').hidden=!matrix;$('matrix-access').hidden=!matrix;
  $('correlation-method').value=s.correlationMethod;$('matrix-style').value=s.matrixStyle;
  for(const input of $('matrix-fields').querySelectorAll('input')){input.checked=s.matrixFields.includes(input.value);input.disabled=input.checked&&s.matrixFields.length<=2;}
  if(matrix)$('matrix-pairs').replaceChildren(...result.matrix.filter(c=>s.matrixFields.indexOf(c.x)<s.matrixFields.indexOf(c.y)).map(c=>{const b=document.createElement('button');b.dataset.pair=JSON.stringify([c.x,c.y]);b.textContent=`${field(c.x).short} × ${field(c.y).short} · ${c.value===null?'不可计算':c.value.toFixed(2)} · n=${c.n}`;return b;}));
  $('selection-toolbar').hidden=matrix;$('brush-enabled').checked=s.brushEnabled;$('selection-mode').value=s.selectionMode;
  const keys=series?result.series.map(g=>[String(g.key),g.label]):result.groups?result.groups.map(g=>[String(g.key),g.label]):s.chart==='scatter'&&s.color!=='none'?[...new Set(result.points.map(r=>String(r[s.color]??'')))].sort().map(k=>[k,k]):[];
  options($('brush-group'),[['','全部组'],...keys],keys.some(([key])=>key===s.brushGroup)?s.brushGroup:'');
  $('brush-group-control').hidden=!keys.length;$('selection-help').textContent=s.brushGroup?'框选仅作用于选定组；统计曲线仍使用完整样本。':'拖框选择作品；按住 Shift 追加、Alt 移除。手机请先开启框选。';
  for(const axis of ['x','y']){$('axis-drop-'+axis).hidden=matrix||axis==='y'&&(['ecdf','histogram'].includes(s.chart)||s.chart==='bar'&&s.aggregation==='count');$('axis-drop-'+axis).textContent=(axis==='x'?'横轴：':'纵轴：')+field(s[axis]).short+' ▾';}
}
export function positionAxisTargets(chart){
  if(!chart.plot)return;const {l,r,t,b}=chart.plot;
  const x=$('axis-drop-x'),y=$('axis-drop-y');Object.assign(x.style,{left:l+'px',top:(chart.result.series?chart.h-28:chart.h-28)+'px',width:Math.max(80,r-l)+'px'});
  Object.assign(y.style,{left:'0px',top:(t+(b-t)/2-70)+'px',height:'140px'});
  const curveView=!!chart.result.densityCurves;y.classList.toggle('density-axis',curveView);
  if(curveView){x.hidden=true;y.hidden=false;y.textContent=field(chart.result.state.y).short+' ▾';Object.assign(y.style,{left:l+'px',top:chart.h-27+'px',height:'25px',width:Math.max(80,r-l)+'px'});}else y.style.width='';
  if(chart.result.state.facet&&chart.result.series){x.hidden=true;y.hidden=true;}
}

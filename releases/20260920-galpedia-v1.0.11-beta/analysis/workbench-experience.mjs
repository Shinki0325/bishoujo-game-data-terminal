const $=id=>document.getElementById(id);
const section=(id,label,nodes,parent)=>{
  const d=document.createElement('details');d.id=id;d.className='inspector-section';
  const summary=document.createElement('summary');summary.textContent=label;d.append(summary);
  const body=document.createElement('div');body.className='inspector-section-body';
  for(const name of nodes)body.append($(name));d.append(body);parent.append(d);return d;
};
export class WorkbenchExperience{
  constructor(dashboard,apply,onPersist){
    this.dashboard=dashboard;this.onPersist=onPersist;
    const main=$('company-editor-main'),options=$('chart-options');
    document.querySelector('.chart-tabs').hidden=true;
    this.sections=[
      section('inspector-layers','叠加曲线与分布',['overlay-control','scatter-density-control','cumulative-control','lowess-control','marginals-control','smoothing-control'],options),
      section('inspector-groups','分组与排列',['facet-control','top-control','group-mode-control','group-sort-control','min-group-control'],options),
      section('inspector-range','坐标范围',['score-view-control','log-control'],main),
      section('inspector-selection','框选方式',['selection-toolbar'],main)
    ];
    main.append($('comparison-picker'));
    const status=document.createElement('span');status.id='draft-status';status.setAttribute('role','status');status.textContent='自动保存在本机';
    document.querySelector('.sheet-summary').prepend(status);
    const actions=document.createElement('div');actions.className='history-actions';
    $('undo-button').before(actions);actions.append($('undo-button'));
    const redo=document.createElement('button');redo.id='redo-button';redo.textContent='↷ 重做';redo.disabled=true;actions.append(redo);
    const target=document.createElement('label');target.className='field-target';target.innerHTML='点击字段添加到 <select id="field-target"><option value="x">横轴 / 分组</option><option value="y">纵轴 / 数值</option><option value="color">颜色 / 对照</option></select>';
    $('company-editor-fields').prepend(target);
    this.nav=document.createElement('div');this.nav.id='group-navigation';this.nav.className='group-navigation';this.nav.hidden=true;
    this.nav.innerHTML='<div class="group-nav-heading"><label>时间分组 <select id="time-grain"><option value="year">按年份</option><option value="decade">按年代汇总</option></select></label><span id="group-visible-range" role="status"></span></div><div id="group-scroll-controls" class="group-scroll-controls"><button id="group-earlier" aria-label="查看更早年份">←</button><div class="year-range-slider"><div class="year-range-track"></div><input id="group-start" type="range" min="0" max="1" step="1" aria-label="显示起始年份"><input id="group-end" type="range" min="0" max="1" step="1" aria-label="显示结束年份"></div><button id="group-later" aria-label="查看更晚年份">→</button><button id="group-latest">最近年份</button><button id="group-all">全部</button></div><div class="year-range-caption"><label for="group-start" id="group-start-label"></label><span>仅调整显示范围</span><label for="group-end" id="group-end-label"></label></div><small id="group-sample-note"></small>';
    $('chart-wrapper').before(this.nav);
    const wrap=$('chart-wrapper');
    this.axis=document.createElement('canvas');this.axis.className='group-fixed-axis';this.axis.hidden=true;this.axis.setAttribute('aria-hidden','true');wrap.append(this.axis);
    $('time-grain').addEventListener('change',e=>apply({x:e.target.value,groupSort:'name',groupMode:'auto',top:30,minGroup:1},{preserveSelection:true}));
    $('group-start').addEventListener('input',e=>this.setWindow(Math.min(Number(e.target.value),this.window.end),this.window.end));
    $('group-end').addEventListener('input',e=>this.setWindow(this.window.start,Math.max(Number(e.target.value),this.window.start)));
    $('group-earlier').addEventListener('click',()=>this.shiftWindow(-1));
    $('group-later').addEventListener('click',()=>this.shiftWindow(1));
    $('group-latest').addEventListener('click',()=>{const n=this.chart.result.groups.length,size=this.window.end-this.window.start+1;this.setWindow(Math.max(0,n-size),n-1);});
    $('group-all').addEventListener('click',()=>this.setWindow(0,this.chart.result.groups.length-1));
    this.foldIds=['company-table-details','group-summary','company-recent',...this.sections.map(s=>s.id)];
    document.querySelector('.chart-method-details').id='workbench-notes';this.foldIds.push('workbench-notes');
    for(const id of this.foldIds)$(id).addEventListener('toggle',onPersist);
    $('company-explore').addEventListener('click',onPersist);
  }
  sync(){
    for(const d of this.sections)d.hidden=![...d.querySelector('.inspector-section-body').children].some(n=>!n.hidden);
    $('chart-options').hidden=![...$('chart-options').children].some(n=>!n.hidden);
    for(const key of ['x','y','color'])$('field-target').querySelector('[value='+key+']').disabled=$(key+'-field').disabled;
  }
  prepareChart(chart){
    this.chart=chart;const r=chart.result,s=r.state;
    const enabled=['density','box','bar'].includes(s.chart)&&!r.densityCurves&&['year','decade'].includes(s.x);
    chart.groupWindow=null;this.nav.hidden=!enabled;this.axis.hidden=!enabled;
    if(!enabled)return;
    const groups=r.groups,n=groups.length,key=s.x+':'+groups.map(g=>g.key).join(',');
    if(this.groupKey!==key){
      const old=this.windowKeys;
      const count=Math.max(1,Math.min(n,Math.floor(($('chart-wrapper').clientWidth-84)/74)));
      let start=s.x==='year'?Math.max(0,n-count):0,end=s.x==='year'?n-1:Math.min(n-1,count-1);
      const saved=this.restoreWindow??old;
      if(saved?.field===s.x){
        const a=groups.findIndex(g=>String(g.key)===saved.start),b=groups.findIndex(g=>String(g.key)===saved.end);
        if(a>=0&&b>=a){start=a;end=b;}
      }else if(this.restoreScroll!==undefined){start=Math.round(this.restoreScroll*Math.max(0,n-count));end=Math.min(n-1,start+count-1);}
      this.window={start,end};this.groupKey=key;this.restoreWindow=undefined;this.restoreScroll=undefined;
    }
    if(n){chart.groupWindow={...this.window};this.windowKeys={field:s.x,start:String(groups[this.window.start].key),end:String(groups[this.window.end].key)};}
  }
  setWindow(start,end){
    const n=this.chart?.result.groups?.length??0;if(!n)return;
    this.window={start:Math.max(0,Math.min(n-1,start)),end:Math.max(0,Math.min(n-1,end))};
    this.chart.groupWindow={...this.window};this.chart.draw();this.onPersist();
  }
  shiftWindow(direction){
    const size=this.window.end-this.window.start+1,n=this.chart.result.groups.length;
    const start=Math.max(0,Math.min(n-size,this.window.start+direction*Math.max(1,Math.floor(size*.8))));
    this.setWindow(start,start+size-1);
  }
  onDraw(chart){
    this.chart=chart;if(this.nav.hidden)return;
    const wrap=$('chart-wrapper');wrap.scrollLeft=0;
    const ratio=chart.canvas.width/chart.w;
    this.axis.width=Math.ceil(chart.plot.l*ratio);this.axis.height=chart.canvas.height;
    this.axis.style.width=chart.plot.l+'px';this.axis.style.height=chart.h+'px';this.axis.style.left='0px';
    const ctx=this.axis.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,this.axis.width,this.axis.height);
    ctx.drawImage(chart.canvas,0,0,this.axis.width,this.axis.height,0,0,this.axis.width,this.axis.height);
    $('time-grain').value=chart.result.state.x;this.updateRange();
  }
  updateRange(){
    if(this.nav.hidden||!this.chart)return;
    const groups=this.chart.result.groups,n=groups.length,{start,end}=this.window;
    const visible=n?groups.slice(start,end+1):[];
    $('group-visible-range').textContent=visible.length?`${visible[0].label}–${visible.at(-1).label} · 显示 ${visible.length} / ${n} 组`:'暂无年份组';
    $('chart-hint').textContent='拖动时间轴两端调整显示年份 · 点选或框选查看作品';
    for(const [id,value,label] of [['group-start',start,visible[0]?.label],['group-end',end,visible.at(-1)?.label]]){
      $(id).max=String(Math.max(0,n-1));$(id).value=String(Math.max(0,value));$(id).disabled=n<2;$(id).setAttribute('aria-valuetext',label??'无年份');
      $(id+'-label').textContent=(id==='group-start'?'起始：':'结束：')+(label??'—');
    }
    const slider=$('group-start').parentElement;slider.style.setProperty('--range-start',(n>1?start/(n-1)*100:0)+'%');slider.style.setProperty('--range-end',(n>1?end/(n-1)*100:100)+'%');
    $('group-earlier').disabled=!n||start===0;$('group-later').disabled=$('group-latest').disabled=!n||end===n-1;
    $('group-all').disabled=!n||start===0&&end===n-1;
    const small=visible.filter(g=>g.n>0&&g.n<5);$('group-sample-note').hidden=!small.length;
    $('group-sample-note').textContent=small.length?'当前可见组中有 '+small.map(g=>`${g.label}仅 ${g.n} 个样本`).join('、')+'；请结合样本数比较颜色深浅。':'';
  }
  captureUI(){
    const wrap=$('chart-wrapper'),max=wrap.scrollWidth-wrap.clientWidth;
    return {exploring:this.dashboard.exploring,folds:Object.fromEntries(this.foldIds.map(id=>[id,$(id).open])),scroll:max>0?wrap.scrollLeft/max:0,yearWindow:this.windowKeys};
  }
  restoreUI(ui){
    this.dashboard.exploring=ui.exploring===true;
    for(const id of this.foldIds)if(typeof ui.folds?.[id]==='boolean')$(id).open=ui.folds[id];
    if(Number.isFinite(ui.scroll))this.restoreScroll=Math.max(0,Math.min(1,ui.scroll));
    this.restoreWindow=ui.yearWindow;this.groupKey=null;
  }
}

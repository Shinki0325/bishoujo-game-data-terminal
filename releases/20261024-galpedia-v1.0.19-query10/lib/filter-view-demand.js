import {DEFAULT_FILTER_STATE} from './state.js';

// A closed, unfiltered drawer has no controls to initialize. Applied filters
// still use the original renderer, including its chips, counts and validation.
export function createFilterView(options){
 let view,pending,lastRender;const queued=new Map(),root=options.root;
 const button=root.getElementById('filter-toggle');
 const baseline=state=>['titleQuery','minimumScore','minimumVoteCount','releaseYearStart','releaseYearEnd','releaseStatus','brandIds','personIds','attributeSelections','positiveFilterIds','excludedFilterIds','advancedExpression','selectedOnly'].every(k=>JSON.stringify(state[k]??DEFAULT_FILTER_STATE[k])===JSON.stringify(DEFAULT_FILTER_STATE[k]));
 const ensure=()=>pending??=import('../views/filter-view.js').then(module=>{
  view=module.createFilterView(options);
  for(const [method,args]of queued)view[method](...args);queued.clear();
  if(lastRender)view[lastRender.method](...lastRender.args);
  return view;
 }).catch(error=>{pending=null;throw error;});
 const load=()=>ensure().catch(error=>{
  const status=root.getElementById('filter-result-status');if(status){status.textContent='筛选工具暂时未能加载，请重试。';status.dataset.state='error';}
  console.warn('筛选工具加载失败',error);
 });
 button.addEventListener('click',event=>{
  // An explicit filter click is enough intent to overlap data with UI loading.
  // Preparation is optional; the real preview still reports errors/retries.
  void Promise.resolve().then(()=>options.onPrepare?.()).catch(()=>{});
  if(view)return;event.stopImmediatePropagation();event.preventDefault();
  if(button.getAttribute('aria-busy')==='true')return;
  button.setAttribute('aria-busy','true');
  void load().then(result=>{button.removeAttribute('aria-busy');if(result&&button.isConnected)button.click();});
 },true);
 const render=(method,args)=>{
  lastRender={method,args};if(view)return view[method](...args);
  if(!baseline(args[0])){void load();return;}
  const total=method==='renderSummary'?args[1]:args[1]?.current??0;
  root.getElementById('active-filter-summary').textContent=`当前范围 · ${total===null?'待统计':new Intl.NumberFormat('zh-CN').format(total)}`;
  root.getElementById('active-filter-chips').replaceChildren();
  const badge=root.getElementById('filter-applied-count');if(badge){badge.hidden=true;badge.textContent='0';badge.parentElement.setAttribute('aria-label','筛选');}
 };
 return {prepare:ensure,render:(...args)=>render('render',args),renderSummary:(...args)=>render('renderSummary',args),
  visibleFilterIds:()=>view?.visibleFilterIds()??[],flushDraft:()=>view?.flushDraft()??false,
  setDraftEditing:(...a)=>view?view.setDraftEditing(...a):queued.set('setDraftEditing',a),
  setPersonOptions:(...a)=>view?view.setPersonOptions(...a):queued.set('setPersonOptions',a),
  setPersonOptionsLoading:(...a)=>view?view.setPersonOptionsLoading(...a):queued.set('setPersonOptionsLoading',a)};
}

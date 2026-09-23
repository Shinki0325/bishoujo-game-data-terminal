import {analysisGrain,plottedFields} from './model.mjs';
import {ratingActive,ratingLabel,ratingSources} from './rating-filter.mjs';
const $=id=>document.getElementById(id);
export function mountRatingFilter(apply,dashboard){
  const number=$('min-votes'),countLabel=number.closest('label'),sourceLabel=$('vote-source').closest('label');
  countLabel.querySelector('.unit')?.remove();countLabel.firstChild.textContent='最低评价人数（人）';
  const panel=document.createElement('fieldset');panel.id='rating-sample-filter';
  panel.innerHTML='<legend>评分样本</legend><p class="rating-filter-help">按评价人数排除小样本作品。</p><label>筛选方式<select id="vote-filter-mode"><option value="count">最低评价人数</option><option value="percentile">按人数比例去尾</option></select></label><label id="vote-percent-control">排除人数最少的比例<div class="rating-percent-input"><input id="vote-trim-percent" type="number" min="0" max="95" step="1" value="10"><span>%</span></div></label><div id="vote-presets" role="group" aria-label="常用评分人数条件"></div><p id="rating-filter-status" role="status"></p><p id="rating-filter-method" class="rating-filter-help"></p>';
  sourceLabel.before(panel);panel.querySelector('legend').after(sourceLabel);panel.querySelector('#vote-percent-control').before(countLabel);
  $('vote-filter-mode').addEventListener('change',e=>apply({voteFilterMode:e.target.value}));
  $('vote-trim-percent').addEventListener('change',e=>{if(e.target.value===''||!Number.isFinite(Number(e.target.value))||+e.target.value<0||+e.target.value>95){e.target.setCustomValidity('请输入 0–95 之间的比例');e.target.reportValidity();return;}e.target.setCustomValidity('');apply({voteTrimPercent:+e.target.value});});
  $('vote-trim-percent').addEventListener('input',e=>e.target.setCustomValidity(''));
  panel._apply=apply;panel._dashboard=dashboard;
}
export function syncRatingFilter(result){
  if(!$('rating-sample-filter'))return;
  if(!$('rating-filter-open')){const panel=$('rating-sample-filter'),shortcut=document.createElement('button');shortcut.id='rating-filter-open';shortcut.addEventListener('click',()=>{panel._dashboard.openEditor('filters');panel.scrollIntoView({block:'nearest'});$('vote-filter-mode').focus();});$('builder-filter').before(shortcut);const summary=document.createElement('p');summary.id='rating-filter-summary';summary.setAttribute('role','status');$('builder-config').after(summary);}
  const s=result.state,info=result.ratingFilter,sources=ratingSources(s,plottedFields(s)),active=ratingActive(s),percent=s.voteFilterMode==='percentile',character=analysisGrain(s)==='character';
  $('vote-filter-mode').value=s.voteFilterMode;$('vote-trim-percent').value=s.voteTrimPercent;
  $('min-votes').closest('label').hidden=percent;$('vote-percent-control').hidden=!percent;
  const automatic=$('vote-source').querySelector('[value=auto]');automatic.textContent='随评分字段 · '+ratingSources({...s,voteSource:'auto'},plottedFields(s)).map(v=>v.label).join('、');
  $('rating-filter-open').textContent=active?ratingLabel(s,plottedFields(s)):'评分人数：不限';$('rating-filter-open').setAttribute('aria-pressed',String(active));
  const values=percent?[0,5,10,20]:[0,30,100,300],key=percent?'voteTrimPercent':'minVotes';
  $('vote-presets').replaceChildren(...values.map(value=>{const b=document.createElement('button');b.type='button';b.textContent=value===0?'不限':percent?value+'%':'≥ '+value+' 人';b.setAttribute('aria-pressed',String(s[key]===value));b.addEventListener('click',()=>$('rating-sample-filter')._apply({[key]:value}));return b;}));
  const threshold=info.thresholds.map(t=>t.label+' ≥ '+(t.cutoff===null?'无可用人数':Math.ceil(t.cutoff).toLocaleString()+' 人')).join('；');
  const noun=analysisGrain(s)==='edition'?'版本':'作品';
  const text=!active?'未设置人数门槛。':`${threshold} · 保留 ${info.worksAfter.toLocaleString()} / ${info.worksBefore.toLocaleString()} 部${noun} · 排除 ${info.worksExcluded.toLocaleString()} 部${info.missing?'（含人数缺失 '+info.missing.toLocaleString()+' 部）':''}`;
  $('rating-filter-status').textContent=text;
  $('rating-filter-summary').hidden=!active;$('rating-filter-summary').textContent=(character?'按关联作品筛选，再对角色去重。':'')+text;
  $('rating-filter-method').textContent=(character?'按关联作品的人数筛选，再对角色去重。':'')+(percent?'在当前其他筛选范围内，按作品的有效评价人数计算分位点；各组使用同一门槛，同人数一起保留，所以实际排除比例可能不同。':'人数缺失的作品在启用门槛时排除。')+(s.voteSource==='auto'&&sources.length>1?' 每个评分站点都须满足各自人数门槛。':'');
}

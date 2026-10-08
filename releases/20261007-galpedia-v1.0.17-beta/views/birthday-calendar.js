import {projectBirthdayVotes} from '../lib/rating-consumers.js';
import {keyOf, monthGrid, adjacent, matches, imagePolicy, upcomingBirthdayDays, sortCharactersByVotes} from '../lib/birthday-calendar.js';
import {bindImageSafety} from '../lib/image-safety.js';
import {parseBirthdayRoute} from '../lib/birthday-route.js';
import {createBirthdayFavorites,BIRTHDAY_FAVORITES_PREFIX} from '../lib/birthday-favorites.js';
const dataRoot=new URL('../runtime-data/birthday-calendar-v1/',import.meta.url);
export function createBirthdayCalendar(host){
let active=false,startup=0;
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./birthday-calendar.css',import.meta.url);document.head.append(css);
host.innerHTML=`
<div class="intro"><h1>角色生日历</h1><button class="today-stamp" id="bc-today-stamp" aria-label="查看今天的生日角色"><span id="bc-today-month"></span><strong id="bc-today-day"></strong><span id="bc-today-count"></span><span aria-hidden="true">→</span></button></div>
<div class="list-tools"><div class="search-row"><label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><span class="sr-only">在全年搜索角色或作品</span><input type="search" id="bc-search" placeholder="搜索全年角色或作品" maxlength="100"></label><button id="bc-clear-search" hidden aria-label="清除搜索">清除</button></div>
<div class="browse-controls"><div class="birthday-modes" role="group" aria-label="时间视图"><button id="bc-browse" aria-pressed="true">日历</button><button id="bc-upcoming" aria-pressed="false">未来七天</button></div><div class="filter-row" role="group" aria-label="角色筛选"><button id="bc-saved" aria-pressed="false"><span aria-hidden="true">☆</span> 我的收藏</button><label class="female-filter"><input type="checkbox" role="switch" id="bc-female"><span class="switch-track" aria-hidden="true"></span><span>仅女性</span></label></div></div></div>
<p id="bc-personal-status" role="status" hidden></p>
<div class="birthday-layout"><section class="calendar-section" aria-label="角色生日月历">
<div class="calendar-toolbar"><div class="month-tools"><button id="bc-previous" aria-label="上个月">‹</button><label class="month-label"><span class="sr-only">选择月份</span><select id="bc-month">${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1} 月</option>`).join('')}</select></label><button id="bc-next" aria-label="下个月">›</button><button id="bc-today">今天</button></div></div>
<div class="calendar-summary"><p id="bc-month-summary" class="muted" aria-live="polite">正在读取日历…</p><button id="bc-calendar-toggle" aria-expanded="true" aria-controls="bc-calendar-panel">收起月历</button></div>
<div id="bc-date-strip" aria-label="快捷选择日期"></div>
<div id="bc-calendar-panel">
<div class="weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
<div id="bc-calendar" class="calendar" aria-label="选择日期"></div>
<button id="bc-leap" hidden>2 月 29 日 · 闰日生日</button>
<div class="calendar-legend"><span class="today-dot"></span>今天 <span class="selected-dot"></span>已选日期<label class="calendar-year"><span class="sr-only">日历年份</span><input type="number" id="bc-year" min="2000" max="2100" inputmode="numeric">年</label></div>
</div>
</section>
<section class="birthday-section" aria-labelledby="bc-list-title"><div class="list-heading"><div><p class="eyebrow" id="bc-list-kicker">HAPPY BIRTHDAY</p><h2 id="bc-list-title">生日角色</h2><p class="muted" id="bc-list-summary" aria-live="polite"></p></div><div class="list-actions"><span class="sort-label">Bangumi 人数 ↓</span><button id="bc-all-month">查看整月</button></div></div><div id="bc-status" role="status" hidden></div><div id="bc-characters" class="characters"></div><button id="bc-more" hidden>加载更多角色</button><span id="bc-announcement" class="sr-only" aria-live="polite"></span></section>
</div>
`;
const $ = id => host.querySelector('#bc-'+id);
const favoriteFeedback=document.createElement('div');favoriteFeedback.id='bc-favorite-feedback';favoriteFeedback.setAttribute('role','status');favoriteFeedback.hidden=true;host.append(favoriteFeedback);
let feedbackTimer;
function hideFavoriteFeedback(){clearTimeout(feedbackTimer);favoriteFeedback.hidden=true;favoriteFeedback.textContent='';}
function showFavoriteFeedback(message){hideFavoriteFeedback();favoriteFeedback.textContent=message;favoriteFeedback.hidden=false;feedbackTimer=setTimeout(hideFavoriteFeedback,3000);}
let today = new Date(), state = {year: today.getFullYear(), month: today.getMonth()+1, day: today.getDate(), query: '', femaleOnly:false, limit: 30};
let manifest, pack, votes = {}, femaleIds=new Set(), femaleDays={}, loading = false, failure = '', ticket = 0;
const cache = new Map(), pendingMonths = new Map();
let yearPack, pendingYear, searchTimer, midnightTimer, composing=false;
let upcomingDays=upcomingBirthdayDays();
const favorites=createBirthdayFavorites();
const searching=()=>!!state.query.trim();
const upcoming=()=>!!state.upcoming&&!searching();
const allYear=()=>searching()||state.savedOnly||upcoming();
const selectedRows=()=>{
  // 数据包已按 Bangumi 人数排序；稳定分组保留收藏与非收藏各自的原顺序。
  const saved=[],others=[];for(const c of filtered())(favorites.has(c)?saved:others).push(c);
  const rows=[...saved,...others];
  if(upcoming()){const order=new Map(upcomingDays.map((d,i)=>[d.key,i]));return rows.filter(c=>order.has(c.birthday)).sort((a,b)=>order.get(a.birthday)-order.get(b.birthday));}
  return allYear()||state.day===null?rows:rows.filter(c=>c.birthday===keyOf(state.month,state.day));
};
document.addEventListener('keydown',e=>{if(e.key==='Tab')host.dataset.keyboard='true';});
host.addEventListener('pointerdown',()=>{host.dataset.keyboard='false';});
const compactViewport=matchMedia('(max-width:760px)');
let calendarCollapsed=false;
function setCalendarCollapsed(value, focus=false){
  calendarCollapsed=value;
  const collapsed=value&&compactViewport.matches;
  $('calendar-panel').hidden=collapsed;
  $('date-strip').hidden=!collapsed;
  $('calendar-toggle').setAttribute('aria-expanded',String(!collapsed));
  $('calendar-toggle').textContent=collapsed?'展开月历':'收起月历';
  const summary=$('month-summary');
  if(summary.dataset.expandedText)summary.textContent=collapsed?summary.dataset.collapsedText:summary.dataset.expandedText;
  if(focus)$('calendar-toggle').focus();
}
compactViewport.addEventListener('change',()=>setCalendarCollapsed(calendarCollapsed));
const number = value => value.toLocaleString('zh-CN');
const bindings=[]; const clearImages=()=>{for(const b of bindings.splice(0))b.dispose();};
const text = (tag, value, className) => {const el = document.createElement(tag); el.textContent = value; if(className)el.className = className; return el;};
const safeURL = value => {try {const u = new URL(value); return u.protocol === 'https:' ? u.href : null;} catch {return null;}};
const sourceName = name => ({vndb:'VNDB',bangumi:'Bangumi',egs:'EGS'})[name] || name;
function link(label, href, cls) {const el = text('a',label,cls);el.href=href;if(!href.startsWith('#')){el.target='_blank';el.rel='noopener noreferrer';}return el;}
function updateDateStamp() {today=new Date();$('today-month').textContent=`今天 · ${today.getMonth()+1} 月`;$('today-day').textContent=`${today.getDate()} 日`;if(manifest)$('today-count').textContent=`${(state.femaleOnly?femaleDays:manifest.days)[keyOf(today.getMonth()+1,today.getDate())]||0} 位${state.femaleOnly?'女性':''}角色`;}
function setStatus(message, retry=false) {
  const el=$('status');el.replaceChildren();el.hidden=!message;
  el.classList.toggle('is-loading',!!message&&!retry&&(loading||!manifest));
  if(message)el.append(text('span',message));
  if(retry){const b=text('button','重试');b.onclick=()=>manifest?loadScope():start();el.append(b);}
}
async function request(url) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.arrayBuffer();}
  finally {clearTimeout(timer);}
}
function setStartupControls(disabled){for(const id of ['previous','next','month','year','today','today-stamp','search','all-month','female','browse','saved','upcoming'])$(id).disabled=disabled;}
function filtered() {return (pack?.characters || []).filter(c=>(!state.femaleOnly||femaleIds.has(c.id))&&(!state.savedOnly||favorites.has(c))&&matches(c,state.query,pack.works));}
function renderCalendar(rows) {
  const groups=new Map();for(const c of rows){if(!groups.has(c.birthday))groups.set(c.birthday,[]);groups.get(c.birthday).push(c);}
  $('month').value=String(state.month);$('year').value=String(state.year);
  $('previous').disabled=state.year===2000&&state.month===1;$('next').disabled=state.year===2100&&state.month===12;
  $('month-summary').textContent=loading?'正在读取本月角色…':failure?'本月资料暂未载入':`${state.month} 月 · ${number(rows.length)} 位${state.query?'匹配的':''}角色有生日`;
  $('month-summary').dataset.expandedText=$('month-summary').textContent;
  $('month-summary').dataset.collapsedText=!loading&&!failure&&state.day!==null?`已选 ${state.month} 月 ${state.day} 日 · ${groups.get(keyOf(state.month,state.day))?.length||0} 位角色`:$('month-summary').textContent;
  setCalendarCollapsed(calendarCollapsed);
  const days=monthGrid(state.year,state.month).filter(Boolean);
  const tabDay=days.some(c=>c.day===state.day)?state.day:1;
  const nodes=monthGrid(state.year,state.month).map(cell=>{
    if(!cell)return text('div','','blank');
    const list=groups.get(cell.key)||[], count=loading&&!state.query?((state.femaleOnly?femaleDays:manifest?.days)?.[cell.key]||0):list.length;
    const b=text('button','');b.type='button';b.dataset.day=cell.day;b.setAttribute('aria-pressed',String(state.day===cell.day));b.setAttribute('aria-label',`${state.month}月${cell.day}日，${count}位角色生日`);
    b.tabIndex=cell.day===tabDay?0:-1;
    if(state.year===today.getFullYear()&&state.month===today.getMonth()+1&&cell.day===today.getDate()){b.classList.add('is-today');b.setAttribute('aria-current','date');}
    b.append(text('span',cell.day,'day-number'),text('span',count?`${count} 位`:'—','day-count'));
    b.onclick=e=>{state.day=cell.day;state.limit=30;render();if(compactViewport.matches)setCalendarCollapsed(true,true);else if(e.detail===0)$('calendar').querySelector(`[data-day="${cell.day}"]`)?.focus();};
    b.onkeydown=e=>{
      const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];
      if(step===undefined&&e.key!=='Home'&&e.key!=='End')return;
      e.preventDefault();const day=e.key==='Home'?1:e.key==='End'?days.length:Math.max(1,Math.min(days.length,cell.day+step));
      for(const button of $('calendar').querySelectorAll('button'))button.tabIndex=Number(button.dataset.day)===day?0:-1;
      $('calendar').querySelector(`[data-day="${day}"]`)?.focus();
    };return b;
  });$('calendar').replaceChildren(...nodes);
  const first=Math.max(1,Math.min((state.day||1)-3,days.length-6));
  $('date-strip').replaceChildren(...days.filter(d=>d.day>=first&&d.day<first+7).map(d=>{
    const b=text('button','','quick-date');b.type='button';b.dataset.day=d.day;
    b.setAttribute('aria-pressed',String(d.day===state.day));
    const count=groups.get(d.key)?.length||0;
    b.setAttribute('aria-label',`${state.month}月${d.day}日，${count}位角色生日`);
    b.append(text('span',['日','一','二','三','四','五','六'][new Date(state.year,state.month-1,d.day).getDay()]),text('strong',d.day));
    if(state.year===today.getFullYear()&&state.month===today.getMonth()+1&&d.day===today.getDate())b.setAttribute('aria-current','date');
    b.onclick=e=>{state.day=d.day;state.limit=30;render();if(e.detail===0)$('date-strip').querySelector(`[data-day="${d.day}"]`)?.focus();};return b;
  }));
  const leap=state.month===2&&!monthGrid(state.year,2).some(c=>c?.day===29);
  $('leap').hidden=!leap;$('leap').textContent=`2 月 29 日 · ${groups.get('02-29')?.length||0} 位闰日生日角色`;$('leap').setAttribute('aria-pressed',String(state.day===29));
}
function personalStatus(message=''){$('personal-status').textContent=message;$('personal-status').hidden=!message;}
function refreshFavorites(){try{favorites.load();personalStatus();return true;}catch{personalStatus('收藏暂时无法读取，原记录已保留。请检查浏览器存储后重试。');return false;}}
function updateFavoriteButton(button,c){const saved=favorites.has(c);button.setAttribute('aria-pressed',String(saved));button.setAttribute('aria-label',`${saved?'取消收藏':'收藏'} ${c.name} 的生日`);button.title=saved?'取消生日收藏':'收藏生日';button.querySelector('span').textContent=saved?'已收藏':'收藏';}
function renderFavoriteOrder(focusId){
  const expanded=new Set([...host.querySelectorAll('.character:has(details[open])')].map(el=>el.dataset.id));
  const activeId=document.activeElement?.dataset.favoriteId;
  render();
  for(const card of host.querySelectorAll('.character'))if(expanded.has(card.dataset.id))card.querySelector('details').open=true;
  const id=focusId||activeId;
  const button=id?[...host.querySelectorAll('[data-favorite-id]')].find(el=>el.dataset.favoriteId===id):null;
  if(focusId)(button||$('saved')).focus();
  else button?.focus({preventScroll:true});
}
function characterCard(c) {
  const article=text('article','','character');article.dataset.id=c.id;
  const portrait=text('div','','portrait');portrait.append(text('span',[...c.name][0]||'？'));portrait.setAttribute('aria-label',`${c.name}的头像`);
  const url=safeURL(c.image);
  if(url){const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';portrait.append(img);
    const binding=bindImageSafety(img,{urls:[url],show:urls=>{img.src=urls[0];},hide:()=>{img.removeAttribute('src');}});bindings.push(binding);
    img.onerror=()=>{img.removeAttribute('src');portrait.append(text('small','图片暂不可用'));};
  }else portrait.append(text('small','暂无图片'));
  const copy=text('div','','character-copy');
  const dateParams=new URLSearchParams({month:`${upcoming()?upcomingDays.find(d=>d.key===c.birthday)?.year||state.year:state.year}-${c.birthday.slice(0,2)}`,day:String(Number(c.birthday.slice(3)))});if(state.femaleOnly)dateParams.set('female','1');
  const date=link(`${Number(c.birthday.slice(0,2))} 月 ${Number(c.birthday.slice(3))} 日`,'#birthdays?'+dateParams,'birth-date');date.setAttribute('aria-label',`查看 ${Number(c.birthday.slice(0,2))} 月 ${Number(c.birthday.slice(3))} 日的生日角色`);
  const favorite=text('button','','birthday-favorite');favorite.type='button';favorite.dataset.favoriteId=c.id;
  favorite.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg><span></span>';
  updateFavoriteButton(favorite,c);
  favorite.onclick=e=>{
    hideFavoriteFeedback();
    try{favorites.set(c,!favorites.has(c));personalStatus();
      renderFavoriteOrder(e.detail===0?c.id:null);
      showFavoriteFeedback(favorites.has(c)?`${c.name}的生日已收藏到本机`:`已取消${c.name}的生日收藏`);
    }catch{personalStatus('收藏未能保存，请检查浏览器存储后重试。');}
  };
  const header=text('div','','character-heading');header.append(text('h3',c.name),favorite);copy.append(date,header);
  const workLink=id=>{const a=link(pack.works[id]?.title||id,`#work/${encodeURIComponent(id)}`,'work-link');a.title='在当前页面查看作品详情';return a;};
  if(c.workIds.length)copy.append(workLink(c.workIds[0]));
  const details=text('details',''),extraWorks=c.workIds.slice(1);
  details.append(text('summary',extraWorks.length?`另有 ${extraWorks.length} 部作品`:'更多资料'));
  const extra=text('div','','character-extra');
  for(const id of extraWorks)extra.append(workLink(id));
  const sources=text('div','','character-sources');
  for(const s of c.sources){const u=safeURL(s.url);if(u)sources.append(link(sourceName(s.name)+' ↗',u,'source-link'));else if(s.sourceId)sources.append(text('span',`${sourceName(s.name)} · ${s.sourceId}`,'source-link'));}
  if(sources.childElementCount)extra.append(sources);
  details.append(extra);details.hidden=!extra.childElementCount;copy.append(details);article.append(portrait,copy);return article;
}
function appendCards(selected,start,end){
  const counts=new Map();
  const visible=upcoming()?selected.filter(c=>{const n=counts.get(c.birthday)||0;counts.set(c.birthday,n+1);return n<3;}):selected.slice(start,end);
  const cards=visible.map(characterCard);
  if(!upcoming()){$('characters').append(...cards);return cards;}
  cards.forEach((card,i)=>{
    const key=visible[i].birthday;
    let group=$('characters').querySelector(`[data-birthday-group="${key}"]`);
    if(!group){
      const d=upcomingDays.find(day=>day.key===key),label=d.offset===0?'今天':d.offset===1?'明天':new Date(d.year,d.month-1,d.day).toLocaleDateString('zh-CN',{weekday:'long'});
      group=text('section','','birthday-day-group');group.dataset.birthdayGroup=key;group.classList.toggle('is-today',d.offset===0);
      const heading=text('h3','','birthday-day-heading'),params=new URLSearchParams({month:`${d.year}-${String(d.month).padStart(2,'0')}`,day:String(d.day)});if(state.femaleOnly)params.set('female','1');
      const dayLink=link('','#birthdays?'+params);dayLink.setAttribute('aria-label',`查看 ${d.month} 月 ${d.day} 日全部生日角色`);
      dayLink.append(text('span',`${d.month} 月 ${d.day} 日 · ${label}`),text('span',`查看全部 ${selected.filter(c=>c.birthday===key).length} 位 ›`,'birthday-day-total'));heading.append(dayLink);
      group.append(heading,text('div','','characters'));$('characters').append(group);
    }
    group.querySelector('.characters').append(card);
  });return cards;
}
function armMidnight(){
  clearTimeout(midnightTimer);if(!active||!upcoming())return;
  const now=new Date();midnightTimer=setTimeout(()=>{if(active&&upcoming()){state.limit=30;loadScope();}},new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now+100);
}
document.addEventListener('visibilitychange',()=>{const now=new Date();if(active&&!document.hidden&&upcoming()&&(upcomingDays[0].year!==now.getFullYear()||upcomingDays[0].key!==keyOf(now.getMonth()+1,now.getDate()))){state.limit=30;loadScope();}});
function render() {
  if(!active)return;
  const params=new URLSearchParams({month:`${state.year}-${String(state.month).padStart(2,'0')}`,day:state.day??''});if(state.query)params.set('q',state.query);if(state.femaleOnly)params.set('female','1');if(state.savedOnly)params.set('saved','1');if(state.upcoming)params.set('range','week');
  history.replaceState(history.state,'',location.pathname+location.search+'#birthdays?'+params);
  clearImages();
  const rows=filtered(), isSearch=searching(), isGlobal=allYear();if(!isGlobal)renderCalendar(rows);updateDateStamp();$('female').checked=state.femaleOnly;
  host.dataset.searching=String(isGlobal);host.querySelector('.calendar-section').hidden=isGlobal;
  $('saved').setAttribute('aria-pressed',String(!!state.savedOnly));$('browse').setAttribute('aria-pressed',String(!state.upcoming));$('upcoming').setAttribute('aria-pressed',String(!!state.upcoming));
  $('saved').querySelector('span').textContent=state.savedOnly?'★':'☆';
  host.dataset.upcoming=String(upcoming());$('characters').classList.toggle('is-grouped',upcoming());armMidnight();
  $('characters').setAttribute('aria-busy',String(loading));
  host.dataset.wholeMonth=String(isGlobal||state.day===null);
  $('clear-search').hidden=!state.query;
  const selected=selectedRows();
  host.querySelector('.sort-label').textContent=!state.savedOnly&&selected.some(c=>favorites.has(c))?'收藏优先 · Bangumi 人数 ↓':'Bangumi 人数 ↓';
  $('list-title').textContent=upcoming()?(state.savedOnly?'近日收藏':'未来七天'):state.savedOnly?'我的生日收藏':isSearch?'全年搜索':state.day===null?`${state.month} 月的生日`:`${state.month} 月 ${state.day} 日`;
  $('list-kicker').textContent=upcoming()?`${upcomingDays[0].month} 月 ${upcomingDays[0].day} 日 — ${upcomingDays[6].month} 月 ${upcomingDays[6].day} 日`:state.savedOnly?'全年 · 本机收藏':isSearch?'全年角色与作品':state.year===today.getFullYear()&&state.month===today.getMonth()+1&&state.day===today.getDate()?'今天，一起说声生日快乐':'生日角色';
  $('list-summary').textContent=loading||failure?'':`${number(selected.length)} 位${state.femaleOnly?'女性':''}角色${state.query?` · 搜索“${state.query}”`:''}`;
  $('all-month').hidden=!isGlobal&&state.day===null;$('all-month').textContent=isGlobal?'返回日历':'查看整月';
  $('characters').replaceChildren();appendCards(selected,0,state.limit);
  $('more').hidden=upcoming()||selected.length<=state.limit||loading||!!failure;
  $('more').textContent=`再看 ${Math.min(30,selected.length-state.limit)} 位 · 已显示 ${Math.min(state.limit,selected.length)} / ${selected.length}`;
  setStatus(loading?(upcoming()?'正在读取近日生日…':isGlobal?'正在读取全年生日角色…':'正在读取本月生日资料…'):failure||(!selected.length?(upcoming()?(state.savedOnly?'未来七天没有符合筛选的生日收藏。':'未来七天没有符合筛选的生日角色。'):state.savedOnly?(isSearch||state.femaleOnly?'没有符合当前筛选的生日收藏。':'还没有收藏生日，点击角色旁的星标即可收藏。'):state.femaleOnly?'没有找到符合条件的女性角色。':isSearch?'没有找到匹配的角色，试试其他名字或作品。':'当前资料中没有这一天的生日记录，可以看看整月。'):''),!!failure);
  if(!loading&&!failure&&!selected.length&&state.femaleOnly){const reset=text('button','关闭女性筛选');reset.onclick=()=>{state.femaleOnly=false;state.limit=30;render();$('female').focus();};$('status').append(reset);}
}
// 同一月份的请求共用；只有全部校验完成后才展示全年搜索结果。
async function readMonth(month) {
  if(cache.has(month))return cache.get(month);
  if(!pendingMonths.has(month))pendingMonths.set(month,(async()=>{
    const data=await readIndex(manifest.packs[String(month)]);
    const sorted={...data,characters:sortCharactersByVotes(data.characters,votes)};
    cache.set(month,sorted);return sorted;
  })().finally(()=>pendingMonths.delete(month)));
  return pendingMonths.get(month);
}
async function readYear() {
  if(yearPack)return yearPack;
  if(!pendingYear)pendingYear=(async()=>{
    const months=Array.from({length:12},(_,i)=>i+1),packs=[];
    const results=await Promise.allSettled(Array.from({length:3},async()=>{
      while(months.length){const month=months.shift();packs[month-1]=await readMonth(month);}
    }));
    const failed=results.find(result=>result.status==='rejected');if(failed)throw failed.reason;
    yearPack={characters:sortCharactersByVotes(packs.flatMap(p=>p.characters),votes),works:Object.assign({},...packs.map(p=>p.works))};
    return yearPack;
  })().finally(()=>{pendingYear=null;});
  return pendingYear;
}
async function readUpcoming(){
  upcomingDays=upcomingBirthdayDays();
  const packs=await Promise.all([...new Set(upcomingDays.map(d=>d.month))].map(readMonth));
  return {characters:sortCharactersByVotes(packs.flatMap(p=>p.characters),votes),works:Object.assign({},...packs.map(p=>p.works))};
}
async function loadScope() {
  clearTimeout(searchTimer);
  const current=++ticket, isSearch=allYear(), month=state.month;
  loading=true;failure='';pack=null;render();
  try {
    const data=await (upcoming()?readUpcoming():isSearch?readYear():readMonth(month));
    if(current!==ticket||!active)return;pack=data;loading=false;render();
  }catch(e){if(current!==ticket||!active)return;loading=false;failure=upcoming()?'近日生日资料暂时无法读取，请重试。':isSearch?'全年生日资料暂时无法读取，请重试。':'本月生日资料暂时无法读取，请重试。';render();}
}
function clearSearch(){
  composing=false;state.query='';state.limit=30;$('search').value='';loadScope();$('search').focus();
}
function searchChanged(){
  clearTimeout(searchTimer);ticket++;
  state.query=$('search').value;state.limit=30;
  if(!searching()){loadScope();return;}
  // 在防抖期间也清除上一轮结果，避免输入与结果范围不一致。
  loading=true;failure='';pack=null;render();
  searchTimer=setTimeout(()=>loadScope(),160);
}
function changeMonth(year,month) {if(!manifest||year<2000||year>2100||month<1||month>12)return;state={...state,year,month,day:null,limit:30};setCalendarCollapsed(false);loadScope();}
$('previous').onclick=()=>{const next=adjacent(state.year,state.month,-1);changeMonth(next.year,next.month);};
$('next').onclick=()=>{const next=adjacent(state.year,state.month,1);changeMonth(next.year,next.month);};
$('month').onchange=e=>changeMonth(state.year,Number(e.target.value));
$('year').onchange=e=>{const year=Number(e.target.value);if(Number.isInteger(year)&&year>=2000&&year<=2100){state.year=year;render();}else e.target.value=String(state.year);};
$('today').onclick=()=>{updateDateStamp();if(!manifest)return;state={year:today.getFullYear(),month:today.getMonth()+1,day:today.getDate(),query:'',femaleOnly:state.femaleOnly,limit:30};$('search').value='';setCalendarCollapsed(compactViewport.matches);loadScope();};
$('browse').onclick=()=>{state.upcoming=false;state.query='';$('search').value='';state.limit=30;loadScope();};
$('upcoming').onclick=()=>{state.upcoming=true;state.query='';state.limit=30;$('search').value='';loadScope();};
$('saved').onclick=()=>{refreshFavorites();state.savedOnly=!state.savedOnly;state.limit=30;loadScope();};
window.addEventListener('storage',e=>{
  if(!active||e.key!==null&&!e.key.startsWith(BIRTHDAY_FAVORITES_PREFIX))return;
  if(!refreshFavorites())return;
  renderFavoriteOrder();
});
$('female').onchange=e=>{state.femaleOnly=e.target.checked;state.limit=30;render();};
$('today-stamp').onclick=()=>$('today').click();
$('search').addEventListener('compositionstart',()=>{composing=true;clearTimeout(searchTimer);ticket++;});
$('search').addEventListener('compositionend',()=>{composing=false;searchChanged();});
$('search').oninput=e=>{if(!composing&&!e.isComposing)searchChanged();};
$('search').onkeydown=e=>{if(e.key==='Escape'&&!composing){e.preventDefault();clearSearch();}else if(e.key==='Enter'&&!composing){e.preventDefault();state.query=$('search').value;state.limit=30;loadScope();}};
$('clear-search').onclick=clearSearch;
$('calendar-toggle').onclick=()=>setCalendarCollapsed(!calendarCollapsed);
$('all-month').onclick=()=>{if(allYear()){state.savedOnly=false;state.upcoming=false;clearSearch();return;}state.day=null;state.limit=30;setCalendarCollapsed(false);render();$('search').focus();};
$('leap').onclick=()=>{state.day=29;state.limit=30;render();if(compactViewport.matches)setCalendarCollapsed(true,true);};
$('more').onclick=e=>{
  const selected=selectedRows();
  const cards=appendCards(selected,state.limit,state.limit+30);state.limit+=30;
  $('more').hidden=selected.length<=state.limit;
  $('more').textContent=`再看 ${Math.min(30,selected.length-state.limit)} 位 · 已显示 ${Math.min(state.limit,selected.length)} / ${selected.length}`;
  $('announcement').textContent=`已增加 ${cards.length} 位角色，共显示 ${Math.min(state.limit,selected.length)} 位。`;
  if(e.detail===0)cards[0]?.querySelector('a,summary')?.focus();
};
async function readIndex(desc){const bytes=await request(new URL(desc.path,dataRoot));const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==desc.bytes||sha!==desc.sha256)throw Error('版本校验失败');return JSON.parse(new TextDecoder().decode(bytes));}
async function start(){const attempt=++startup;setStartupControls(true);setStatus('正在读取生日资料…');try {const index=JSON.parse(new TextDecoder().decode(await request(new URL('manifest.json',dataRoot))));const [data,filter]=await Promise.all([readIndex(index.sortVotes),readIndex(index.femaleFilter)]);if(data.source!=='Bangumi'||filter.schemaVersion!=='galpedia-birthday-female-filter-v1'||!Array.isArray(filter.characterIds))throw Error();if(!active||attempt!==startup)return;votes=await projectBirthdayVotes(data.works);if(!active||attempt!==startup)return;femaleIds=new Set(filter.characterIds);femaleDays=filter.days;manifest=index;setStartupControls(false);updateDateStamp();await loadScope();}catch {if(!active||attempt!==startup)return;manifest=null;setStatus('生日资料暂时无法读取，请重试。',true);}}
return {
  async show(hash){clearTimeout(searchTimer);composing=false;active=true;refreshFavorites();state=parseBirthdayRoute(hash);setCalendarCollapsed(compactViewport.matches&&state.day!==null);$('search').value=state.query;$('female').checked=state.femaleOnly;updateDateStamp();if(manifest){await loadScope();}else await start();},
  suspend(){active=false;hideFavoriteFeedback();clearTimeout(midnightTimer);clearTimeout(searchTimer);composing=false;ticket++;startup++;clearImages();}
};

}

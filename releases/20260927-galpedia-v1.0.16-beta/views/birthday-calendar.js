import {keyOf, monthGrid, adjacent, matches, imagePolicy, sortCharactersByVotes, workVotes} from '../lib/birthday-calendar.js';
import {bindImageSafety} from '../lib/image-safety.js';
import {parseBirthdayRoute} from '../lib/birthday-route.js';
const dataRoot=new URL('../runtime-data/birthday-calendar-v1/',import.meta.url);
export function createBirthdayCalendar(host){
let active=false,startup=0;
const css=document.createElement('link');css.rel='stylesheet';css.href=new URL('./birthday-calendar.css',import.meta.url);document.head.append(css);
host.innerHTML=`
<div class="intro"><div><p class="eyebrow">探索 · BIRTHDAY CALENDAR</p><h1>角色生日历</h1><p>寻找与你同一天生日的角色。</p></div><button class="today-stamp" id="bc-today-stamp" aria-label="查看今天的生日角色"><span id="bc-today-month"></span><strong id="bc-today-day"></strong><span id="bc-today-count">正在读取生日资料</span></button></div>
<div class="birthday-layout"><section class="calendar-section" aria-label="角色生日月历">
<div class="calendar-toolbar"><div class="month-tools"><button id="bc-previous" aria-label="上个月">‹</button><label class="month-label"><span class="sr-only">选择年月</span><input type="month" id="bc-month" min="2000-01" max="2100-12"></label><button id="bc-next" aria-label="下个月">›</button><button id="bc-today">今天</button></div></div>
<div class="calendar-summary"><p id="bc-month-summary" class="muted" aria-live="polite">正在读取日历…</p><button id="bc-calendar-toggle" aria-expanded="true" aria-controls="bc-calendar-panel">收起月历</button></div>
<div id="bc-calendar-panel">
<div class="weekdays" aria-hidden="true"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
<div id="bc-calendar" class="calendar" aria-label="选择日期"></div>
<button id="bc-leap" hidden>2 月 29 日 · 闰日生日</button>
<p class="calendar-legend"><span class="today-dot"></span>今天 <span class="selected-dot"></span>已选日期 <span class="calendar-hint">数字下方为生日人数</span></p>
</div>
</section>
<section class="birthday-section" aria-labelledby="bc-list-title"><div class="list-heading"><div><p class="eyebrow" id="bc-list-kicker">HAPPY BIRTHDAY</p><h2 id="bc-list-title">生日角色</h2><p class="muted" id="bc-list-summary" aria-live="polite"></p></div><button id="bc-all-month">查看整月</button></div><div class="list-tools"><label class="search"><span class="sr-only">在本月搜索角色或作品</span><input type="search" id="bc-search" placeholder="搜索本月角色或作品" maxlength="100"></label><button id="bc-clear-search" hidden aria-label="清除搜索">清除</button><span class="sort-label" title="按关联作品 Bangumi 评分人数的最大值降序，不累加作品或版本">Bangumi 评分人数 ↓</span></div><div id="bc-status" role="status" hidden></div><div id="bc-characters" class="characters"></div><button id="bc-more" hidden>加载更多角色</button><span id="bc-announcement" class="sr-only" aria-live="polite"></span></section>
</div><footer><details><summary>关于这些生日资料 <span id="bc-coverage"></span></summary><p>按数据站现有角色 ID 去重；同一角色关联多部作品时只计一次。只纳入具有完整月日、且当前资料没有待处理冲突的生日。缺失、只知道月份或存在冲突的资料不会被猜测补全。“无冲突”不等于已经逐条人工核实，可在角色卡片中查看来源。</p><p>2 月 29 日保留为闰日生日，平年也可以查看，不移动到其他日期。今天按你设备的本地日期计算。图片使用数据站现有分级；未分级图片在隐藏和模糊模式下均不加载。</p></details></footer>
`;
const $ = id => host.querySelector('#bc-'+id);
let today = new Date(), state = {year: today.getFullYear(), month: today.getMonth()+1, day: today.getDate(), query: '', limit: 30};
let manifest, pack, votes = {}, loading = false, failure = '', ticket = 0;
const cache = new Map();
const compactViewport=matchMedia('(max-width:760px)');
let calendarCollapsed=false;
function setCalendarCollapsed(value, focus=false){
  calendarCollapsed=value;
  const collapsed=value&&compactViewport.matches;
  $('calendar-panel').hidden=collapsed;
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
function updateDateStamp() {today=new Date();$('today-month').textContent=`${today.getMonth()+1} 月 · 今天`;$('today-day').textContent=String(today.getDate()).padStart(2,'0');if(manifest)$('today-count').textContent=`${manifest.days[keyOf(today.getMonth()+1,today.getDate())]||0} 位角色生日`;}
function setStatus(message, retry=false) {
  const el=$('status');el.replaceChildren();el.hidden=!message;
  el.classList.toggle('is-loading',!!message&&!retry&&(loading||!manifest));
  if(message)el.append(text('span',message));
  if(retry){const b=text('button','重试');b.onclick=()=>manifest?loadMonth():start();el.append(b);}
}
async function request(url) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try {const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.arrayBuffer();}
  finally {clearTimeout(timer);}
}
function setStartupControls(disabled){for(const id of ['previous','next','month','today','today-stamp','search','all-month'])$(id).disabled=disabled;}
function filtered() {return (pack?.characters || []).filter(c=>matches(c,state.query,pack.works));}
function renderCalendar(rows) {
  const groups=new Map();for(const c of rows){if(!groups.has(c.birthday))groups.set(c.birthday,[]);groups.get(c.birthday).push(c);}
  $('month').value=`${state.year}-${String(state.month).padStart(2,'0')}`;
  $('previous').disabled=state.year===2000&&state.month===1;$('next').disabled=state.year===2100&&state.month===12;
  $('month-summary').textContent=loading?'正在读取本月角色…':failure?'本月资料暂未载入':`${state.month} 月 · ${number(rows.length)} 位${state.query?'匹配的':''}角色有生日`;
  $('month-summary').dataset.expandedText=$('month-summary').textContent;
  $('month-summary').dataset.collapsedText=!loading&&!failure&&state.day!==null?`已选 ${state.month} 月 ${state.day} 日 · ${groups.get(keyOf(state.month,state.day))?.length||0} 位角色`:$('month-summary').textContent;
  setCalendarCollapsed(calendarCollapsed);
  const days=monthGrid(state.year,state.month).filter(Boolean);
  const tabDay=days.some(c=>c.day===state.day)?state.day:1;
  const nodes=monthGrid(state.year,state.month).map(cell=>{
    if(!cell)return text('div','','blank');
    const list=groups.get(cell.key)||[], count=loading&&!state.query?(manifest?.days[cell.key]||0):list.length;
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
  const leap=state.month===2&&!monthGrid(state.year,2).some(c=>c?.day===29);
  $('leap').hidden=!leap;$('leap').textContent=`2 月 29 日 · ${groups.get('02-29')?.length||0} 位闰日生日角色（${state.year} 年无此日期）`;$('leap').setAttribute('aria-pressed',String(state.day===29));
}
function characterCard(c) {
  const article=text('article','','character');article.dataset.id=c.id;
  const portrait=text('div','','portrait');portrait.append(text('span',[...c.name][0]||'？'));portrait.setAttribute('aria-label',`${c.name}的头像`);
  const url=safeURL(c.image);
  if(url){const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';portrait.append(img);
    const binding=bindImageSafety(img,{urls:[url],show:urls=>{img.src=urls[0];},hide:()=>{img.removeAttribute('src');}});bindings.push(binding);
    img.onerror=()=>{img.removeAttribute('src');portrait.append(text('small','图片暂不可用'));};
  }else portrait.append(text('small','暂无图片'));
  const copy=text('div','','character-copy');copy.append(text('span',`${Number(c.birthday.slice(0,2))} 月 ${Number(c.birthday.slice(3))} 日`,'birth-date'),text('h3',c.name));
  const workLink=id=>{const a=link(pack.works[id]?.title||id,`#work/${encodeURIComponent(id)}`,'work-link');a.title='在当前页面查看作品详情';return a;};
  if(c.workIds.length)copy.append(workLink(c.workIds[0]));
  const details=text('details','');details.append(text('summary','资料与关联作品'));
  for(const s of c.sources){const u=safeURL(s.url);if(u)details.append(link(sourceName(s.name)+' ↗',u,'source-link'));else if(s.sourceId)details.append(text('span',`${sourceName(s.name)} · ${s.sourceId}`,'source-link'));}
  if(!c.sources.length)details.append(text('p','生日来自当前公开角色详情。','source-note'));
  const count=workVotes(c.workIds[0],votes);
  details.append(text('p',count>=0?`排序依据：关联作品中最多 ${number(count)} 人在 Bangumi 评分，不累加多部作品或版本。`:'关联作品暂无 Bangumi 评分人数，排在有评分人数的角色之后。','source-note'));
  details.append(text('p','沿用当前资料，无待处理生日冲突；未经本次逐条人工复核。','source-note'));
  for(const id of c.workIds.slice(1))details.append(workLink(id));copy.append(details);article.append(portrait,copy);return article;
}
function render() {
  if(!active)return;
  const params=new URLSearchParams({month:`${state.year}-${String(state.month).padStart(2,'0')}`,day:state.day??''});if(state.query)params.set('q',state.query);
  history.replaceState(history.state,'',location.pathname+location.search+'#birthdays?'+params);
  clearImages();
  const rows=filtered();renderCalendar(rows);
  $('characters').setAttribute('aria-busy',String(loading));
  host.dataset.wholeMonth=String(state.day===null);
  $('clear-search').hidden=!state.query;
  const selected=state.day===null?rows:rows.filter(c=>c.birthday===keyOf(state.month,state.day));
  $('list-title').textContent=state.day===null?`${state.month} 月的生日`:`${state.month} 月 ${state.day} 日`;
  $('list-kicker').textContent=state.year===today.getFullYear()&&state.month===today.getMonth()+1&&state.day===today.getDate()?'今天，一起说声生日快乐':'BIRTHDAY CHARACTERS';
  $('list-summary').textContent=loading?'':`${number(selected.length)} 位角色${state.query?` · 搜索“${state.query}”`:''}`;
  $('all-month').hidden=state.day===null;
  $('characters').replaceChildren(...selected.slice(0,state.limit).map(characterCard));
  $('more').hidden=selected.length<=state.limit||loading||!!failure;
  $('more').textContent=`再看 ${Math.min(30,selected.length-state.limit)} 位 · 已显示 ${Math.min(state.limit,selected.length)} / ${selected.length}`;
  setStatus(loading?'正在读取本月生日资料…':failure||(!selected.length?(state.query?'当前范围没有匹配的角色，试试其他名字或查看整月。':'当前资料中没有这一天的生日记录，可以看看整月。'):''),!!failure);
}
async function loadMonth() {
  const current=++ticket, month=state.month;loading=true;failure='';pack=null;render();
  try {
    let data=cache.get(month);
    if(!data){const desc=manifest.packs[String(month)];const bytes=await request(new URL(desc.path,dataRoot));
      const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==desc.bytes||sha!==desc.sha256)throw Error('版本校验失败');data=JSON.parse(new TextDecoder().decode(bytes));cache.set(month,data);}
    if(current!==ticket||!active)return;pack={...data,characters:sortCharactersByVotes(data.characters,votes)};loading=false;render();
  }catch(e){if(current!==ticket||!active)return;loading=false;failure='本月生日资料暂时无法读取，请重试。';render();}
}
function changeMonth(year,month) {if(!manifest||year<2000||year>2100||month<1||month>12)return;state={...state,year,month,day:null,limit:30};setCalendarCollapsed(false);loadMonth();}
$('previous').onclick=()=>{const next=adjacent(state.year,state.month,-1);changeMonth(next.year,next.month);};
$('next').onclick=()=>{const next=adjacent(state.year,state.month,1);changeMonth(next.year,next.month);};
$('month').onchange=e=>{const m=/^(\d{4})-(\d{2})$/.exec(e.target.value);if(m&&Number(m[1])>=2000&&Number(m[1])<=2100)changeMonth(Number(m[1]),Number(m[2]));else e.target.value=`${state.year}-${String(state.month).padStart(2,'0')}`;};
$('today').onclick=()=>{updateDateStamp();if(!manifest)return;state={year:today.getFullYear(),month:today.getMonth()+1,day:today.getDate(),query:'',limit:30};$('search').value='';setCalendarCollapsed(compactViewport.matches);loadMonth();};
$('today-stamp').onclick=()=>$('today').click();
$('search').oninput=e=>{state.query=e.target.value;state.day=null;state.limit=30;render();};
$('clear-search').onclick=()=>{state.query='';state.day=null;state.limit=30;$('search').value='';render();$('search').focus();};
$('calendar-toggle').onclick=()=>setCalendarCollapsed(!calendarCollapsed);
$('all-month').onclick=()=>{state.day=null;state.limit=30;setCalendarCollapsed(false);render();$('search').focus();};
$('leap').onclick=()=>{state.day=29;state.limit=30;render();if(compactViewport.matches)setCalendarCollapsed(true,true);};
$('more').onclick=e=>{
  const rows=filtered(),selected=state.day===null?rows:rows.filter(c=>c.birthday===keyOf(state.month,state.day));
  const cards=selected.slice(state.limit,state.limit+30).map(characterCard);
  $('characters').append(...cards);state.limit+=30;
  $('more').hidden=selected.length<=state.limit;
  $('more').textContent=`再看 ${Math.min(30,selected.length-state.limit)} 位 · 已显示 ${Math.min(state.limit,selected.length)} / ${selected.length}`;
  $('announcement').textContent=`已增加 ${cards.length} 位角色，共显示 ${Math.min(state.limit,selected.length)} 位。`;
  if(e.detail===0)cards[0]?.querySelector('a,summary')?.focus();
};
async function start(){const attempt=++startup;setStartupControls(true);setStatus('正在读取生日资料…');try {const index=JSON.parse(new TextDecoder().decode(await request(new URL('manifest.json',dataRoot))));const desc=index.sortVotes;const bytes=await request(new URL(desc.path,dataRoot));const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(bytes.byteLength!==desc.bytes||sha!==desc.sha256)throw Error();const data=JSON.parse(new TextDecoder().decode(bytes));if(data.source!=='Bangumi')throw Error();if(!active||attempt!==startup)return;votes=data.works;manifest=index;setStartupControls(false);updateDateStamp();$('coverage').textContent=`已收录完整生日 ${number(manifest.counts.datedCharacters)} / ${number(manifest.counts.totalCharacters)} 位角色`;await loadMonth();}catch {if(!active||attempt!==startup)return;manifest=null;setStatus('生日资料暂时无法读取，请重试。',true);}}
return {
  async show(hash){active=true;state=parseBirthdayRoute(hash);setCalendarCollapsed(compactViewport.matches&&state.day!==null);$('search').value=state.query;updateDateStamp();if(manifest){$('coverage').textContent=`已收录完整生日 ${number(manifest.counts.datedCharacters)} / ${number(manifest.counts.totalCharacters)} 位角色`;await loadMonth();}else await start();},
  suspend(){active=false;ticket++;startup++;clearImages();}
};

}

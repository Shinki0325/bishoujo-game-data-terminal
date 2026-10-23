import {upcomingBirthdayDays,sortCharactersByVotes} from './birthday-calendar.js';
import {projectBirthdayVotes} from './rating-consumers.js';
import {bindImageSafety} from './image-safety.js';
import {createHomeTrivia} from './home-trivia.js';
const dataRoot=new URL('../runtime-data/birthday-calendar-v1/',import.meta.url);
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
const months=new Map();let indexPending, votesPending;
const monthRoles=[
  ()=>import('./home-main-roles/01.js'),()=>import('./home-main-roles/02.js'),
  ()=>import('./home-main-roles/03.js'),()=>import('./home-main-roles/04.js'),
  ()=>import('./home-main-roles/05.js'),()=>import('./home-main-roles/06.js'),
  ()=>import('./home-main-roles/07.js'),()=>import('./home-main-roles/08.js'),
  ()=>import('./home-main-roles/09.js'),()=>import('./home-main-roles/10.js'),
  ()=>import('./home-main-roles/11.js'),()=>import('./home-main-roles/12.js'),
];
async function request(url){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{const response=await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.arrayBuffer();}
  finally{clearTimeout(timer);}
}
async function read(desc){
  if(!desc||!/^(?:0[1-9]|1[0-2])\.json$|^work-votes\.json$/.test(desc.path))throw Error('invalid birthday descriptor');
  const bytes=await request(new URL(desc.path,dataRoot));if(bytes.byteLength!==desc.bytes||await sha(bytes)!==desc.sha256)throw Error('birthday digest mismatch');
  return JSON.parse(new TextDecoder().decode(bytes));
}
function index(){return indexPending??=request(new URL('manifest.json',dataRoot)).then(bytes=>{const value=JSON.parse(new TextDecoder().decode(bytes));if(value.schemaVersion!=='galpedia-birthday-calendar-v1')throw Error('invalid birthday index');return value;}).catch(e=>{indexPending=null;throw e;});}
function votes(manifest){return votesPending??=read(manifest.sortVotes).then(data=>{if(data.source!=='Bangumi')throw Error('invalid birthday votes');return projectBirthdayVotes(data.works);}).catch(e=>{votesPending=null;throw e;});}
async function month(number,manifest){
  if(!months.has(number))months.set(number,Promise.all([read(manifest.packs[String(number)]),monthRoles[number-1]()]).then(([pack,{default:roles}])=>{
    if(roles.schema!=='galpedia-home-main-roles-v1'||roles.month!==number||roles.sourceMonthSha256!==manifest.packs[String(number)].sha256||!Array.isArray(pack.characters))throw Error('birthday roles mismatch');
    for(const c of pack.characters){if((roles.mainWorks[c.id]||[]).some(id=>!c.workIds.includes(id)))throw Error('invalid main character work');}
    return {pack,roles};
  }).catch(e=>{months.delete(number);throw e;}));
  return months.get(number);
}
export function createHomeDiscovery(home){
  const $=selector=>home.querySelector(selector),week=$('.birthday-week'),characters=$('#birthday-characters'),mainOnly=$('#main-only');
  const card=$('.birthday-home'),trivia=$('.home-trivia'),discovery=$('.home-discovery'),dayLink=$('#day-link');
  let active=false,revision=0,days=[],packs=new Map(),counts={},dayIndex=0,expanded=false,bindings=[],midnightTimer,dateKey='',loadingKey='',triviaReady=false,triviaPending;
  const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;};
  const clearImages=()=>{for(const b of bindings)b.dispose();bindings=[];};
  const collapseTop=text('button','收起 ↑','birthday-collapse-top');collapseTop.type='button';collapseTop.hidden=true;collapseTop.setAttribute('aria-controls','birthday-characters');$('.birthday-filter').append(collapseTop);
  const paths=['M4 4h6v16H4zM14 4h6v16h-6zM7 7v4M17 7v4','M4 21V5l8-3 8 3v16M2 21h20M8 8h1m6 0h1M8 12h1m6 0h1M10 21v-5h4v5','M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M17 4a4 4 0 0 1 0 8m1 3a4 4 0 0 1 4 4v2','M4 20v-7h4v7M10 20V4h4v16M16 20V9h4v11','M3 3v18h18M7 14l4-4 4 2 5-7'];
  home.querySelectorAll('.home-portals a').forEach((a,i)=>{const icon=text('span','','portal-icon');icon.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[i]}"/></svg>`;a.prepend(icon);});
  function collapse(){const top=card.getBoundingClientRect().top;paint(dayIndex);if(top<0)card.scrollIntoView({block:'start',behavior:'instant'});dayLink.focus({preventScroll:true});}
  collapseTop.onclick=collapse;dayLink.onclick=()=>expanded?collapse():paint(dayIndex,true);mainOnly.onchange=()=>paint(dayIndex);
  window.addEventListener('resize',()=>{if(active&&expanded)discovery.style.setProperty('--trivia-rest-height','0px');});
  function rows(day,onlyMain){
    const {pack,roles}=packs.get(day.month);
    return sortCharactersByVotes(pack.characters.filter(c=>c.birthday===day.key&&(!onlyMain||roles.mainWorks[c.id]?.length)).map(c=>({...c,name:roles.names[c.id]||c.name,workIds:onlyMain?roles.mainWorks[c.id]:c.workIds})),counts);
  }
  function paint(selected,all=false){
    if(!active||loadingKey||!days.length||!packs.has(days[selected]?.month))return;
    clearImages();dayIndex=selected;const day=days[selected],pack=packs.get(day.month).pack,onlyMain=mainOnly.checked;
    const selectedRows=rows(day,onlyMain),allCount=rows(day,false).length,mainCount=rows(day,true).length;
    if(all&&!expanded)discovery.style.setProperty('--trivia-rest-height',`${trivia.getBoundingClientRect().height}px`);
    expanded=all;collapseTop.hidden=!all;collapseTop.setAttribute('aria-expanded',String(all));discovery.classList.toggle('birthday-is-expanded',all);card.dataset.expanded=String(all);
    $('#selected-month').textContent=String(day.month).padStart(2,'0');$('#selected-day').textContent=String(day.day).padStart(2,'0');
    $('#birthday-count').textContent=`${allCount} 位角色在这一天过生日`;$('#birthday-mode-count').textContent=onlyMain?`${mainCount} 位主要角色`:`${allCount} 位角色`;
    $('#birthday-greeting').textContent=selected===0?'今天，一起说声生日快乐':`${day.month} 月 ${day.day} 日的生日角色`;
    week.querySelectorAll('button').forEach((b,i)=>{b.setAttribute('aria-pressed',String(i===selected));b.setAttribute('aria-label',`${days[i].month} 月 ${days[i].day} 日，${rows(days[i],onlyMain).length} 位${onlyMain?'主要':''}角色`);});
    dayLink.setAttribute('aria-expanded',String(all));dayLink.firstChild.textContent=all?'收起名单 ':`查看全部 ${selectedRows.length} 位${onlyMain?'主要':''}角色 `;dayLink.querySelector('span').textContent=all?'↑':'→';dayLink.hidden=selectedRows.length<=8;
    $('.calendar-link').href=`#birthdays?month=${day.year}-${String(day.month).padStart(2,'0')}&day=${day.day}`;
    characters.replaceChildren();if(!selectedRows.length)characters.append(text('p',onlyMain?'这一天还没有确认的主要角色生日。':'这一天暂无生日角色。','birthday-empty'));
    for(const c of(all?selectedRows:selectedRows.slice(0,8))){
      const a=text('article','','birthday-person');a.dataset.characterId=c.id;
      const picture=text('div','','birthday-picture');picture.append(text('span',[...c.name][0]||'？','picture-fallback'));
      if(c.image){try{const url=new URL(c.image);if(url.protocol==='https:'){
        const img=document.createElement('img');img.alt=c.name;img.referrerPolicy='no-referrer';img.decoding='async';img.loading='lazy';picture.append(img);
        const binding=bindImageSafety(img,{urls:[url.href],show:(urls,isCurrent)=>{if(active&&isCurrent())img.src=urls[0];},hide:()=>img.removeAttribute('src')});bindings.push(binding);
        img.onerror=()=>{binding.dispose();img.remove();picture.classList.add('image-unavailable');};
      }}catch{picture.classList.add('image-unavailable');}}
      const work=text('a',pack.works[c.workIds[0]]?.title||'查看作品');work.href='#work/'+encodeURIComponent(c.workIds[0]);work.title=work.textContent+' · 查看作品详情';
      const info=text('div','','birthday-person-info');info.append(text('h3',c.name),work);a.append(picture,info);characters.append(a);
    }
  }
  function error(message){clearImages();characters.replaceChildren(text('p',message,'birthday-empty'));const retry=text('button','重新载入','birthday-retry');retry.type='button';retry.onclick=()=>{dateKey='';void show();};characters.append(retry);}
  async function loadDates(){
    const current=++revision,now=new Date();days=upcomingBirthdayDays(now);loadingKey=`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    $('#home-discovery-date').textContent=now.toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric'});
    characters.replaceChildren(text('p','正在读取近日生日…','birthday-empty'));dayLink.hidden=true;collapseTop.hidden=true;week.replaceChildren();
    try{
      const manifest=await index(),values=await Promise.all([votes(manifest),...new Set(days.map(d=>d.month))].map((n,i)=>i===0?n:month(n,manifest)));
      if(!active||current!==revision)return;counts=values[0];packs=new Map([...new Set(days.map(d=>d.month))].map((n,i)=>[n,values[i+1]]));
      const weekdays=['日','一','二','三','四','五','六'];
      for(const [i,d]of days.entries()){const button=text('button','');button.type='button';button.append(text('span',i===0?'今天':'周'+weekdays[new Date(d.year,d.month-1,d.day).getDay()]),text('strong',d.day),text('i',''));button.lastChild.setAttribute('aria-hidden','true');button.onclick=()=>paint(i);week.append(button);}
      dateKey=loadingKey;loadingKey='';paint(0);
    }catch{if(active&&current===revision){dateKey='';loadingKey='';error('近日生日资料暂时无法读取，请重试。');}}
  }
  async function loadTrivia(){
    if(triviaReady)return;
    triviaPending??=import('./home-trivia-data.js').then(({default:entries})=>{createHomeTrivia(trivia,entries);triviaReady=true;}).catch(()=>{triviaPending=null;$('.trivia-copy').textContent='冷知识暂时无法读取，请再试一次。';$('.trivia-next').onclick=()=>void loadTrivia();});
    await triviaPending;
  }
  function schedule(){clearTimeout(midnightTimer);const now=new Date();midnightTimer=setTimeout(()=>void show(),new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now+50);}
  async function show(){
    if(home.hidden)return;active=true;const now=new Date(),key=`${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    void loadTrivia();if(dateKey!==key){if(loadingKey!==key)await loadDates();}else paint(dayIndex,expanded);if(active)schedule();
  }
  function suspend(){active=false;revision++;clearTimeout(midnightTimer);clearImages();if(loadingKey){loadingKey='';dateKey='';}}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!home.hidden)void show();});
  return {show,suspend};
}

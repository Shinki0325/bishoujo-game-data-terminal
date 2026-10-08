const platforms={egs:'EGS',vndb:'VNDB',bangumi:'Bangumi'},platformOrder=['egs','vndb','bangumi'];
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayName=w=>w.displayTitle||w.title;
const number=value=>Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2});
const awardId=(board,entry)=>`${board.rankingScope==='all-time'?'all-time':board.year}:${board.platform}:${entry.workId}`;

const boardName=b=>b.rankingScope==='all-time'?'历代作品榜':`${b.year} 年发售作品榜`;
// 展示只按已确认主作品ID归组；平台名次保持独立。
export function groupWorkHonors(data,companyId,threshold=100,year='all',scope='all'){
 const groups=new Map();
 for(const board of data.boards){
  if(board.minimumVotes!==threshold||(scope!=='all'&&board.rankingScope!==scope))continue;
  for(const entry of board.entries){
   if(!entry.tier||!entry.companyIds.includes(String(companyId))||(year!=='all'&&data.works[entry.workId].year!==Number(year)))continue;
   if(!groups.has(entry.workId))groups.set(entry.workId,{work:data.works[entry.workId],awards:[],bestTier:entry.tier,bestAllTimeTier:Infinity});
   const group=groups.get(entry.workId);group.bestTier=Math.min(group.bestTier,entry.tier);if(board.rankingScope==='all-time')group.bestAllTimeTier=Math.min(group.bestAllTimeTier,entry.tier);group.awards.push({...entry,id:awardId(board,entry),board});
  }
 }
 for(const group of groups.values())group.awards.sort((a,b)=>platformOrder.indexOf(a.board.platform)-platformOrder.indexOf(b.board.platform));
 return [...groups.values()].sort((a,b)=>(a.bestAllTimeTier-b.bestAllTimeTier)||a.bestTier-b.bestTier||b.work.year-a.work.year||a.work.workId.localeCompare(b.work.workId));
}

function medal(rank){
 const top=rank<=10?10:rank<=20?20:rank<=50?50:100;
 const wreath='<path d="M12 27C3 24 2 13 8 6M20 27c9-3 10-14 4-21"/><path d="M7 9 3 8l2 5m0 2-3 1 4 4m1 1-2 3 5 2m15-17 4-1-2 5m0 2 3 1-4 4m-1 1 2 3-5 2"/>';
 const seal='<circle cx="16" cy="14" r="10"/><path d="m9 22-2 8 9-4 9 4-2-8"/>';
 const bookmark='<path d="M7 3h18v25l-9-4-9 4Z"/>';
 return `<svg class="hw-medal" viewBox="0 0 32 34" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${rank===1?wreath:rank<=3?seal:bookmark}</g><text class="${rank>=100?'hw-rank-three':''}" x="16" y="${rank===1?21:18}" text-anchor="middle">${rank}</text>${rank>3?`<text class="hw-top-ten" x="16" y="33" text-anchor="middle">TOP ${top}</text>`:''}</svg>`;
}
function splitTitle(title){
 const match=String(title).match(/^(.*?)《(PREMIUM EDITION)》$/i);
 return match?{main:match[1],version:match[2]}:{main:title,version:''};
}

export function mountHonors(host,data,company){
 if(!document.getElementById('company-work-honors-style')){const link=document.createElement('link');link.id='company-work-honors-style';link.rel='stylesheet';link.href=new URL('./honors.css',import.meta.url).href;document.head.append(link);}
 host.innerHTML=`<section id="company-work-honors" aria-labelledby="hw-title">
  <header class="hw-header"><div class="hw-heading"><h2 id="hw-title">高分代表作</h2><span class="hw-mode">试算</span></div><div class="hw-tools"><label class="hw-year"><span class="hw-sr">发售作品所属年度</span><select data-choice="year" aria-label="发售作品所属年度"></select></label><button type="button" class="hw-info-button" aria-expanded="false" aria-controls="hw-info">说明</button></div></header>
  <div class="hw-scope" role="group" aria-label="荣誉范围"><button type="button" data-scope="all" aria-pressed="true">全部</button><button type="button" data-scope="all-time" aria-pressed="false">历代前 100</button><button type="button" data-scope="annual" aria-pressed="false">年度前 10</button></div>
  <div class="hw-summary"><span class="hw-count" aria-live="polite"></span><button type="button" class="hw-reset" hidden>恢复默认口径</button></div>
  <div class="hw-works" aria-label="高分作品陈列"></div><p class="hw-empty" hidden></p><button type="button" class="hw-more" aria-expanded="false" hidden></button>
  <p class="hw-foot">按本站收录作品评分生成，非平台官方奖项。</p>
  <section id="hw-info" class="hw-info" aria-label="荣誉说明" hidden>
   <h3>参评口径</h3><p>按主作品去重、归属首发年份，按当前制作或发行关系筛选陈列作品，作品名次不随筛选改变；三平台分别用原分排名，不计算综合分。每作在同一平台的同一榜内仅保留最高荣誉档位，先按评分从高到低，同分时评分人数多者在前；评分和人数均相同才并列。</p>
   <p>年度榜在各首发年内排名，收录前 10；历代榜把各首发年合在一起排名，收录前 100。只在本站收录范围参评，不是平台全站榜。年份筛选只筛作品，不重排历代名次。默认先展示有历代荣誉的作品，再按荣誉档位和首发年排序。</p>
   <p>高分入榜每作至少 100 人评分（画像的描述统计使用 10 人门槛）；观察期满 60 天，每榜至少 10 部有效作品才发徽章。统计截止 ${escapeHtml(data.contract.asOf)}；年度只评截至 ${escapeHtml(data.contract.annualLastYear)} 年的作品，之后年度暂不评选。资料身份、年份或观测日不足的记录暂缓。</p>
   <p>这些名次属于作品，按当前参与范围筛选，不是会社获奖或制作能力评分；发行关系可能晚于作品首发。历史年份使用现有评分回算，不代表当年评分。各平台评分观测日可能不同，各项实际观测日见徽章详情。</p>

  </section>
  <dialog class="hw-dialog" aria-labelledby="hw-dialog-title"><div class="hw-dialog-heading"><h3 id="hw-dialog-title">荣誉依据</h3><button type="button" class="hw-close" aria-label="关闭荣誉依据">×</button></div><div class="hw-detail"></div><button type="button" class="hw-board-toggle" aria-expanded="false" aria-controls="hw-board">查看对应年度榜单</button><section id="hw-board" hidden></section></dialog>
 </section>`;
 const root=host.querySelector('#company-work-honors'),state={year:'all',scope:'all',threshold:100,expanded:false},dialog=root.querySelector('dialog');
 let selected=null;
 const selectYear=root.querySelector('[data-choice="year"]');
 function syncYears(){const years=data.years.map(row=>row.year);if(state.scope!=='annual'&&Object.values(data.works).some(w=>w.year===2026))years.push(2026);if(state.year!=='all'&&!years.includes(Number(state.year)))state.year='all';selectYear.replaceChildren(new Option('全部发售年','all'),...years.sort((a,b)=>b-a).map(year=>new Option(String(year),String(year))));selectYear.value=state.year;}

 const groups=()=>groupWorkHonors(data,company.companyId,state.threshold,state.year,state.scope);
 function render(){
  syncYears();
  const all=groups(),shown=state.expanded?all:all.slice(0,4),custom=state.threshold!==100,total=all.reduce((sum,g)=>sum+g.awards.length,0);
  root.querySelectorAll('[data-scope]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.scope===state.scope)));
  root.querySelector('.hw-mode').textContent=custom?'自定义试算':'试算';root.querySelector('.hw-mode').dataset.custom=String(custom);
  root.querySelector('.hw-count').textContent=`${all.length} 部作品 · ${total} 项入榜记录${custom?` · ${state.threshold} 人门槛`:''}`;root.querySelector('.hw-reset').hidden=!custom;
  root.querySelector('.hw-works').innerHTML=shown.map(({work:w,awards})=>{
   const title=splitTitle(displayName(w)),p=w.presentation,href=escapeHtml(p.workUrl);title.version ||= splitTitle(w.title).version;
   return `<article class="hw-work" data-work="${escapeHtml(w.workId)}"><a class="hw-cover" href="${href}" aria-label="查看作品：${escapeHtml(displayName(w))}"><span class="hw-cover-fallback" ${p.coverUrl?'hidden':''} aria-hidden="true">暂无<br>封面</span>${p.coverUrl?`<img data-company-safety-url="${escapeHtml(p.coverUrl)}" alt="" loading="lazy" decoding="async">`:''}</a><div class="hw-work-body"><a class="hw-work-title" href="${href}" title="${escapeHtml(displayName(w))}">${escapeHtml(title.main)}</a><div class="hw-work-meta">${w.year} · 发售${title.version?' · '+escapeHtml(title.version):''}</div><div class="hw-awards">${['all-time','annual'].filter(scope=>awards.some(h=>h.board.rankingScope===scope)).map(scope=>`<div class="hw-award-row"><span class="hw-award-scope">${scope==='all-time'?'历代':'年度'}</span><div class="hw-award-items">${awards.filter(h=>h.board.rankingScope===scope).map(h=>`<button type="button" class="hw-award" data-award="${escapeHtml(h.id)}" data-tier="${h.tier}" data-tone="${h.rank<=3?h.rank:'rest'}" aria-haspopup="dialog" aria-label="${escapeHtml(`${displayName(w)}，${boardName(h.board)}，${platforms[h.board.platform]}，${h.tied?'并列':''}第${h.rank}名，候选${h.board.year===2026?'，年内暂列':''}${custom?'，自定义试算':''}`)}">${medal(h.rank)}<span><strong>${platforms[h.board.platform]}</strong><span class="hw-rank">${h.tied?'并列第':'第'} ${h.rank}</span></span></button>`).join('')}</div></div>`).join('')}</div></div></article>`;
  }).join('');
  for(const img of root.querySelectorAll('.hw-cover img'))img.addEventListener('error',()=>{img.hidden=true;img.previousElementSibling.hidden=false;},{once:true});
  const more=root.querySelector('.hw-more');more.hidden=all.length<=4;more.textContent=state.expanded?'收起作品 ▴':`展开其余 ${Math.max(0,all.length-4)} 部作品 ▾`;more.setAttribute('aria-expanded',String(state.expanded));
  root.querySelector('.hw-empty').hidden=all.length>0;root.querySelector('.hw-empty').textContent='当前范围与年份暂无入榜作品。具体条件可查看“说明”。';
 }
 function showAward(id){
  const group=groups().find(g=>g.awards.some(h=>h.id===id));if(!group)return;
  selected=group.awards.find(h=>h.id===id);const h=selected,b=h.board,w=group.work,r=w.ratings[b.platform],source=b.platform==='bangumi'&&/^\d+$/.test(r.sourceId)?`https://bgm.tv/subject/${r.sourceId}`:null;
  root.querySelector('.hw-detail').innerHTML=`<p class="hw-detail-eyebrow">${boardName(b)} · ${platforms[b.platform]}</p><div class="hw-detail-rank">${h.tied?'并列第':'第'} ${h.rank} 名</div><p class="hw-detail-work">${escapeHtml(displayName(w))}</p><span class="hw-detail-status">${b.rankingScope==='all-time'?'历代前 100':'年度前 10'} · 候选${state.threshold!==100?' · 自定义试算':''}${b.year===2026?' · 年内暂列':''}</span><dl>${[['统计范围',b.rankingScope==='all-time'?'1981—2026 已收录单作':`${b.year} 年首发作品`],['统计月末',data.contract.asOf],['平台原分',`${number(r.score)} / ${b.platform==='bangumi'?10:100}`],['评分人数',number(r.votes)],['参评作品数',number(b.eligibleWorks)],['来源条目',r.sourceId?`${platforms[b.platform]} ${r.sourceId}`:'未记录'],['评分观测',r.observedOn],['人数门槛',`${b.minimumVotes} 人`],['作品首发',w.firstDate],['原始题名',w.title]].map(([k,v])=>`<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl><p class="hw-detail-note">先按原分排序，同分时评分人数多者在前。${b.platform==='egs'?'EGS 作品中位数':b.platform==='vndb'?'VNDB 平台贝叶斯评分':'Bangumi 平台评分'}。${b.rankingScope==='all-time'?'当前评分跨年代合排，非平台全站历代排名或官方奖项。':'按现有评分回算，非当年颁发的官方奖项。'}${h.tied?`评分和人数均相同的 ${h.tieCount} 部作品，保留并列名次。`:''}${b.heldAtOrAboveLeader.length?'本榜仍有可能影响榜首的记录待核。':''}</p>${/^https?:\/\//.test(source)?`<a class="hw-source" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">查看平台作品条目 ↗</a>`:''}`;
  root.querySelector('#hw-board').hidden=true;root.querySelector('#hw-board').replaceChildren();root.querySelector('.hw-board-toggle').textContent=b.rankingScope==='all-time'?'查看对应历代榜单':'查看对应年度榜单';root.querySelector('.hw-board-toggle').setAttribute('aria-expanded','false');
  if(!dialog.open)dialog.showModal();
 }
 root.querySelector('.hw-works').addEventListener('click',event=>{const button=event.target.closest('[data-award]');if(button)showAward(button.dataset.award);});
 root.querySelector('.hw-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
 let boardLimit=50;
 function renderBoard(){
  const panel=root.querySelector('#hw-board'),b=selected.board,entries=b.entries.slice(0,boardLimit);
  panel.innerHTML=`<h4>${boardName(b)} · ${platforms[b.platform]}</h4><p>${b.eligibleWorks} 部参评 · 至少 ${b.minimumVotes} 人评分${b.heldWorks?` · ${b.heldWorks} 部记录暂缓`:''} · 已显示 ${entries.length} 部</p><table><caption class="hw-sr">本站收录范围的${boardName(b)}，${platforms[b.platform]}候选榜</caption><thead><tr><th>名次</th><th>作品</th><th>原分</th><th>人数</th></tr></thead><tbody>${entries.map(e=>`<tr data-selected="${e.workId===selected.workId}"><td>${e.tied?'并列 ':''}${e.rank}</td><td>${escapeHtml(displayName(e))}</td><td>${number(e.score)}</td><td>${number(e.votes)}</td></tr>`).join('')}</tbody></table>${entries.length<b.entries.length?'<button type="button" class="hw-board-more">再看 50 部</button>':''}`;
 }
 root.querySelector('#hw-board').addEventListener('click',event=>{if(event.target.closest('.hw-board-more')){boardLimit+=50;renderBoard();}});
 root.querySelector('.hw-board-toggle').addEventListener('click',()=>{
  if(!selected)return;const panel=root.querySelector('#hw-board'),b=selected.board,open=panel.hidden;panel.hidden=!open;root.querySelector('.hw-board-toggle').setAttribute('aria-expanded',String(open));root.querySelector('.hw-board-toggle').textContent=open?'收起榜单':b.rankingScope==='all-time'?'查看对应历代榜单':'查看对应年度榜单';
  if(open){boardLimit=50;renderBoard();}
 });
 root.querySelector('.hw-scope').addEventListener('click',event=>{const button=event.target.closest('[data-scope]');if(button){state.scope=button.dataset.scope;state.expanded=false;render();}});
 root.querySelector('.hw-more').addEventListener('click',()=>{state.expanded=!state.expanded;render();});
 root.querySelector('.hw-info-button').addEventListener('click',()=>{const info=root.querySelector('#hw-info');info.hidden=!info.hidden;root.querySelector('.hw-info-button').setAttribute('aria-expanded',String(!info.hidden));});
 selectYear.addEventListener('change',()=>{state.year=selectYear.value;state.expanded=false;render();});

 root.querySelector('.hw-reset').addEventListener('click',()=>{state.threshold=100;state.expanded=false;render();});
 render();
 return()=>{if(dialog.open)dialog.close();root.remove();};
}

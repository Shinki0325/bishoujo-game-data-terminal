export function renderLinkedText(element, text, links) {
  const sorted = [...links].filter(link => link.text && ['work','person','company'].includes(link.kind)).sort((a,b) => b.text.length-a.text.length);
  const out=document.createDocumentFragment(); let offset=0;
  while(offset<text.length){
    let found=null;
    for(const link of sorted){const at=text.indexOf(link.text,offset);if(at>=0&&(!found||at<found.at))found={at,link};}
    if(!found){out.append(document.createTextNode(text.slice(offset)));break;}
    out.append(document.createTextNode(text.slice(offset,found.at)));
    const a=document.createElement('a');a.className='trivia-entity';a.dataset.entityKind=found.link.kind;a.dataset.entityId=found.link.id;
    a.href='#'+{work:'work',person:'persons/person',company:'companies/company'}[found.link.kind]+'/'+encodeURIComponent(found.link.id);
    a.textContent=found.link.text;a.title='查看'+{work:'作品',person:'人物',company:'会社'}[found.link.kind]+'详情';out.append(a);offset=found.at+found.link.text.length;
  }
  element.replaceChildren(out);
}
export function createHomeTrivia(card,entries){
  const copy=card.querySelector('.trivia-copy'),sources=card.querySelector('.trivia-sources'),list=sources.querySelector('ol');
  const requested=Number(new URLSearchParams(location.search).get('entry'));
  let current=entries.findIndex(e=>e.number===requested),queue=[];
  if(current<0)current=Math.floor(Math.random()*entries.length);
  const shuffle=ids=>{for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;};
  function paint(animate=false){
    const e=entries[current];card.dataset.entry=e.number;
    renderLinkedText(copy,e.text,e.links||[]);renderLinkedText(card.querySelector('.trivia-entry-title'),e.title,e.links||[]);
    sources.open=false;sources.querySelector('.trivia-source-count').textContent=e.sources.length;list.replaceChildren();
    for(const [i,value]of e.sources.entries()){
      const url=new URL(value);if(!['http:','https:'].includes(url.protocol))continue;
      const li=document.createElement('li'),a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';
      a.textContent=url.hostname.replace(/^www\./,'');a.setAttribute('aria-label',`来源 ${i+1}：${url.hostname}（新窗口打开）`);li.append(a);list.append(li);
    }
    if(animate){const content=card.querySelector('.trivia-content');content.classList.remove('is-entering');void content.offsetWidth;content.classList.add('is-entering');}
  }
  queue=shuffle(entries.map((_,i)=>i).filter(i=>i!==current));paint();
  card.querySelector('.trivia-next').onclick=()=>{if(!queue.length)queue=shuffle(entries.map((_,i)=>i));if(queue[0]===current&&queue.length>1)[queue[0],queue[1]]=[queue[1],queue[0]];current=queue.shift();paint(true);};
}

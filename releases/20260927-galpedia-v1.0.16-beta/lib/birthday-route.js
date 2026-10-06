export const isBirthdayRoute = (hash = location.hash) => /^#birthdays(?:\?|$)/u.test(hash);
export function birthdayKey(value) {
  let s=String(value??'').trim();if(/^\d{1,4}$/.test(s))s=s.padStart(4,'0');
  const m=/^(\d{2})(\d{2})$/.exec(s)||/^(\d{1,2})月(\d{1,2})日$/.exec(s)||/^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if(!m)return null;const month=Number(m[1]),day=Number(m[2]),date=new Date(Date.UTC(2000,month-1,day));
  return date.getUTCMonth()+1===month&&date.getUTCDate()===day?`${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:null;
}
export function parseBirthdayRoute(hash, today=new Date()) {
  const p=new URLSearchParams(hash.split('?')[1]||''),m=/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.exec(p.get('month')||'');
  const year=m?Number(m[1]):today.getFullYear(),month=m?Number(m[2]):today.getMonth()+1;
  const day=p.has('day')?Number(p.get('day')):m?null:today.getDate();
  return {year,month,day:Number.isInteger(day)&&birthdayKey(`${month}-${day}`)?day:null,query:(p.get('q')||'').slice(0,100),limit:30};
}
let host,view,pending,version=0;
function container(){if(!host){host=document.createElement('main');host.id='birthday-view';host.className='birthday-view';host.hidden=true;document.querySelector('#workspace').before(host);}return host;}
export function hideBirthdayRoute(){version++;if(host){host.hidden=true;host.inert=true;}view?.suspend();}
export async function showBirthdayRoute(){
  const epoch=++version,hash=location.hash,el=container();el.hidden=false;el.inert=false;
  if(!view){
    el.textContent='正在打开生日历…';el.setAttribute('aria-busy','true');
    try{pending??=import('../views/birthday-calendar.js').catch(e=>{pending=null;throw e;});const module=await pending;
      if(epoch!==version||!isBirthdayRoute())return;
      view=module.createBirthdayCalendar(el);
    }catch{if(epoch!==version)return;el.replaceChildren(document.createTextNode('生日历暂时无法打开。'));const b=document.createElement('button');b.textContent='重试';b.onclick=()=>location.reload();el.append(b);el.removeAttribute('aria-busy');return;}
  }
  if(epoch===version){el.removeAttribute('aria-busy');await view.show(hash);}
}

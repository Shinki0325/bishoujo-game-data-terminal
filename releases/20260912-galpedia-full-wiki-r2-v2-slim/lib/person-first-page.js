import {PERSON_FIRST_PAGE} from './person-first-page-config.js';
import {PERSON_DIRECTORY_INDEX} from './full-wiki-person-directory-index-config.js';
import {FULL_WIKI_RUNTIME} from './full-wiki-runtime-config.js';
import {isLocalPreviewOrigin} from './detail-view-stats.js';
import {createStaticSiteDataClient} from './page-data-client.js';

export function canShowPersonFirstPage(locationRef) {
  if(locationRef.hash!=='#persons')return false;
  const parameters=new URLSearchParams(locationRef.search??'');
  return [...parameters].every(([key,value])=>['startupMetrics','interactionMetrics','workerWorkbench'].includes(key)
    || (key==='localMedia'&&value==='1'&&isLocalPreviewOrigin(locationRef.origin)));
}
export async function loadPersonFirstPage({config=PERSON_FIRST_PAGE,indexConfig=PERSON_DIRECTORY_INDEX,runtimeConfig=FULL_WIKI_RUNTIME,fetchImpl=fetch,cryptoRef=crypto}={}) {
  if(!indexConfig.enabled||!runtimeConfig.enabled||config.sourceIndexSha256!==indexConfig.sha256
    ||config.sourceManifestSha256!==runtimeConfig.sha256||config.sourceManifestSha256!==indexConfig.sourceManifestSha256
    ||config.directoryManifestSha256!==indexConfig.directoryManifestSha256)throw Error('人物首屏来源版本不匹配');
  if(config.schema!=='terminal-wiki-person-first-page-v1'||!/^\.\.\/runtime-data\/person-first-page-v1\/person-first-page\.[a-f0-9]{16}\.json$/u.test(config.url)
    ||!/^[a-f0-9]{64}$/u.test(config.sha256)||!Number.isSafeInteger(config.bytes)||config.bytes<1||config.bytes>100000)throw Error('人物首屏配置无效');
  const response=await fetchImpl(new URL(config.url,import.meta.url));if(!response.ok)throw Error('人物首屏暂不可用');
  const bytes=await response.arrayBuffer();
  const sha=Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==config.bytes||sha!==config.sha256)throw Error('人物首屏校验失败');
  const value=JSON.parse(new TextDecoder().decode(bytes));
  if(value.schema!==config.schema||value.sourceIndexSha256!==config.sourceIndexSha256||value.sourceManifestSha256!==config.sourceManifestSha256
    ||value.directoryManifestSha256!==config.directoryManifestSha256||value.totalCount!==config.totalCount
    ||!Array.isArray(value.rows)||value.rows.length!==Math.min(48,value.totalCount)
    ||new Set(value.rows.map(row=>row.entityId)).size!==value.rows.length
    ||value.rows.some(row=>!/^per_[A-Za-z0-9]+$/u.test(row.entityId)||typeof row.displayName!=='string'||!row.displayName.trim()
      ||!Number.isSafeInteger(row.workCount)||row.workCount<0||!Number.isSafeInteger(row.nameVariantCount)||row.nameVariantCount<0||typeof row.roleLabel!=='string'))throw Error('人物首屏内容无效');
  return value;
}
export function createPersonFirstPage({documentRef=document,locationRef=location,isReady,navigate,onVisible,staticDataClient=createStaticSiteDataClient()}) {
  const windowRef=documentRef.defaultView;
  let disposed=false,preview=null,style=null,pending=null,generation=0,held=[];
  const node=(tag,cls,text='')=>{const el=documentRef.createElement(tag);el.className=cls;el.textContent=text;return el;};
  function remove(){
    generation++;
    const focused=preview?.contains(documentRef.activeElement)?documentRef.activeElement.closest('[data-person-id]')?.dataset.personId:null;
    preview?.remove();style?.remove();preview=null;style=null;
    for(const [el,inert] of held)el.inert=inert;held=[];
    delete documentRef.documentElement.dataset.personPreview;
    if(focused&&locationRef.hash==='#persons'&&isReady())documentRef.querySelector(`#person-directory-list [data-person-id="${focused}"]`)?.focus({preventScroll:true});
  }
  const changed=()=>{if(!canShowPersonFirstPage(locationRef))remove();};
  windowRef.addEventListener('hashchange',changed);
  async function show(){
    if(disposed||isReady()||preview||!canShowPersonFirstPage(locationRef))return;
    if(pending)return pending;
    const token=++generation;
    pending=staticDataClient.getBrowsePage('personsDefault',1).then(page=>({
      totalCount: page.totalCount ?? page.records?.length ?? 0,
      rows: (page.records ?? []).map(person => ({
        entityId: person.route_id ?? person.id,
        displayName: person.display_name ?? person.name ?? person.id,
        workCount: person.workCount ?? 0,
        nameVariantCount: person.nameVariantCount ?? 0,
        roleLabel: person.roleLabel ?? '人物资料'
      }))
    })).then(value=>{
      if(disposed||isReady()||token!==generation||!canShowPersonFirstPage(locationRef))return;
      const list=documentRef.querySelector('#person-directory-list');if(!list)return;
      preview=node('section','person-first-page');preview.id='person-first-page';
      preview.setAttribute('aria-label','人物目录首屏');
      const note=node('p','person-directory-loading',`共 ${value.totalCount.toLocaleString('zh-CN')} 位人物，已显示前 48 位。正在准备搜索、筛选和详细资料…`);note.setAttribute('role','status');
      const rows=node('div','person-directory-list');rows.id='person-first-page-list';
      for(const person of value.rows){
        const row=node('button','person-directory-row');row.type='button';row.dataset.personId=person.entityId;row.setAttribute('aria-label',`查看人物 ${person.displayName}`);
        const faces=node('span','person-directory-faces');faces.dataset.representativeState='loading';faces.setAttribute('aria-label','代表角色或作品正在加载');
        const cell=node('span','person-directory-person'),name=node('strong','person-directory-name',person.displayName);name.title=person.displayName;
        const metrics=`作品 ${person.workCount} · 名义 ${person.nameVariantCount}`;
        cell.append(name,node('span','person-directory-sub',metrics));
        row.append(faces,cell,node('span','person-directory-metrics',metrics),node('span','person-directory-role',person.roleLabel),node('span','person-directory-activity'),node('span','person-directory-span','资料加载中…'));
        row.addEventListener('click',()=>navigate(`#persons/person/${encodeURIComponent(person.entityId)}`));rows.append(row);
      }
      preview.append(note,rows);list.before(preview);
      style=documentRef.createElement('style');style.textContent='[data-person-preview="true"] #person-directory-list,[data-person-preview="true"] #person-directory-loading,[data-person-preview="true"] #person-result-summary,[data-person-preview="true"] #person-directory-pagination{display:none!important}[data-person-preview="true"] #person-view input,[data-person-preview="true"] #person-view [data-person-role]{opacity:.55}';documentRef.head.append(style);
      for(const el of documentRef.querySelectorAll('#person-view input,#person-view select,#person-view [data-person-role],#person-page-previous,#person-page-next')){held.push([el,el.inert]);el.inert=true;}
      documentRef.documentElement.dataset.personPreview='true';onVisible?.();
    }).catch(()=>{}).finally(()=>{pending=null;});
    return pending;
  }
  return {show,dispose(){disposed=true;remove();windowRef.removeEventListener('hashchange',changed);}};
}

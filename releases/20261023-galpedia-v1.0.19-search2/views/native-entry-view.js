import { creditVoiceState } from '../lib/credit-voice-state.js';
import { nativeEntryHref } from '../lib/native-entry-route.js';
import { creditScopeClient } from '../lib/credit-scope-client.js';
import { CREDIT_ROLE_LABELS } from '../lib/credit-role-labels.js';
import { creditResponsibilityText } from '../lib/credit-responsibility.js';

// A source work is a normal entry without a fabricated edition, score or cover.
export async function openNativeEntry(id,{documentRef=globalThis.document,client=creditScopeClient,onClose=null,stillCurrent=()=>true}={}) {
  const origin=documentRef.activeElement;
  let dialog=documentRef.querySelector('dialog[data-native-entry]');
  if(dialog){dialog.close();dialog.remove();}
  dialog=documentRef.createElement('dialog');dialog.dataset.nativeEntry=id;
  Object.assign(dialog.style,{width:'min(780px, calc(100vw - 32px))',maxHeight:'85vh',boxSizing:'border-box',padding:'24px',border:'1px solid var(--border, #c9c5d5)',borderRadius:'12px',color:'var(--text, #283040)',background:'var(--surface, #fff)',overflow:'auto'});
  const node=(tag,text)=>{const el=documentRef.createElement(tag);if(text)el.textContent=text;if(tag==='a')Object.assign(el.style,{color:'var(--accent, #675094)',textDecoration:'none',borderBottom:'1px solid currentColor'});return el;};
  const header=node('div');Object.assign(header.style,{display:'flex',alignItems:'start',justifyContent:'space-between',gap:'16px'});
  const title=node('h2','正在加载…');title.id='native-entry-title';title.style.margin='0 0 18px';dialog.setAttribute('aria-labelledby',title.id);
  const close=node('button','关闭');close.type='button';Object.assign(close.style,{minHeight:'44px',minWidth:'56px',flexShrink:'0'});close.addEventListener('click',()=>dialog.close());header.append(title,close);dialog.append(header);
  dialog.addEventListener('close',()=>{dialog.remove();if(origin?.isConnected)origin.focus();onClose?.();},{once:true});
  documentRef.body.append(dialog);dialog.showModal();dialog.setAttribute('aria-busy','true');
  try {
    const entry=await client.nativeEntry(id);if(!entry)throw Error('entry unavailable');if(!dialog.isConnected||!stillCurrent()){dialog.close();return;}
    title.textContent=entry.title||entry.name;
    if(entry.originalTitle&&entry.originalTitle!==entry.title)dialog.append(node('p',entry.originalTitle));
    if(entry.releaseDate)dialog.append(node('p',entry.releaseDate));
    if(entry.collectionTitle)dialog.append(node('p','收录于 '+entry.collectionTitle));
    const organization=entry.entityKind==='organization';
    if(organization&&/^(?:[1-9][0-9]*|vndb:p[1-9][0-9]*)$/.test(entry.companyId??'')){
      const profile=node('a','会社档案');profile.href='#companies/company/'+entry.companyId;
      dialog.append(profile);
    }
    dialog.append(node('h3',organization?'参与作品':'制作与演出'));
    const list=node('dl');Object.assign(list.style,{margin:'0',overflowWrap:'anywhere'});
    const groups=new Map();
    for(const f of entry.credits??[]){
      const key=organization?(f.entryWorkId||f.sourceWorkIdentity||f.presentationWorkId||f.relationId):(f.personId||f.organizationId||f.sourcePersonId||(f.bangumiPersonId?'bangumi:person:'+f.bangumiPersonId:null)||f.creditedName||f.name||f.relationId);
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);
    }
    for(const facts of groups.values()) {
      const f=facts[0],row=node('div');Object.assign(row.style,{padding:'12px 0',borderTop:'1px solid var(--border, #ddd)',display:organization?'block':'grid',gridTemplateColumns:'minmax(110px, 1fr) minmax(120px, 2fr)',gap:'16px'});
      const term=node('dt'),detail=node('dd');detail.style.margin='0';
      const voiceState=organization?null:creditVoiceState(f);
      const text=organization?f.entryTitle:voiceState?.label||f.personDisplayName||f.creditedName||f.name;
      const target=voiceState?null:organization?(f.entryWorkId?'#work/'+f.entryWorkId:f.sourceWorkIdentity?nativeEntryHref(f.sourceWorkIdentity):f.bangumiSubjectId?'https://bgm.tv/subject/'+f.bangumiSubjectId:null):(f.personId?'#persons/person/'+f.personId:f.organizationId?nativeEntryHref(f.organizationId):f.bangumiPersonId?'https://bgm.tv/person/'+f.bangumiPersonId:null);
      const link=node(target?'a':'span',text||'未署名');
      if(target){link.href=target;if(target.startsWith('https://')){link.target='_blank';link.rel='noopener noreferrer';}else link.addEventListener('click',()=>{onClose=null;dialog.close();});}
      term.append(link);
      const roles=[...new Set(facts.map(x=>CREDIT_ROLE_LABELS[x.roleCode]||x.roleCode))];if(!voiceState)detail.append(node('span',roles.join('、')));
      if(organization){Object.assign(detail.style,{marginTop:'6px',fontSize:'14px',color:'var(--text-muted, #687083)'});if(f.entryDate)detail.append(node('span',' · '+f.entryDate));}
      const characters=[...new Set(facts.filter(x=>x.roleCode==='voice-actor').map(x=>x.characterDisplayName||x.characterName||x.sourceRoleDetailName).filter(Boolean))];
      if(characters.length)detail.append(node('div',(voiceState?'角色：':'饰演：')+characters.join('、')));
      const notes=[...new Set(facts.map(x=>creditResponsibilityText(x)).filter(Boolean))].filter(note=>!(entry.identityKind==='release-content'&&/^remaster(?:ed)? edition$/iu.test(note.trim())));if(notes.length)detail.append(node('div',notes.join('；')));
      row.append(term,detail);list.append(row);
    }
    dialog.append(list);const source=node('a',entry.providerLabel||'Bangumi');source.href=entry.url;source.target='_blank';source.rel='noopener noreferrer';const footer=node('p');footer.style.fontSize='14px';footer.append(source);dialog.append(footer);
    dialog.setAttribute('aria-busy','false');
  } catch(error) { title.textContent='资料暂时无法加载';dialog.setAttribute('aria-busy','false'); }
  return dialog;
}

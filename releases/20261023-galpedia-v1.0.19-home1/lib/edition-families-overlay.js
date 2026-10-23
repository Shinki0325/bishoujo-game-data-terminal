import { CREDIT_SCOPE } from './credit-scope-config.js';
// The immutable source is validated by its callers; this separate reviewed
// overlay changes only edition identities explicitly named in the ledger.
export function applyReviewedEditionFamilies(value, config=CREDIT_SCOPE) {
  if(!value?.families || !value.workToPresentationWorkId)return value;
  const overrides=Object.entries({...config.editionOverrides,...config.familyCorrections}).filter(([id])=>Object.hasOwn(value.workToPresentationWorkId,id));
  if(!overrides.length)return value;
  let families=value.families.map(f=>({...f,catalogMemberWorkIds:[...f.catalogMemberWorkIds],members:f.members.map(m=>({...m}))}));
  const mapping={...value.workToPresentationWorkId};
  const sourceMembers=new Map(value.families.flatMap(f=>f.members.map(m=>[m.workId,m])));
  const reset=f=>{f.members.sort((a,b)=>String(a.releaseDate).localeCompare(String(b.releaseDate))||String(a.workId).localeCompare(String(b.workId)));f.defaultWorkId=f.members[0].workId;for(const m of f.members)m.default=m.workId===f.defaultWorkId;return f;};
  for(const [id,o] of overrides){
    for(const f of families){if(!f.catalogMemberWorkIds.includes(id))continue;f.catalogMemberWorkIds=f.catalogMemberWorkIds.filter(x=>x!==id);f.members=f.members.filter(m=>m.workId!==id);if(f.members.length&&f.defaultWorkId===id)reset(f);}
    families=families.filter(f=>f.members.length>=2);
    mapping[id]=o.presentationWorkId;
    let target=families.find(f=>f.presentationWorkId===o.presentationWorkId);
    const members=(o.relatedMembers??[]).filter(m=>Object.hasOwn(mapping,m.workId)).map(m=>({...m,platform:m.platform||sourceMembers.get(m.workId)?.platform||''}));
    if(!target){target={catalogMemberWorkIds:[],defaultWorkId:id,members:[],presentationWorkId:o.presentationWorkId,status:'auto-version-family',title:o.title,vndbId:o.vndbId};}
    for(const member of members){if(!target.catalogMemberWorkIds.includes(member.workId)){target.catalogMemberWorkIds.push(member.workId);target.members.push({...member,default:false});}}
    if(target.members.length>=2){reset(target);if(!families.includes(target))families.push(target);}
  }
  return {...value,families,workToPresentationWorkId:mapping};
}

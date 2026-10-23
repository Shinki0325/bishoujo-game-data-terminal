import { groupPersonTimelineCredits, representativePersonSongs } from './person-timeline-model.js';
import { personCreditInMode, personScopeOverview, groupPersonEditionRows, representativePersonWorks } from './person-detail-projection.js';
import { creditResponsibilityNotes, creditResponsibilityText } from './credit-responsibility.js';
import { CREDIT_ROLE_LABELS } from './credit-role-labels.js';
import { canonicalRole } from './credit-role-policy.js';
import { songCategoryLabel } from './song-category-label.js';
import { releaseDateSortCompare, releaseYear } from './work-release-date.js';
export const PERSON_SECTION_SCHEMA = 'galpedia-person-sections-v1';
const modes = ['all','characters','songs','vocal','music','scenario','artwork'];
const musicRoles = ['vocalist','vocal','composition','lyrics','arrangement','music','songs','sound-director'];
const roleLabel=role=>CREDIT_ROLE_LABELS[role]??role??'未分类';
export const normalizePersonTimelineSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,' ').trim();
export function personTimelineSearchText(c,familyForWork=()=>null){
  return normalizePersonTimelineSearch([
    c.title,c.displayTitle,c.releaseDate,...c.roleCodes.map(roleLabel),
    familyForWork(c.workId)?.members?.find(m=>String(m.workId)===String(c.workId))?.platform,
    ...c.characters.map(x=>x.name),...c.songs.flatMap(x=>[x.title,...x.categories.map(songCategoryLabel),...x.roleCodes.map(roleLabel)]),
    ...creditResponsibilityNotes(c.sourceCredits),...c.sourceCredits.map(creditResponsibilityText),...c.sourceCredits.map(c=>c.creditedName)
  ].filter(Boolean).join(' '));
}
export function comparePersonTimeline(a,b,{key='releaseDate',direction='desc',scoped=false}={}){
  if(scoped&&Boolean(a.workId||a.nativeReleaseIdentity)!==Boolean(b.workId||b.nativeReleaseIdentity))return a.workId||a.nativeReleaseIdentity?-1:1;
  const aw=a.work??a,bw=b.work??b;
  const av=key==='releaseDate'?(a.releaseDate??aw.releaseDate??''):aw[key],bv=key==='releaseDate'?(b.releaseDate??bw.releaseDate??''):bw[key];
  if(key==='releaseDate')return releaseDateSortCompare(av,bv,{direction})||String(a.workId??'').localeCompare(String(b.workId??''),'en');
  const am=av===null||av===undefined||av==='',bm=bv===null||bv===undefined||bv==='';
  if(am!==bm)return am?1:-1;
  let result=typeof av==='number'&&typeof bv==='number'?bv-av:String(bv??'').localeCompare(String(av??''),'zh-Hans');
  if(direction==='asc')result*=-1;
  return result||String(a.workId??'').localeCompare(String(b.workId??''),'en')||String(a.displayTitle??a.title??'').localeCompare(String(b.displayTitle??b.title??''),'zh-Hans');
}
export function queryPersonTimeline(index,{mode='all',year='',search='',key='releaseDate',direction='desc'}={}){
  if(!modes.includes(mode)||!['releaseDate','median','voteCount','bangumiVoteCount','bangumiScore','title'].includes(key)
    ||!['asc','desc'].includes(direction))throw Error('人物年表查询无效');
  const terms=normalizePersonTimelineSearch(search).split(' ').filter(Boolean);
  const rows=index.rows[mode].filter(r=>(!year||String(r.year)===String(year))&&terms.every(term=>r.search.includes(term)))
    .sort((a,b)=>comparePersonTimeline(a,b,{key,direction,scoped:index.scoped}));
  const groups=[],byKey=new Map();
  for(const row of rows){
    let group=row.foldKey?byKey.get(row.foldKey):null;
    if(!group){group={ids:[]};groups.push(group);if(row.foldKey)byKey.set(row.foldKey,group);}
    group.ids.push(row.id);
  }
  return {totalRecords:rows.length,totalWorks:new Set(rows.map(r=>r.workIdentity||r.workId||r.id)).size,groups};
}
export function projectPersonSections(person,familyForWork=()=>null){
  const rows={},records={},overviews={},years={};
  const groups=groupPersonTimelineCredits(person.credits??[],person.timelineCast??[]);
  for(const mode of modes){
    const scoped=mode==='all'?groups:groupPersonTimelineCredits((person.credits??[]).filter(c=>personCreditInMode(c,mode)),mode==='characters'?person.timelineCast??[]:[]);
    overviews[mode]=personScopeOverview(scoped);
    years[mode]=[...new Set(scoped.map(c=>releaseYear(c.releaseDate)).filter(Boolean))].sort((a,b)=>b-a);
    rows[mode]=scoped.map((r,i)=>{
      const id=`${mode}:${i}`,family=r.workId?familyForWork(String(r.workId)):null;
      const member=family?.members?.find(m=>String(m.workId)===String(r.workId));
      const folded=groupPersonEditionRows([r],familyForWork)[0].rows[0];
      records[id]=folded;
      const work=r.work??r;
      return {id,workIdentity:r.presentationWorkId||r.sourceWorkIdentity||(r.workId?`edition:${r.workId}`:r.nativeReleaseIdentity)||id,workId:r.workId??null,nativeReleaseIdentity:r.nativeReleaseIdentity??null,
        releaseDate:r.releaseDate??work.releaseDate??'',title:r.title??'',displayTitle:r.displayTitle??'',
        median:work.median??null,voteCount:work.voteCount??null,bangumiVoteCount:work.bangumiVoteCount??null,bangumiScore:work.bangumiScore??null,
        year:releaseYear(r.releaseDate),search:personTimelineSearchText(r,familyForWork),
        foldKey:member&&family.presentationWorkId&&(!r.scope||r.scope.status==='confirmed')?JSON.stringify([family.presentationWorkId]):null};
    });
  }
  const roles=person.roles??(person.credits??[]).reduce((counts,c)=>{
    const role=c?.creditType==='character-voiced-by'?'voice-actor':String(c?.roleCode??'unknown');
    counts[role]=(counts[role]??0)+1;return counts;
  },{});
  const recordedRoles=[...new Set([...Object.keys(roles).filter(role=>roles[role]>0),...(person.credits??[]).map(c=>c.roleCode)].map(canonicalRole))];
  const primaryRole=canonicalRole(person.primaryRole||Object.entries(person.roles??{}).sort((a,b)=>b[1]-a[1])[0]?.[0]);
  const songRole=musicRoles.includes(primaryRole)?primaryRole:musicRoles.find(role=>recordedRoles.includes(role));
  const representativeSongs=songRole?representativePersonSongs(person,groups,songRole).map(r=>Object.fromEntries(
    ['workId','title','displayTitle','imageUrl','song','workThumbnailPath'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))):[];
  const overview={};
  // Only fields consumed by the existing overview; no fabricated credits array.
  for(const key of ['entityId','entityKind','displayName','canonicalName','primaryRole','roles','aliases','nameVariants','nameVariantCount','hiddenNameVariants','workCount','editionCount','scopeRevision','representativeCharacters','representativeWorks','collaborationScopeStatus','songCollaborationMode'])
    if(person[key]!==undefined)overview[key]=person[key];
  for(const key of ['coActors','voiceCoActors','songCoActors','vocalCoActors','musicCoActors','scenarioCoActors','artworkCoActors'])if(Array.isArray(person[key]))overview[key]=person[key].slice(0,5);
  overview.detailSections={schema:PERSON_SECTION_SCHEMA,overviews,years,recordedRoles,representativeWorksByMode:Object.fromEntries(['all','scenario','artwork'].map(mode=>[mode,representativePersonWorks(groupPersonTimelineCredits((person.credits??[]).filter(c=>mode==='all'||personCreditInMode(c,mode))))])),representativeSongs,representativeSongsByMode:Object.fromEntries(['vocal','music'].map(mode=>[mode,representativePersonSongs(person,groupPersonTimelineCredits((person.credits??[]).filter(c=>personCreditInMode(c,mode))),mode==='vocal'?'vocalist':'music').map(r=>Object.fromEntries(['workId','title','displayTitle','imageUrl','song','workThumbnailPath'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]])))])),groupCount:groups.length};
  if (!overview.detailSections.representativeWorksByMode.all.length) overview.detailSections.representativeWorksByMode.all=(person.representativeWorks??[]).slice(0,6);
  return {overview,index:{schema:PERSON_SECTION_SCHEMA,personId:person.entityId,scoped:Boolean(person.scopeRevision),rows},records};
}

import { selectRepresentativeCharacters } from './person-representative-characters.js';
import { REVIEWED_PUBLISHER_VOICE_CREDITS } from './reviewed-character-bindings.js';
import { resolveCreditCharacter } from './credit-character-identity.js';
import { nativeEntryHref } from './native-entry-route.js';
import { resolveCreditPerson, projectPersonIdentity, projectWorkIdentity } from './credit-identity-projection.js';
import { versionScopeClient } from './version-scope-client.js';
import { projectWorkCredits, isEditionImage, correctSourceCharacter, voiceAllowedInEdition, hasReviewedEditionVoiceScope } from './credit-scope-projection.js';
import { CREDIT_SCOPE } from './credit-scope-config.js';
import { createWorkCreditCatalog } from './work-credit-catalog.js';
import { PERSON_DETAIL_SHARDS } from './person-detail-shards-config.js';
import { PERSON_SUMMARY_SHARDS } from './person-summary-shards-config.js';
import { createResourceRequest } from './resource-request.js';
import { buildPersonDirectoryActivity } from './person-activity-timeline.js';
import { loadSongCollaborations, songCollaborationMode } from './song-collaboration-client.js';
import { correctSongCredit } from './song-usage-corrections.js';

const personRoleKey=f=>JSON.stringify([f.personId||f.canonicalEntityId||f.sourcePersonId||f.relationId,f.roleCode==='art'?'artwork':f.roleCode]);

export function attachWorkSourceResponsibilities(staff,unresolved) {
  const pendingByPersonRole=new Map(), attachedIds=new Set();
  for(const fact of unresolved){
    if(fact.scope?.status!=='unresolved'||fact.sourceEdition?.kind==='named-edition')continue;
    const key=personRoleKey(fact), rows=pendingByPersonRole.get(key)??[];
    rows.push(fact);pendingByPersonRole.set(key,rows);
  }
  for(const rows of Object.values(staff))for(const person of rows){
    person.pendingSourceCredits=pendingByPersonRole.get(personRoleKey(person))??[];
    person.sourceResponsibilityNotes=person.pendingSourceCredits.filter(f=>f.creditNoteOriginal);
    for(const fact of person.pendingSourceCredits)attachedIds.add(fact.creditId);
  }
  return attachedIds;
}

export function createCreditScopeClient({config=CREDIT_SCOPE,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto,songCollaborations=loadSongCollaborations,workCatalogConfig=undefined,summaryConfig=config===CREDIT_SCOPE?PERSON_SUMMARY_SHARDS:null,detailConfig=config===CREDIT_SCOPE?PERSON_DETAIL_SHARDS:null,maxCacheBytes=24*1024*1024,maxCacheEntries=8}={}) {
  const scopedCatalog=createWorkCreditCatalog({source:config,config:workCatalogConfig,fetchImpl,cryptoRef});
  const base=new URL(config.baseUrl,import.meta.url), cache=new Map(), sizes=new Map(), pendingReads=new Map();let cacheBytes=0;
  const request=createResourceRequest({fetchImpl});
  const hash=async bytes=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  async function read(d) {
    if (!d || !/^(?:persons-[a-f0-9]{2}|works-[a-f0-9]{2}|families-[a-f0-9]{2}|voice-peers-[0-3]|summaries(?:-[a-f0-9]{2})?|catalog(?:-person)?|person-context-[a-f0-9]{2})\.json\.gz$/.test(d.path)
      || !/^[a-f0-9]{64}$/.test(d.sha256) || !Number.isSafeInteger(d.bytes) || d.bytes<1 || d.bytes>16*1024*1024
      || !Number.isSafeInteger(d.rawBytes) || d.rawBytes<1 || d.rawBytes>64*1024*1024) throw Error('版本署名描述无效');
    if (pendingReads.has(d.path)) return pendingReads.get(d.path);
    if (!cache.has(d.path)) {
      const promise=request(new URL(d.path,base),{label:'版本署名',validationKey:`${config.revision}:${d.sha256}`,validate:async bytes=>{
        if(bytes.byteLength!==d.bytes || await hash(bytes)!==d.sha256)throw Error('版本署名摘要不符');
        const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        let size=0; const chunks=[];
        try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>d.rawBytes)throw Error('版本署名超过预算');chunks.push(value);}}
        finally{await reader.cancel().catch(()=>{});}
        if(size!==d.rawBytes)throw Error('版本署名解压长度不符');
        const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
        const v=JSON.parse(new TextDecoder().decode(raw));
        if(v.schema!=='galpedia-credit-scope-shard-v1'||v.revision!==config.revision||!v.rows)throw Error('版本署名修订不符');return v.rows;
      }}).catch(e=>{if(cache.has(d.path)){cacheBytes-=sizes.get(d.path)||0;sizes.delete(d.path);cache.delete(d.path);}throw e;});
      pendingReads.set(d.path,promise);
      promise.then(()=>pendingReads.delete(d.path),()=>pendingReads.delete(d.path));
      cache.set(d.path,promise);sizes.set(d.path,d.rawBytes);cacheBytes+=d.rawBytes;
      while(cache.size>maxCacheEntries || cacheBytes>maxCacheBytes){const key=cache.keys().next().value;if(key===d.path)break;cacheBytes-=sizes.get(key)||0;sizes.delete(key);cache.delete(key);}
    }
    return cache.get(d.path);
  }
  const shard=async(kind,id)=>{const b=(await hash(new TextEncoder().encode(String(id)))).slice(0,2);return(await read(config[kind][b]))[id]??null;};
  async function readSummaries(ids) {
    // An older derived set must never mask a newer summary/name update.
    if(summaryConfig?.sourceSha256!==config.summaries.sha256
      ||summaryConfig?.revision!==config.revision)return read(config.summaries);
    const buckets=[...new Set(await Promise.all(ids.map(async id=>
      (await hash(new TextEncoder().encode(id))).slice(0,2))))];
    const rows=await Promise.all(buckets.map(bucket=>{
      const descriptor=summaryConfig.shards?.[bucket];
      if(descriptor?.path!==`summaries-${bucket}.json.gz`)throw Error('人物统计分片路由无效');
      return read(descriptor);
    }));
    return Object.assign({},...rows);
  }
  const detailProjectionCurrent=detailConfig?.revision===config.revision
    && detailConfig?.catalogSha256===config.catalog?.sha256
    && ['0','1','2','3'].every(b=>detailConfig?.voicePeerSha256?.[b]===config.voicePeers?.[b]?.sha256);
  async function personCatalog(id,model,inputs) {
    if(!detailProjectionCurrent)return {catalog:await read(config.catalog),context:null};
    const bucket=(await hash(new TextEncoder().encode(id))).slice(0,2);
    const descriptor=detailConfig.shards?.[bucket];
    if(detailConfig.common?.path!=='catalog-person.json.gz'||descriptor?.path!==`person-context-${bucket}.json.gz`)
      throw Error('人物详情分片路由无效');
    const [rows,[ledger,summaries]]=await Promise.all([read(descriptor),inputs]);
    const context=rows[id]??{};let common;
    if(config===CREDIT_SCOPE&&detailConfig===PERSON_DETAIL_SHARDS){
      try{common=await (await import('./person-work-metadata-small.js')).loadSmallPersonCatalog({id,model,ledger,summary:summaries[id]??{},context,publisher:Object.values(REVIEWED_PUBLISHER_VOICE_CREDITS).filter(f=>f.personId===id),commonSha256:detailConfig.common.sha256});}catch{/* Complete source is the safe compatibility path. */}
    }
    common??=await read(detailConfig.common);
    return {catalog:{...common,
      personCreditRepairs:{[id]:context.personCreditRepairs??[]},
      personCompanyRepairs:context.personCompanyRepairs?{[id]:context.personCompanyRepairs}:{}},context};
  }
  const nativeLabelCache=new Map();
  async function nativeCreditDisplay(f,catalog){
    // Resolve only a label through exact character identity. Never inherit the
    // base edition's actor, scope or credit into the native release.
    const entry=catalog.nativeWorks?.[f.nativeReleaseIdentity];
    if(!entry?.baseEditionIds?.length||f.roleCode!=='voice-actor'||f.characterName||f.sourceRoleDetailName)return f;
    if(!nativeLabelCache.has(entry.entityId))nativeLabelCache.set(entry.entityId,(async()=>{
      const names=new Map(),add=(id,name,egs)=>{if(!id||!name)return;const row=names.get(id)??{egs:new Map(),all:new Map()},key=String(name).normalize('NFKC').replace(/\s+/gu,'');row.all.set(key,name);if(egs)row.egs.set(key,name);names.set(id,row);};
      for(const wid of entry.baseEditionIds){
        const ledger=await shard('works',String(wid));if(ledger?.edition?.workId!==String(wid))throw Error('角色名称来源版本不符');
        for(const row of [...ledger.cast,...ledger.credits]){
          if(row.scope?.status==='conflict')continue;
          add(resolveCreditCharacter({...row,workId:String(wid)},catalog),row.characterName||row.sourceRoleDetailName,Boolean(row.egsCharacterId));
        }
      }
      return names;
    })().catch(error=>{nativeLabelCache.delete(entry.entityId);throw error;}));
    const labels=await nativeLabelCache.get(entry.entityId).catch(()=>null),row=labels?.get(resolveCreditCharacter(f,catalog)),choices=row?.egs.size?row.egs:row?.all;
    return choices?.size===1?{...f,characterDisplayName:choices.values().next().value}:f;
  }
  let representativeDetails;
  async function characterDetails() {
    return representativeDetails ??= import('./page-data-client.js').then(({createPageDataClient})=>
      createPageDataClient({fetchImpl,cryptoRef}));
  }
  const valid=f=>f.scope?.status==='confirmed';
  const actor=f=>({...f,name:f.personDisplayName||f.creditedName||f.name||'未命名人物',creatorId:f.canonicalEntityId||f.sourcePersonId,detail:f.creditNoteOriginal||f.sourceRoleDetailName});
  const matches=(c,f)=>c.characterId===f.canonicalCharacterId||c.characterId===f.characterId
    || (f.egsCharacterId&&(c.sourceIds?.egsCharacterIds??[]).includes(f.egsCharacterId))
    || (f.vndbCharacterId&&c.sourceIds?.vndbCharacterId===f.vndbCharacterId)
    || (f.bangumiCharacterId&&(c.sourceIds?.bangumi??[]).some(x=>x.characterId===f.bangumiCharacterId));
  async function person(model) {
    const peerBucket=String(parseInt((await hash(new TextEncoder().encode(model.entityId)))[0],16)%4);
    const inputs=Promise.all([shard('persons',model.entityId),readSummaries([model.entityId])]);
    const [[rawLedger,summary],projection]=await Promise.all([inputs,personCatalog(model.entityId,model,inputs)]);
    const {catalog,context}=projection;
    const sourceLedger=projectPersonIdentity(rawLedger,model.entityId,catalog);
    const publisherCredits=Object.values(REVIEWED_PUBLISHER_VOICE_CREDITS).filter(f=>f.personId===model.entityId&&!sourceLedger?.credits.some(x=>x.creditId===f.creditId));
    const publisherEditions=new Set(publisherCredits.flatMap(f=>f.scope.editionIds).filter(w=>!sourceLedger?.credits.some(f=>f.scope?.status==='confirmed'&&f.scope.editionIds.includes(w))));
    const ledger=sourceLedger?{...sourceLedger,credits:[...sourceLedger.credits,...publisherCredits].map(correctSourceCharacter).map(correctSongCredit)}:sourceLedger;
    if(!ledger)throw Error('人物版本署名未登记');
    if(!Array.isArray(ledger.credits)||ledger.credits.some(f=>f.personId!==model.entityId))throw Error('人物署名身份不符');
    const sourceWorkIds=new Map();
    for(const w of Object.values(catalog.works))if(!sourceWorkIds.has(w.presentationWorkId))sourceWorkIds.set(w.presentationWorkId,w.workId);
    // This selects a navigation destination, not a credit's edition scope.
    // Do not send a remake-only actor to the family's original/unvoiced release.
    const sourceNavigationWork=f=>{
      const first=sourceWorkIds.get(f.presentationWorkId);
      if(voiceAllowedInEdition(f,first))return first;
      return Object.values(catalog.works).find(w=>w.presentationWorkId===f.presentationWorkId
        && hasReviewedEditionVoiceScope(w.workId) && voiceAllowedInEdition(f,w.workId))?.workId;
    };
    const oldById=new Map((model.credits??[]).filter(c=>c.workId).map(c=>[String(c.workId),c]));
    const credits=ledger.credits.filter(f=>f.scope?.status!=='conflict').flatMap(f=>valid(f)?f.scope.editionIds.filter(wid=>voiceAllowedInEdition(f,wid)).map(wid=>{
      const w=catalog.works[wid];if(!w)throw Error('署名版本未登记');
      const old=config.editionOverrides?.[wid]||config.familyCorrections?.[wid] ? null : oldById.get(wid);
      return {...f,...w,displayTitle:old?.displayTitle||old?.title||w.title,
        characterId:f.characterId||f.canonicalCharacterId,
        creditType:f.relationType,
        ...(old?.workThumbnailPath?{workThumbnailPath:old.workThumbnailPath}:{}),
        // Ratings are edition data only when the existing row has that identity.
        ...(old?{bangumiScore:old.bangumiScore,bangumiVoteCount:old.bangumiVoteCount}:{}),
      };
    }):(()=>{const entry=catalog.nativeWorks?.[f.sourceWorkIdentity],release=Boolean(f.nativeReleaseIdentity&&entry);const title=release?entry.title:catalog.families[f.presentationWorkId]||f.sourceWorkTitle||'作品';return [{...f,workId:null,sourceWorkId:release?null:sourceNavigationWork(f),nativeWorkId:entry?.entityId,releaseDate:release?entry.releaseDate:'',title,displayTitle:title,characterId:f.canonicalCharacterId,creditType:f.relationType}];})());
    for(const f of credits){
      const key=f.egsCharacterId?`egs:${f.egsCharacterId}`:f.bangumiCharacterId?`bangumi:${f.bangumiSubjectId}:${f.bangumiCharacterId}`:f.vndbCharacterId?`vndb:${f.vndbCharacterId}`:null;
      f.characterId=resolveCreditCharacter(f,catalog);
      if(!f.characterName&&f.roleCode==='voice-actor'&&f.sourceRoleDetailName)f.characterName=f.sourceRoleDetailName;
      if(f.nativeReleaseIdentity)Object.assign(f,await nativeCreditDisplay(f,catalog));
    }
    const confirmed=new Set(credits.filter(c=>c.workId).map(c=>c.workId));
    const families=new Set(ledger.credits.filter(f=>f.scope?.status!=='conflict').flatMap(f=>valid(f)?f.scope.editionIds.map(id=>catalog.works[id]?.presentationWorkId):[f.presentationWorkId||f.sourceWorkIdentity]));
    const reviewedRepresentatives=(ledger.representativeCharacters ?? (model.representativeCharacters??[]).filter(c=>
      (confirmed.has(String(c.workId)) && credits.some(f=>f.workId===String(c.workId)&&matches(c,f)))
      || (c.presentationWorkId && families.has(c.presentationWorkId) && catalog.works[String(c.workId)]?.presentationWorkId===c.presentationWorkId)))
      .filter(c=>!hasReviewedEditionVoiceScope(c.workId) || credits.some(f=>String(f.workId)===String(c.workId)&&matches(c,f)&&voiceAllowedInEdition(f,c.workId)) || (c.participationScope==='work'&&credits.some(f=>!f.workId&&f.presentationWorkId===c.presentationWorkId&&matches(c,f)&&voiceAllowedInEdition(f,c.workId))))
      .map(c=>({...c,title:config.editionOverrides?.[String(c.workId)]?.title||c.title,scopeLabel:c.scopeLabel||(c.imageUrl?'角色参考图':undefined),appearanceId:`${c.characterId}@${c.workId}`}));
    // Supplement reviewed cards only from current, exact character/CV facts.
    // Family-level evidence stays family-level; it must not become an edition credit.
    const castCandidates=model.timelineCast?.length?model.timelineCast:credits.filter(f=>f.roleCode==='voice-actor' && f.characterId && f.characterName).map(f=>({...f,name:f.characterName,role:f.characterRole,workId:f.workId||f.sourceWorkId}));
    const additions=castCandidates.flatMap(c=>{
      const fact=credits.find(f=>f.roleCode==='voice-actor' && matches(c,f)
        && (String(f.workId)===String(c.workId)
          || (!f.workId && f.presentationWorkId===c.presentationWorkId && f.sourceWorkId))
        && voiceAllowedInEdition(f,f.workId||f.sourceWorkId));
      if(!fact)return [];
      const workId=String(fact.workId||fact.sourceWorkId);
      return [{...c,characterId:fact.characterId,name:fact.characterName||c.name,
        workId,title:fact.displayTitle||fact.title||c.title,
        participationScope:fact.workId?'edition':'work',
        appearanceId:`${fact.characterId}@${workId}`,scopeLabel:'角色参考图'}];
    });
    const representatives=selectRepresentativeCharacters([
      ...reviewedRepresentatives,...additions.filter(c=>!reviewedRepresentatives.some(r=>r.characterId===c.characterId))
    ],6);
    await Promise.all(representatives.map(async ch=>{
      const w=await shard('works',String(ch.workId));
      const choices=(w?.editionImages??[]).filter(m=>m.characterId===ch.characterId||(m.egsCharacterId&&(ch.sourceIds?.egsCharacterIds??[]).includes(m.egsCharacterId)));
      if(new Set(choices.map(m=>m.thumbnail.sha256)).size===1){ch.imageUrl=choices[0].thumbnail.publicUrl;ch.imageAvailable=true;ch.scopeLabel=isEditionImage(choices[0])?'本版本角色图':'角色参考图';}
      if(ch.participationScope!=='work')ch.releaseDate=catalog.works[String(ch.workId)]?.releaseDate||'';
    }));
    const missingImages=representatives.filter(ch=>!ch.imageUrl && additions.some(c=>c.characterId===ch.characterId));
    if(missingImages.length){
      const details=await characterDetails();
      await Promise.all(missingImages.map(async ch=>{
        const payload=await details.getWorkDetail(ch.workId);
        const row=payload.model?.cast?.find(c=>c.characterId===ch.characterId);
        const image=row?.imageUrl||row?.image?.url;
        if(image){ch.imageUrl=image;ch.imageAvailable=true;}
      }));
    }
    const effectivePerson={...model,...summary[model.entityId]};
    const roles=new Set([...Object.entries(effectivePerson.roles??{}).filter(([,count])=>count>0).map(([role])=>role),...credits.map(c=>c.roleCode)]);
    const hasVoice=roles.has('voice-actor')||roles.has('voice');
    const hasMusic=['vocalist','vocal','lyrics','composition','arrangement','music','songs'].some(role=>roles.has(role));
    const defaultMusicMode=songCollaborationMode(effectivePerson,credits);
    const musicMode=defaultMusicMode||(hasMusic?songCollaborationMode({...effectivePerson,directoryRole:'music'},credits):null);
    // Keep the two relations independent: changing the visible profession must
    // not reuse song counts as voice co-appearances (or discard the voice index).
    const [voiceCoActors,songPeerModes]=await Promise.all([
      hasVoice||!musicMode?(context?context.voicePeers??[]:read(config.voicePeers[peerBucket]).then(rows=>rows[model.entityId]??[])):[],
      musicMode||roles.has('scenario')||roles.has('artwork')?songCollaborations(model.entityId):{}
    ]);
    const songCoActors=songPeerModes[musicMode]??[],vocalCoActors=songPeerModes.vocal??[],musicCoActors=songPeerModes.creators??[];
    const scenarioCoActors=songPeerModes.scenario??[],artworkCoActors=songPeerModes.artwork??[];
    const coActors=defaultMusicMode?songCoActors:voiceCoActors;
    const removedEditions=new Set(ledger.credits.filter(valid).flatMap(f=>f.scope.editionIds).filter(wid=>!confirmed.has(String(wid))));
    return {...model,...summary[model.entityId],editionCount:Math.max(0,(summary[model.entityId].editionCount??confirmed.size)-removedEditions.size+publisherEditions.size),credits,totalCredits:ledger.credits.length,timelineCast:[],
      representativeCharacters:representatives,representativeWorks:(summary[model.entityId].representativeWorkRefs??summary[model.entityId].representativeWorks??model.representativeWorks??[]).filter(w=>families.has(catalog.works[String(w.workId)]?.presentationWorkId)),
      getCoActors:undefined,getCoCompanies:undefined,coActors,voiceCoActors,songCoActors,vocalCoActors,musicCoActors,scenarioCoActors,artworkCoActors,coCompanies:ledger.coBrands.map(b=>({...b,name:(model.coCompanies??[]).find(c=>c.companyId===b.companyId)?.name||catalog.companyNames?.[b.companyId]||b.companyId})),collaborationScopeStatus:defaultMusicMode?'recorded-song-relations':'recorded-voice-relations',songCollaborationMode:musicMode,scopeRevision:config.revision};
  }
  async function work(model,wid) {
    const ledger=await shard('works',String(wid));if(!ledger)throw Error('作品版本署名未登记');
    if(ledger.edition?.workId!==String(wid))throw Error('署名版本身份不符');
    if(!Array.isArray(ledger.credits)||ledger.credits.some(f=>!valid(f)||!f.scope.editionIds.includes(String(wid))))throw Error('署名不属于当前版本');
    const family=await shard('families',ledger.familyId);
    const legacy=config.editionOverrides?.[String(wid)]?.legacyPresentationWorkId;
    const input=legacy&&model.scopeRevision!==config.revision?{...model,castSourcePresentationWorkId:legacy}:model;
    const project=catalog=>({...projectWorkCredits(input,projectWorkIdentity(ledger,catalog),
      (family??[]).map(f=>resolveCreditPerson(f,catalog)),wid,catalog),scopeRevision:config.revision});
    return await scopedCatalog.project(wid,project)??project(await read(config.catalog));
  }

  async function representatives(id,rows){
    const ledger=await shard('persons',config.personRedirects?.[id]??id);
    if(Array.isArray(ledger?.representativeCharacters))return ledger.representativeCharacters;
    const reviewed=await versionScopeClient.person(id);
    return reviewed?.representativeCharacters??rows;
  }
  async function summaries(rows,axis){const all=await readSummaries(rows.map(p=>p.entityId));return Promise.all(rows.map(async p=>{
    const s=all[p.entityId];if(!s)throw Error('人物统计未登记');const years=s.activityYears.flatMap(y=>Array(y.count).fill(y.year));
    return {...p,...s,activity:buildPersonDirectoryActivity(years,axis),representativeCharacters:p.representativeCharacterRevision===s.representativeCharacterRevision ? p.representativeCharacters??[] : await representatives(p.entityId,p.representativeCharacters??[]),representativeWorks:(s.representativeWorkRefs??s.representativeWorks??p.representativeWorks??[]).map(w=>({...p.representativeWorks?.find(old=>old.workId===w.workId),...w}))};
  }));}
  const registeredIds=new Set(config.registeredPersonIds??[]);
  async function registeredPerson(id){
    if(!registeredIds.has(id))return null;
    const ledger=await shard('persons',id);
    if(ledger?.profile?.entityId!==id)throw Error('来源人物档案身份不符');
    return person(ledger.profile);
  }
  async function nativeEntry(id) {
    const catalog=await read(config.catalog),entry=catalog.nativeWorks?.[id]??catalog.nativeOrganizations?.[id]??null;
    if(entry?.entityKind!=='organization')return entry?.identityKind==='release-content'?{...entry,credits:await Promise.all(entry.credits.map(f=>nativeCreditDisplay(f,catalog)))}:entry;
    return {...entry,credits:entry.credits.flatMap(f=>f.scope?.status==='confirmed'?f.scope.editionIds.map(wid=>{
      const work=catalog.works[wid];return {...f,entryWorkId:wid,entryTitle:work.title,entryDate:work.releaseDate};
    }):[f])};
  }
  async function searchNativeWorks(query) {
    const catalog=await read(config.catalog),norm=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'').toLowerCase(),q=norm(query);
    if(!q)return [];
    return Object.values(catalog.nativeWorks??{}).filter(w=>[w.title,w.originalTitle].some(n=>norm(n).includes(q)))
      .sort((a,b)=>Number(norm(b.title)===q)-Number(norm(a.title)===q)||a.title.localeCompare(b.title,'zh-Hans'))
      .map(w=>({id:w.entityId,name:w.title,href:nativeEntryHref(w.entityId)}));
  }
  const resolvePersonId = id => config.personRedirects?.[String(id)] ?? String(id);
  return Object.freeze({person,work,summaries,representatives,registeredPerson,resolvePersonId,nativeEntry,searchNativeWorks});
}
export const creditScopeClient=createCreditScopeClient();

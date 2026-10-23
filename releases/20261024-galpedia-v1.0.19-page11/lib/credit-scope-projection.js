import { REVIEWED_PUBLISHER_VOICE_CREDITS } from './reviewed-character-bindings.js';
import { creditVoiceState } from './credit-voice-state.js';
import { withCreditCharacter, reviewedFallbackCastTarget, reviewedCreditCharacter } from './credit-character-identity.js';
import { REVIEWED_WORK_CAST, REVIEWED_VOICE_NOTE_BINDINGS, REVIEWED_WORK_CHARACTER_ALIASES, REVIEWED_CHARACTER_BINDINGS, REVIEWED_SOURCE_CHARACTER_NAMES, REVIEWED_WORK_CHARACTER_NAMES, REVIEWED_VOICE_CREDIT_EXCLUSIONS, REVIEWED_WORK_NATIVE_RELEASE_EXCLUSIONS } from './reviewed-character-bindings.js';
import { creditResponsibilityText, compactCreditNoteTexts } from './credit-responsibility.js';
import { applyWorkContext } from './work-context-projection.js';
import { CREDIT_SCOPE } from './credit-scope-config.js';
import { correctSongUsage } from './song-usage-corrections.js';
import { applyCharacterCoverage } from './character-coverage.js';
import { REVIEWED_WORK_CAST_EXCLUSIONS, REVIEWED_CREDIT_ONLY_CHARACTER_PROFILES } from './reviewed-character-bindings.js';
const REVIEWED_CHARACTER_NAMES = Object.freeze({'262377:67916':'魔法少女ライオネル','222530:144077':'天王寺 茉莉華'});
export function correctSourceCharacter(f) {
  const wid=String(f.egsWorkId||f.workId||f.scope?.editionIds?.[0]||'');
  const excluded=REVIEWED_WORK_CAST_EXCLUSIONS[wid]?.credits.find(c=>c.creditId===f.creditId&&Object.entries(c.expected).every(([key,value])=>String(f[key])===String(value)));
  if(excluded&&f.scope?.status==='confirmed'&&f.scope.editionIds?.length===1&&String(f.scope.editionIds[0])===wid)
    f={...f,sourceScope:f.sourceScope||f.scope,scope:{...f.scope,status:'conflict',basis:'reviewed-edition-cast-mismatch'}};
  const exclusion=REVIEWED_VOICE_CREDIT_EXCLUSIONS[`${wid}:${f.relationId}`] || REVIEWED_VOICE_CREDIT_EXCLUSIONS[f.relationId];
  // A source correction is limited to the reviewed relation and edition; raw facts remain available.
  if (exclusion && ((exclusion.nativeEditionOnly && wid===exclusion.workId) || (f.scope?.status==='confirmed' && f.scope.editionIds?.length===1
    && String(f.scope.editionIds[0])===exclusion.workId))
    && Object.entries(exclusion.expected).every(([key,value])=>String(f[key])===String(value))) {
    f={...f,sourceScope:f.sourceScope||f.scope,scope:{...f.scope,status:'conflict',basis:'reviewed-source-voice-mismatch'},creditExclusion:exclusion};
  }
  const name=REVIEWED_SOURCE_CHARACTER_NAMES[`egs:${f.workId||f.egsWorkId}:${f.egsCharacterId}`]
    || REVIEWED_SOURCE_CHARACTER_NAMES[`bangumi:${wid}:${f.bangumiSubjectId}:${f.bangumiCharacterId}`]
    || REVIEWED_SOURCE_CHARACTER_NAMES[`bangumi:${f.bangumiSubjectId}:${f.bangumiCharacterId}`]
    || REVIEWED_CHARACTER_NAMES[`${f.bangumiSubjectId}:${f.bangumiCharacterId}`];
  return name ? {...f,sourceCharacterName:f.sourceCharacterName||f.characterName,characterName:name,characterNameResolution:'reviewed-source-record'} : f;
}
export function hasReviewedEditionVoiceScope(wid) {
  return Boolean(REVIEWED_WORK_NATIVE_RELEASE_EXCLUSIONS[String(wid)] || CREDIT_SCOPE.sourceBindingOverrides?.[String(wid)]?.vndbVoiced===1);
}
export function voiceAllowedInEdition(f, wid) {
  if (f.roleCode !== 'voice-actor') return true;
  wid=String(wid);
  if ((CREDIT_SCOPE.sourceBindingOverrides?.[wid]?.vndbVoiced ?? REVIEWED_WORK_NATIVE_RELEASE_EXCLUSIONS[wid]?.voiced) === 1) return false;
  const rule=REVIEWED_WORK_NATIVE_RELEASE_EXCLUSIONS[wid];
  if (f.source==='vndb' && rule?.presentationWorkId===f.presentationWorkId && rule.excludedNativeCharacterIds.includes(f.vndbCharacterId)) return false;
  return correctSourceCharacter({...f,workId:wid}).scope?.status !== 'conflict';
}
// Display work-level facts without manufacturing edition evidence.
const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, '');
const noteKey = value => String(value ?? '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
const personKey = f => (f.entityKind === 'voice-state' ? `voice-state:${f.voiceStatus}` : null) || f.personId || f.canonicalEntityId || f.sourcePersonId
  || (f.bangumiPersonId ? `bangumi:${f.bangumiPersonId}` : f.relationId || f.creditId || `${f.source}:${f.name}`);
const roleKey = f => f.roleCode === 'art' ? 'artwork' : f.roleCode;
export const actor = f => {
  const state=creditVoiceState(f);
  return {...f,...(state?{...state,personId:undefined,personDisplayName:undefined}:{}),
    name:state?.label || (f.identityResolution?.basis === 'reviewed-specific-credit-person' && f.personDisplayName) || f.creditedName || f.name || f.personDisplayName || '未命名人物',
    creatorId:state?undefined:f.canonicalEntityId || f.sourcePersonId,detail:creditResponsibilityText(f)};
};
export const matchesCharacter = (c,f) => Boolean(
  (f.canonicalCharacterId && c.characterId === f.canonicalCharacterId)
  || (f.characterId && c.characterId === f.characterId)
  || (f.egsCharacterId && (c.sourceIds?.egsCharacterIds ?? []).includes(f.egsCharacterId))
  || (f.vndbCharacterId && c.sourceIds?.vndbCharacterId === f.vndbCharacterId)
  || (f.bangumiCharacterId && (c.sourceIds?.bangumi ?? []).some(x => x.characterId === f.bangumiCharacterId
    && (!f.bangumiSubjectId || x.subjectId === f.bangumiSubjectId))));

export function mergeCreditPeople(rows, {preserveScope = false, preferConfirmedNotes = false} = {}) {
  const groups = new Map();
  for (const input of rows) {
    const key = JSON.stringify([personKey(input),roleKey(input),preserveScope ? [input.sourceEdition?.workId,input.sourceEdition?.kind,input.sourceEdition?.id,input.scope?.editionIds] : null]);
    let g = groups.get(key);
    if (!g) { g = {...input, sourceCredits:[], notes:new Map()}; groups.set(key,g); }
    for (const fact of input.sourceCredits ?? [input]) {
      if (!g.sourceCredits.some(x => (x.evidenceId || x.relationId || x.creditId) === (fact.evidenceId || fact.relationId || fact.creditId))) g.sourceCredits.push(fact);
    }
    for (const note of String(input.detail || '').split('；').filter(Boolean)) if (!g.notes.has(noteKey(note))) g.notes.set(noteKey(note),note);
  }
  return [...groups.values()].map(({notes,...g}) => {
    // An unresolved edition's note is provenance, not a qualification of the
    // confirmed cast credit. Keep its complete fact without lending its note.
    if (preferConfirmedNotes && g.sourceCredits.some(f=>f.scope?.status==='confirmed')) {
      notes.clear();
      for (const f of g.sourceCredits.filter(f=>f.scope?.status==='confirmed'))
        for (const note of creditResponsibilityText(f).split('；').filter(Boolean))
          if (!notes.has(noteKey(note))) notes.set(noteKey(note),note);
    }
    // A reviewed, specific theme-song duty subsumes the generic source label.
    // Keep every original fact in sourceCredits for provenance.
    if (g.sourceCredits.some(f => f.relationType === 'reviewed-work-responsibility'
      && f.roleCode === 'music' && /^主题歌(?:作词|作曲|编曲|演唱)/u.test(creditResponsibilityText(f)))) {
      notes.delete(noteKey('Theme song'));
      notes.delete(noteKey('主题歌'));
    }
    return {...g, detail:compactCreditNoteTexts(notes.values(), g.sourceCredits).join('；') || undefined};
  });
}

// A global Bangumi portrait is a usable reference image, not edition artwork.
export const isEditionImage = m => m?.mediaScope ? m.mediaScope.status === 'confirmed' : m?.scope?.status === 'confirmed' && m.source !== 'bangumi';

export const canonicalCharacterRole = role => ({main:'main',primary:'main',protagonist:'main','主角':'main','主人公':'main','メイン':'main',sub:'sub',side:'sub','配角':'sub','サブ':'sub',appears:'appears','客串':'appears','登场':'appears','その他':'appears'})[role] || 'unknown';

export function splitReviewedNativeCharacters(model, catalog) {
  const cast = [];
  for (const c of model.cast ?? []) {
    const anchors = c.sourceIds?.bangumi ?? [];
    const moved = anchors.filter(a=>catalog.characterNativeSplits?.[`${a.subjectId}:${a.characterId}`]
      && catalog.characterNativeSplits[`${a.subjectId}:${a.characterId}`] !== c.characterId);
    if (!moved.length) {cast.push(c); continue;}
    const ids = new Set(moved.map(a=>String(a.characterId)));
    const filteredEvidence = value => Object.fromEntries(Object.entries(value ?? {}).map(([key,rows])=>[key,rows.filter(d=>d.source !== 'bangumi' || !ids.has(String(d.sourceCharacterId)))]).filter(([,rows])=>rows.length));
    cast.push({...c, sourceIds:{...c.sourceIds,bangumi:anchors.filter(a=>!moved.includes(a))},
      metadataEvidence:filteredEvidence(c.metadataEvidence),metadataCandidateConflicts:filteredEvidence(c.metadataCandidateConflicts),metadataScopedCandidateConflicts:filteredEvidence(c.metadataScopedCandidateConflicts),
      metadata:Object.fromEntries(Object.entries(c.metadata ?? {}).filter(([,v])=>v.source !== 'bangumi')),
      descriptions:(c.descriptions ?? []).filter(d=>d.source !== 'bangumi' || !ids.has(String(d.sourceCharacterId))),
      profileFacts:(c.profileFacts ?? []).filter(d=>d.source !== 'bangumi' || !ids.has(String(d.sourceCharacterId))),
      actors:(c.actors ?? []).filter(a=>a.source !== 'bangumi')});
    for (const a of moved) {
      const id=catalog.characterNativeSplits[`${a.subjectId}:${a.characterId}`];
      if (cast.some(x=>x.characterId===id) || model.cast.some(x=>x.characterId===id)) continue;
      cast.push({characterId:id,characterName:c.originalCharacterName || c.characterName,role:'appears',
        sourceIds:{bangumi:[a]},actors:[],image:null});
    }
  }
  return {...model,cast};
}

export function projectWorkCredits(model, ledger, familyCredits, wid, catalog = {}) {
  const publisherCredits=Object.values(REVIEWED_PUBLISHER_VOICE_CREDITS).filter(f=>f.workId===String(wid));
  if(publisherCredits.length)ledger={...ledger,credits:[...ledger.credits,...publisherCredits.filter(f=>!ledger.credits.some(x=>x.creditId===f.creditId))]};
  const castExclusion=REVIEWED_WORK_CAST_EXCLUSIONS[String(wid)];
  if(castExclusion&&castExclusion.presentationWorkId===ledger.edition.presentationWorkId){
    const excluded=new Set(castExclusion.excludedNativeCharacterIds),foreign=f=>f.source==='vndb'&&excluded.has(f.vndbCharacterId);
    const oldCast=(model.cast??[]).filter(c=>excluded.has(c.sourceIds?.vndbCharacterId));
    model={...model,cast:(model.cast??[]).filter(c=>!oldCast.includes(c)),sourceCastEditionProvenance:[...(model.sourceCastEditionProvenance??[]),...oldCast]};
    ledger={...ledger,credits:ledger.credits.filter(f=>!foreign(f)),cast:ledger.cast.filter(f=>!foreign(f)).map(c=>({...c,actors:c.actors.filter(f=>!foreign(f))}))};
    familyCredits=familyCredits.filter(f=>!foreign(f));
  }
  // The same VNDB VN may group distinct releases with separate character
  // instances. Suppress only a reviewed foreign-release roster in this work;
  // keep the source archive and its original edition completely independent.
  const releaseRule=REVIEWED_WORK_NATIVE_RELEASE_EXCLUSIONS[String(wid)];
  if(releaseRule && releaseRule.presentationWorkId===ledger.edition.presentationWorkId){
    const excludedNative=new Set(releaseRule.excludedNativeCharacterIds);
    const foreign=f=>f.source==='vndb'&&excludedNative.has(f.vndbCharacterId);
    const oldCast=(model.cast??[]).filter(c=>excludedNative.has(c.sourceIds?.vndbCharacterId));
    model={...model,cast:(model.cast??[]).filter(c=>!oldCast.includes(c)),
      sourceCastReleaseProvenance:[...(model.sourceCastReleaseProvenance??[]),...oldCast]};
    ledger={...ledger,credits:ledger.credits.filter(f=>!foreign(f)),
      cast:ledger.cast.filter(f=>!foreign(f)).map(c=>({...c,actors:c.actors.filter(f=>!foreign(f))}))};
    familyCredits=familyCredits.filter(f=>!foreign(f));
  }

  // Reject only the disproven work join; preserve unrelated native anchors.
  const excluded=new Set(catalog.excludedWorkSubjects?.[String(wid)]??[]);
  if(excluded.size) model={...model,cast:(model.cast??[]).flatMap(c=>{
    const anchors=c.sourceIds?.bangumi??[],bad=anchors.filter(a=>excluded.has(String(a.subjectId)));
    if(!bad.length)return [c];
    const good=anchors.filter(a=>!bad.includes(a));
    if(!good.length&&!c.sourceIds?.vndbCharacterId&&!c.sourceIds?.egsCharacterIds?.length)return [];
    const affected=d=>d.source==='bangumi'&&bad.some(a=>String(a.characterId)===String(d.sourceCharacterId));
    return [{...c,sourceIds:{...c.sourceIds,bangumi:good},actors:(c.actors??[]).filter(f=>!excluded.has(String(f.bangumiSubjectId))),
      descriptions:(c.descriptions??[]).filter(d=>!affected(d)),profileFacts:(c.profileFacts??[]).filter(d=>!affected(d))}];
  })};
  model = splitReviewedNativeCharacters(model,catalog);
  wid = String(wid);
  const familyCorrection=catalog.workFamilyCorrections?.[wid];
  if(familyCorrection && model.presentationWorkId===familyCorrection.previousPresentationWorkId && ledger.edition.presentationWorkId===familyCorrection.presentationWorkId){
    const sourceFacts=[...(ledger.cast??[]),...(ledger.credits??[])];
    const ownEgs=new Set([...(ledger.cast??[]),...sourceFacts.filter(f=>String(f.egsWorkId)===wid)].map(f=>String(f.egsCharacterId)).filter(id=>id!=='undefined'));
    const ownBgm=new Set(sourceFacts.filter(f=>f.bangumiSubjectId&&f.bangumiCharacterId).map(f=>`${f.bangumiSubjectId}:${f.bangumiCharacterId}`));
    const ownCharacters=new Set(sourceFacts.map(f=>withCreditCharacter(correctSourceCharacter({...f,workId:f.workId||wid}),catalog)).map(f=>f.canonicalCharacterId||f.characterId).filter(Boolean));
    const ownNative=new Set([...ownCharacters].map(id=>id.match(/^char_(?:vndb_)?(c[0-9]+)$/)?.[1]).filter(Boolean));
    // Old family models can contain characters and companies of bundled extras.
    // Only an actual source appearance in this edition survives the rebase.
    model={...model,presentationWorkId:familyCorrection.presentationWorkId,castSourcePresentationWorkId:familyCorrection.presentationWorkId,
      cast:(model.cast??[]).filter(c=>ownCharacters.has(c.characterId)||ownNative.has(c.sourceIds?.vndbCharacterId)
        ||ownCharacters.has(REVIEWED_WORK_CAST[`${wid}:${c.characterId}`]?.template.characterId)
        ||(c.sourceIds?.egsCharacterIds??[]).some(id=>ownEgs.has(String(id)))||(c.sourceIds?.bangumi??[]).some(x=>ownBgm.has(`${x.subjectId}:${x.characterId}`))).map(c=>({...c,actors:[]})),
      companies:[],songs:[],sourceModelFamilyCorrection:familyCorrection.previousPresentationWorkId};
  }
  // Replace only a reviewed appearance in this work; the other edition's
  // canonical profile, artwork and identity remain independent.
  const currentCast = [];
  for (const c of model.cast ?? []) {
    const rule = REVIEWED_WORK_CAST[`${wid}:${c.characterId}`];
    const replacement = rule?.presentationWorkId === ledger.edition.presentationWorkId
      ? {...structuredClone(rule.template),sourceCastProvenance:[c]} : c;
    const index = currentCast.findIndex(x=>x.characterId===replacement.characterId && (x.sourceCastProvenance || replacement.sourceCastProvenance));
    const existing = currentCast[index];
    if (!existing) currentCast.push(replacement);
    else {
      const preferred = replacement.sourceCastProvenance ? existing : replacement;
      currentCast[index]={...preferred,sourceCastProvenance:[...(existing.sourceCastProvenance??[]),...(replacement.sourceCastProvenance??[])]};
    }
  }
  // Some legacy models contain only a bundled extra's roster. An appearance
  // created later from the edition ledger has no raw card to replace, so admit
  // its reviewed template only when an actual edition fact selects that ID.
  const applicableTemplates=Object.entries(REVIEWED_WORK_CAST).filter(([key,rule])=>key.startsWith(wid+':')&&rule.presentationWorkId===ledger.edition.presentationWorkId);
  if(applicableTemplates.length){
    const owned=new Set([...(ledger.cast??[]),...(ledger.credits??[])].map(f=>withCreditCharacter(correctSourceCharacter({...f,workId:f.workId||wid}),catalog)).filter(f=>f.scope?.status!=='conflict').map(f=>f.canonicalCharacterId||f.characterId).filter(Boolean));
    for(const [,rule] of applicableTemplates){
      const template=rule.template;if(!owned.has(template.characterId)||currentCast.some(c=>c.characterId===template.characterId))continue;
      const sameNative=template.sourceIds?.vndbCharacterId?currentCast.filter(c=>c.sourceIds?.vndbCharacterId===template.sourceIds.vndbCharacterId):[];
      if(sameNative.length===1){const existing=sameNative[0];currentCast[currentCast.indexOf(existing)]={...structuredClone(template),...existing,characterId:template.characterId,sourceIds:{...existing.sourceIds,...template.sourceIds},sourceCastProvenance:[...(existing.sourceCastProvenance??[]),existing]};}
      else if(!sameNative.length)currentCast.push({...structuredClone(template),sourceCastProvenance:[]});
    }
  }
  model={...model,cast:currentCast.map(c=>{
    const aliases=REVIEWED_WORK_CHARACTER_ALIASES[`${wid}:${c.characterId}`];
    if(aliases)c={...c,nameAliases:[...new Set([...(c.nameAliases??[]),...aliases])]};
    const anchors=[...(c.sourceIds?.egsCharacterIds??[]).map(id=>`egs:${wid}:${id}`),...(c.sourceIds?.bangumi??[]).map(a=>`bangumi:${a.subjectId}:${a.characterId}`)];
    if(!c.sourceIds?.vndbCharacterId&&anchors.length&&anchors.every(key=>REVIEWED_CREDIT_ONLY_CHARACTER_PROFILES[key]?.workId===wid))
      c={...c,sourceCastProvenance:[...(c.sourceCastProvenance??[]),c],metadata:{},descriptions:[],profileFacts:[],image:null,genericImage:null};
    if (/^char_(?:egs|bangumi)_/.test(c.characterId)) return c;
    const movedEgs=(c.sourceIds?.egsCharacterIds??[]).filter(id=>REVIEWED_CHARACTER_BINDINGS[`egs:${wid}:${id}`] && REVIEWED_CHARACTER_BINDINGS[`egs:${wid}:${id}`]!==c.characterId);
    const movedBgm=(c.sourceIds?.bangumi??[]).filter(a=>{const target=reviewedCreditCharacter({bangumiSubjectId:a.subjectId,bangumiCharacterId:a.characterId},wid);return target&&target!==c.characterId;});
    if(!movedEgs.length&&!movedBgm.length)return c;
    return {...c,sourceCastProvenance:[...(c.sourceCastProvenance??[]),c],sourceIds:{...c.sourceIds,egsCharacterIds:(c.sourceIds?.egsCharacterIds??[]).filter(id=>!movedEgs.includes(id)),bangumi:(c.sourceIds?.bangumi??[]).filter(a=>!movedBgm.includes(a))},
      actors:(c.actors??[]).filter(a=>!movedBgm.some(b=>a.relationId?.startsWith(`bangumi:character-voice:${b.subjectId}:${b.characterId}:`))&&!movedEgs.some(id=>a.relationId?.startsWith(`egs:${wid}:${id}:`))),
      descriptions:(c.descriptions??[]).filter(d=>!(d.source==='bangumi'&&movedBgm.some(a=>String(a.characterId)===String(d.sourceCharacterId)))&&!(d.source==='egs'&&movedEgs.includes(String(d.sourceCharacterId))))};
  })};
  // An explicitly unvoiced native release outranks an unqualified work cast.
  // Missing voice information is not equivalent to an unvoiced release.
  const unvoiced = (CREDIT_SCOPE.sourceBindingOverrides?.[wid]?.vndbVoiced ?? REVIEWED_WORK_NATIVE_RELEASE_EXCLUSIONS[wid]?.voiced) === 1;
  const nativeVoiceExclusions=Object.values(REVIEWED_VOICE_CREDIT_EXCLUSIONS).filter(e=>e.nativeEditionOnly&&e.workId===wid);
  const outsideEdition = f => f.scope?.status === 'confirmed' && f.scope.editionIds?.length > 0
    && !f.scope.editionIds.map(String).includes(wid);
  const sameWork = (model.castSourcePresentationWorkId || model.presentationWorkId) === ledger.edition.presentationWorkId;
  const sourceModel = sameWork ? model : {...model,cast:[],songs:[],companies:[]};
  const staff = {artwork:[],scenario:[],music:[],other:[]};
  const cast = (sourceModel.cast ?? []).map(c => ({...c,actors:[],sourceActors:[],
    image:null,genericImage:c.genericImage || c.image,scopeLabel:undefined,participationScope:'work',
    originalActors:(c.actors ?? []).filter(f=>!nativeVoiceExclusions.some(e=>e.expected.vndbCharacterId===c.sourceIds?.vndbCharacterId&&(e.expected.personId===f.personId || (f.source==='vndb' && REVIEWED_VOICE_CREDIT_EXCLUSIONS[`${wid}:${f.relationId}`]===e)))).map(correctSourceCharacter).filter(f=>!unvoiced && f.scope?.status!=='conflict' && !outsideEdition(f))}));
  // Explicit source corrections retain the raw label and record identity.
  const correctCharacter=f=>withCreditCharacter(correctSourceCharacter(f.source==='vndb'&&releaseRule?{...f,workId:f.workId||wid}:f),catalog);
  const inEdition = f => correctCharacter({...f,workId:f.workId||wid});
  ledger={...ledger,credits:ledger.credits.map(inEdition).filter(f=>f.scope?.status!=='conflict'),cast:ledger.cast.map(f=>({...inEdition(f),actors:f.actors.map(inEdition).filter(a=>a.scope?.status!=='conflict')}))};
  familyCredits=familyCredits.map(correctCharacter).filter(f=>f.scope?.status!=='conflict'&&!f.nativeReleaseIdentity);
  const sourceCredits = familyCredits.filter(f => !f.presentationWorkId || f.presentationWorkId === ledger.edition.presentationWorkId).map(actor);
  const currentSourceEditions = ledger.credits.filter(f => f.sourceEdition?.fieldPresent).map(f => f.sourceEdition);
  const otherEdition = f => outsideEdition(f) || f.sourceEdition?.kind === 'named-edition'
    || (f.sourceEdition?.kind === 'original' && currentSourceEditions.some(e => e.workId === f.sourceEdition.workId && e.kind === 'named-edition'));
  const workCredits = sourceCredits.filter(f => !otherEdition(f));
  const otherCredits = sourceCredits.filter(otherEdition);
  const identities = c => new Set([c.characterId,c.canonicalCharacterId,
    ...[...(c.sourceIds?.egsCharacterIds ?? []),c.egsCharacterId].filter(Boolean).map(id=>catalog.characterSources?.[`egs:${id}`]),
    ...[c.sourceIds?.vndbCharacterId,c.vndbCharacterId].filter(Boolean).map(id=>catalog.characterSources?.[`vndb:${id}`]),
    ...(c.sourceIds?.bangumi ?? []).map(x=>catalog.characterSources?.[`bangumi:${x.subjectId}:${x.characterId}`]),
    c.bangumiCharacterId ? catalog.characterSources?.[`bangumi:${c.bangumiSubjectId}:${c.bangumiCharacterId}`] : null].filter(Boolean));
  const matches = (c,f) => matchesCharacter(c,f) || [...identities(f)].some(id=>identities(c).has(id));
  const hasReviewedTarget = f => {
    const id=reviewedCreditCharacter(f,f.egsWorkId||f.workId||wid);
    // A reviewed native placeholder is not yet an adjudication against an
    // existing richer archive. Keep that unresolved correspondence separate.
    return id && !/^char_(?:egs|bangumi)_/.test(id) ? id : null;
  };
  const findCharacter = f => cast.find(c=>c.characterId === (f.canonicalCharacterId || f.characterId)) || (!hasReviewedTarget(f) && cast.find(c=>matches(c,f)));
  const aliases = wid === '6234' ? {'三ッ廣さち':'三ツ廣さち'} : {};
  const nameKey = s => aliases[norm(s)] || norm(s);
  const nativeCharacter = f => f.bangumiCharacterId ? [`bangumi:${f.bangumiSubjectId}`,f.bangumiCharacterId]
    : f.vndbCharacterId ? ['vndb',f.vndbCharacterId] : f.egsCharacterId ? ['egs',f.egsCharacterId] : null;
  const sourceNamesIndex=new Map();
  for(const f of [...ledger.cast,...ledger.credits,...workCredits]){
    const native=nativeCharacter(f),name=f.characterName||f.sourceRoleDetailName;
    if(!native||!name)continue;
    const key=JSON.stringify([native[0],nameKey(name)]),ids=sourceNamesIndex.get(key)??new Set();
    ids.add(native[1]);sourceNamesIndex.set(key,ids);
  }
  const byName = (name,f={}) => {
    const native=nativeCharacter(f);
    if(native && sourceNamesIndex.get(JSON.stringify([native[0],nameKey(name)]))?.size>1)return null;
    if (!name) return null;
    const found = cast.filter(c => [c.characterName,c.originalCharacterName,...(c.nameAliases ?? [])].some(n => n && nameKey(n) === nameKey(name)));
    return found.length === 1 ? found[0] : null;
  };
  const bindSource = (c,f) => {
    const ids = {...c.sourceIds};
    if (f.egsCharacterId) ids.egsCharacterIds = [...new Set([...(ids.egsCharacterIds ?? []),f.egsCharacterId])];
    if (f.vndbCharacterId && !ids.vndbCharacterId) ids.vndbCharacterId = f.vndbCharacterId;
    if (f.bangumiCharacterId) ids.bangumi = [...(ids.bangumi ?? [])];
    if (f.bangumiCharacterId && !ids.bangumi.some(x => x.characterId === f.bangumiCharacterId && x.subjectId === f.bangumiSubjectId)) ids.bangumi.push({characterId:f.bangumiCharacterId,subjectId:f.bangumiSubjectId,match:f.characterIdentityResolution?.basis || 'native-credit-character'});
    c.sourceIds = ids;
    // Once a native identity is resolved, retain its attested labels so later
    // name-only credits can find the same role without creating another card.
    if (f.egsCharacterId || f.vndbCharacterId || f.bangumiCharacterId)
      c.nameAliases = [...new Set([...(c.nameAliases ?? []), f.characterName, f.sourceCharacterName].filter(Boolean))];
  };
  const makeCharacter = (f,name) => {
    const c = {characterId:f.canonicalCharacterId || f.characterId || (f.egsCharacterId ? `char_egs_${f.egsCharacterId}` : f.vndbCharacterId ? `char_vndb_${f.vndbCharacterId}` : f.bangumiCharacterId ? `char_bangumi_${f.bangumiCharacterId}` : `char_source_${f.creditId}`),
      characterName:name,role:canonicalCharacterRole(f.characterRole),sourceIds:{},actors:[],sourceActors:[],image:null,originalActors:[]};
    bindSource(c,f);cast.push(c);return c;
  };
  for (const row of ledger.cast ?? []) {
    const f = {...row,characterRole:row.role};
    const c = findCharacter(f) || (!hasReviewedTarget(f) && byName(row.characterName,f)) || makeCharacter(f,row.characterName);
    bindSource(c,f);c.editionParticipationConfirmed = true;c.participationScope = 'edition';if(row.role && row.role!=='unknown' && (row.role!=='appears' || !['main','primary','protagonist','sub'].includes(c.role)))c.role = row.role;
    c.actors.push(...row.actors.filter(f=>!unvoiced && f.scope?.status!=='conflict' && !outsideEdition(f)).map(actor));
  }
  const unmatched = [];
  const addVoice = (f,confirmed) => {
    if (unvoiced) return;
    const name = f.characterName || f.sourceRoleDetailName;
    const entityId = f.egsCharacterId || f.vndbCharacterId || f.bangumiCharacterId || f.canonicalCharacterId || f.characterId;
    const noteTarget = !entityId && REVIEWED_VOICE_NOTE_BINDINGS[JSON.stringify([f.personId,String(wid),norm(name)])];
    let c = findCharacter(f) || (noteTarget && cast.find(c=>c.characterId===noteTarget)) || (!hasReviewedTarget(f) && byName(name,f));
    if (c && noteTarget === c.characterId && name) c.nameAliases = [...new Set([...(c.nameAliases ?? []),name])];
    // Multi-character/free-text credits remain visible as additional cast credits.
    if (!c && name && entityId) c = makeCharacter(f,name);
    if (!c) { unmatched.push({...actor(f),detail:f.creditNoteOriginal || f.sourceRoleDetailName || f.characterName}); return; }
    bindSource(c,f);
    if (['unknown','appears',undefined].includes(c.role) && ['main','sub'].includes(canonicalCharacterRole(f.characterRole))) c.role=canonicalCharacterRole(f.characterRole);
    if (confirmed) { c.editionParticipationConfirmed = true;c.participationScope = 'edition';c.actors.push(actor(f)); }
    else c.sourceActors.push(actor(f));
  };
  // Prefer records with character IDs before name-only work credits.
  const confirmed = [...ledger.credits].sort((a,b) => Number(Boolean(b.characterName)) - Number(Boolean(a.characterName)));
  for (const f of confirmed) {
    if (outsideEdition(f)) continue;
    if (f.roleCode === 'voice-actor') addVoice(f,true);
    else if (f.relationType !== 'song-credited-person') staff[({art:'artwork',artwork:'artwork',scenario:'scenario',music:'music'})[f.roleCode] || 'other'].push(actor(f));
  }
  for (const f of workCredits) {
    if (f.roleCode === 'voice-actor') addVoice(f,f.scope?.status==='confirmed' && f.scope.editionIds?.map(String).includes(wid));
    else if (f.relationType !== 'song-credited-person') staff[({art:'artwork',artwork:'artwork',scenario:'scenario',music:'music'})[f.roleCode] || 'other'].push(actor(f));
  }
  for (const c of cast) {
    // The original card is valid work-level information when its work identity agrees.
    if (!c.actors.length && !c.sourceActors.length) c.sourceActors.push(...c.originalActors);
    const known = new Set([...c.actors,...c.sourceActors].map(f=>f.personId).filter(Boolean));
    const resolveAlias = f => {
      if(f.personId)return f;
      const pid = catalog.personAliases?.[norm(f.creditedName || f.name || f.personDisplayName)];
      return !f.personId && pid && known.has(pid) ? {...f,personId:pid,sourceCredits:f.sourceCredits??[f],displayIdentityBasis:'public-alias-in-same-character'} : f;
    };
    c.actors=c.actors.map(resolveAlias);c.sourceActors=c.sourceActors.map(resolveAlias);
    if (!c.actors.length) { c.actors = mergeCreditPeople(c.sourceActors);c.sourceActors = []; }
    else {
      const own = new Set(c.actors.map(personKey));
      c.actors = mergeCreditPeople([...c.actors,...c.sourceActors.filter(f => own.has(personKey(f)))], {preferConfirmedNotes:true});
      c.sourceActors = mergeCreditPeople(c.sourceActors.filter(f => !own.has(personKey(f))));
    }
    delete c.originalActors;
    const choices = (ledger.editionImages ?? []).filter(m => m.characterId === c.characterId || (m.egsCharacterId && c.sourceIds?.egsCharacterIds?.includes(m.egsCharacterId)));
    const editionChoices = choices.filter(isEditionImage);
    const selected = new Set(editionChoices.map(m => m.thumbnail.sha256)).size === 1 ? editionChoices[0] : null;
    const reference = !selected && choices.find(m => m.thumbnail?.publicUrl);
    const imageFrom = m => ({url:m.thumbnail.publicUrl,fallbackUrl:m.preview?.publicUrl,width:m.thumbnail.width,height:m.thumbnail.height,scope:selected?m.scope:{status:'work',editionIds:[]},source:m.source});
    if (selected) { c.image = imageFrom(selected);c.genericImage = null; }
    else if (!c.genericImage && reference) c.genericImage = imageFrom(reference);
    c.appearanceId = `${c.characterId}@${wid}`;
  }
  for (const key of Object.keys(staff)) staff[key] = mergeCreditPeople(staff[key]);
  const retired = new Set();
  for (const source of cast) {
    let targetId = reviewedFallbackCastTarget(source, wid);
    let nativeNamespaceAlias = false;
    if (!targetId) {
      // Legacy factory cards used a second prefix for the exact same native
      // ID. This is not a name/main-character/form-based identity inference.
      const native = /^char_vndb_(c[0-9]+)$/.exec(source.characterId ?? '')?.[1];
      const peer = native && source.sourceIds?.vndbCharacterId === native
        && cast.find(c => c !== source && c.characterId === `char_${native}`
          && (!c.sourceIds?.vndbCharacterId || c.sourceIds.vndbCharacterId === native));
      if (peer) { targetId = peer.characterId; nativeNamespaceAlias = true; }
    }
    const target = targetId && cast.find(c => c !== source && c.characterId === targetId);
    if (!target) continue;
    // Provenance, actor duties and original names survive the display fold.
    target.actors = mergeCreditPeople([...target.actors, ...source.actors], {preferConfirmedNotes:true});
    target.sourceActors = mergeCreditPeople([...target.sourceActors, ...source.sourceActors]);
    const ownPeople = new Set(target.actors.map(personKey));
    target.actors = mergeCreditPeople([...target.actors,...target.sourceActors.filter(a=>ownPeople.has(personKey(a)))], {preferConfirmedNotes:true});
    target.sourceActors = target.sourceActors.filter(a=>!ownPeople.has(personKey(a)));
    target.nameAliases = [...new Set([...(target.nameAliases ?? []),source.characterName,source.originalCharacterName,...(source.nameAliases ?? [])].filter(Boolean))];
    target.sourceIds = {...target.sourceIds,
      egsCharacterIds:[...new Set([...(target.sourceIds?.egsCharacterIds ?? []),...(source.sourceIds?.egsCharacterIds ?? [])])],
      bangumi:[...(target.sourceIds?.bangumi ?? []),...(source.sourceIds?.bangumi ?? []).filter(a=>!(target.sourceIds?.bangumi ?? []).some(b=>a.subjectId===b.subjectId&&a.characterId===b.characterId))]};
    if (nativeNamespaceAlias) {
      target.sourceIds.vndbCharacterId ||= source.sourceIds.vndbCharacterId;
      target.metadata = {...source.metadata, ...target.metadata};
      target.originalCharacterName ||= source.originalCharacterName;
      target.sourceCastProvenance = [...(target.sourceCastProvenance ?? []), source];
    }
    for (const field of ['descriptions','profileFacts']) {
      const known = new Set((target[field] ?? []).map(x=>JSON.stringify(x)));
      target[field] = [...(target[field] ?? []),...(source[field] ?? []).filter(x=>!known.has(JSON.stringify(x)))];
    }
    target.image ||= source.image; target.genericImage ||= source.genericImage;
    if (source.editionParticipationConfirmed) { target.editionParticipationConfirmed = true; target.participationScope = 'edition'; }
    retired.add(source);
  }
  const alternate = mergeCreditPeople(otherCredits, {preserveScope:true}).map(p => ({...p,detail:undefined,
    sourceResponsibilityNotes:p.sourceCredits.filter(f => f.creditNoteOriginal)}));
  const projected=applyWorkContext({...sourceModel,presentationWorkId:ledger.edition.presentationWorkId,staff,cast:cast.filter(c=>!retired.has(c)),songs:(ledger.songs ?? sourceModel.songs ?? []).map(song=>correctSongUsage(song,wid)),
    unresolvedCast:[],unresolvedCredits:sourceCredits,unresolvedDisplayCredits:alternate,
    additionalVoiceCredits:mergeCreditPeople(unmatched),editionWorkId:wid,
    castSourcePresentationWorkId:ledger.edition.presentationWorkId,sourceModelIdentityMismatch:!sameWork},ledger.context);
  const excludesCast=c=>castExclusion?.presentationWorkId===ledger.edition.presentationWorkId&&castExclusion.excludedNativeCharacterIds.includes(c.sourceIds?.vndbCharacterId||c.characterId?.match(/^char_(?:vndb_)?(c\d+)$/u)?.[1]);
  return applyCharacterCoverage({...projected,sourceCastEditionProvenance:[...(projected.sourceCastEditionProvenance??[]),...projected.cast.filter(excludesCast)],nativeRelatedEntries:Object.values(catalog.nativeWorks??{}).filter(e=>e.baseEditionIds?.includes(wid)).map(e=>({entityId:e.entityId,title:e.title,releaseDate:e.releaseDate})),cast:projected.cast.filter(c=>!excludesCast(c)).map(c=>{
    const name=REVIEWED_WORK_CHARACTER_NAMES[`${wid}:${c.characterId}`];
    return name ? {...c,sourceCharacterName:c.sourceCharacterName||c.characterName,characterName:name,characterNameResolution:'reviewed-source-record'} : c;
  })},wid);
}

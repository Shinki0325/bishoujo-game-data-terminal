import { REVIEWED_CHARACTER_COVERAGE, REVIEWED_CHARACTER_APPEARANCE_CONTEXTS } from './reviewed-character-bindings.js';
const nativeId=id=>String(id??'').replace(/^char_vndb_(c\d+)$/u,'char_$1');
const hasPerson=(c,pid)=>(c.actors??[]).length>0&&(c.actors??[]).every(a=>a.personId===pid);

// Coverage does not resolve identity. Keep the aggregate archive and its raw
// credits, and suppress its extra card only while every reviewed appearance
// remains present with independently recorded, matching CV credits.
export function applyCharacterCoverage(model,wid){
  let cast=[...(model.cast??[])];const aggregateCast=[...(model.aggregateCast??[])],applied=[...(model.characterCoverage??[])];
  for(const rule of REVIEWED_CHARACTER_COVERAGE[String(wid)]??[]){
    const members=rule.members.map(m=>({rule:m,cast:cast.find(c=>nativeId(c.characterId)===nativeId(m.characterId))}));
    const parents=cast.filter(c=>rule.aggregateIds.includes(c.characterId));
    if(!parents.length||members.some(m=>!m.cast||!hasPerson(m.cast,rule.personId))||parents.some(c=>!hasPerson(c,rule.personId)))continue;
    const memberIds=members.map(m=>m.cast.characterId);
    for(const {rule:m,cast:c}of members)if(m.label)c.appearanceContext=m.label;
    aggregateCast.push(...parents.map(c=>({...c,coverageMemberIds:memberIds,coverageRuleId:rule.id})));
    cast=cast.filter(c=>!parents.includes(c));applied.push({...rule,members:members.map(m=>({...m.rule,characterId:m.cast.characterId}))});
  }
  cast=cast.map(c=>{const native=c.sourceIds?.vndbCharacterId||c.characterId?.match(/^char_(?:vndb_)?(c\d+)$/u)?.[1],label=REVIEWED_CHARACTER_APPEARANCE_CONTEXTS[`${wid}:${native}`];return label?{...c,appearanceContext:label}:c;});
  return {...model,cast,aggregateCast,characterCoverage:applied};
}

export function coveredTimelineCharacters(characters,workId){
  const rules=REVIEWED_CHARACTER_COVERAGE[String(workId)]??[];const present=new Set(characters.map(c=>nativeId(c.identity?.replace(/^canonical:/u,'')||c.characterId)));
  return characters.filter(c=>!rules.some(r=>r.aggregateIds.includes(c.identity?.replace(/^canonical:/u,'')||c.characterId)&&r.members.every(m=>present.has(nativeId(m.characterId)))))
    .map(c=>{const id=nativeId(c.identity?.replace(/^canonical:/u,'')||c.characterId);const label=rules.flatMap(r=>r.members).find(m=>nativeId(m.characterId)===id)?.label||REVIEWED_CHARACTER_APPEARANCE_CONTEXTS[`${workId}:${id.replace(/^char_/u,'')}`];return label?{...c,appearanceContext:label}:c;});
}

import { groupCharacterAppearances } from './character-display-policy.js';
import { REVIEWED_CHARACTER_COVERAGE, REVIEWED_PERSON_TIMELINE_DISPLAY_EQUIVALENCES } from './reviewed-character-bindings.js';
import { coveredTimelineCharacters } from './character-coverage.js';
const id=c=>c.identity?.replace(/^canonical:/u,'')||c.characterId;
const native=value=>String(value??'').replace(/^char_vndb_(c\d+)$/u,'char_$1');

// A timeline credit is a compact role summary, not a new identity assertion.
// Keep each underlying appearance ID in coverageMembers and every original
// fact in sourceCredits. An unspecified role must not choose a single stage.
export function personTimelineCharacterCoverage(characters,workId,personId){
  const rules=(REVIEWED_CHARACTER_COVERAGE[String(workId)]??[]).filter(r=>r.personId===personId);
  let rows=rules.length?coveredTimelineCharacters(characters,workId):characters;
  for(const rule of rules){
    const parents=rows.filter(c=>rule.aggregateIds.includes(id(c)));
    if(!parents.length)continue;
    const coveredIds=new Set(rule.members.map(m=>native(m.characterId)));
    const labels=[...new Set(rule.members.map(m=>m.label).filter(Boolean))];
    const summary={...parents[0],coverageMembers:rule.members,coverageRuleId:rule.id,
      ...(labels.length?{appearanceContext:labels.length<=2?labels.join('／'):'各篇'}:{})};
    rows=rows.flatMap(c=>c===parents[0]?[summary]:parents.includes(c)||coveredIds.has(native(id(c)))?[]:[c]);
  }
  // Compact reviewed same-edition role summaries while retaining every native
  // archive and source fact. A shared name alone never creates an equivalence.
  for(const rule of REVIEWED_PERSON_TIMELINE_DISPLAY_EQUIVALENCES){
    if(rule.workId!==String(workId)||rule.personId!==personId)continue;
    const members=rows.filter(c=>rule.memberIds.includes(id(c)));
    const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/gu,'');
    if(members.length!==rule.memberIds.length||new Set(members.map(id)).size!==rule.memberIds.length||members.some(c=>norm(c.name)!==norm(rule.name)||c.appearanceContext||c.coverageMembers?.length))continue;
    const target=members.find(c=>id(c)===rule.targetId);
    rows=rows.flatMap(c=>c===target?[{...c,displayMemberIds:rule.memberIds,displayEquivalenceId:rule.id}]:members.includes(c)?[]:[c]);
  }
  return groupCharacterAppearances(rows);
}

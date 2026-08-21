import assert from 'node:assert/strict';
import {
  adaptCharacterPageVM,
  adaptPersonPageVM,
  buildPersonCharacterProjections,
  resolveProjectEntityFeatureFlags,
} from './project-entity-consumer.js';

assert.equal(resolveProjectEntityFeatureFlags().personPageV1, false);
assert.equal(resolveProjectEntityFeatureFlags().characterPageV1, false);

const projections = buildPersonCharacterProjections([
  {
    workId: '10', editionId: 'ed-10', scope: 'edition',
    cast: [
      { vndbCharacterId: 'c1', characterName: '确认角色', role: 'primary', source: 'vndb', status: 'confirmed', privateReviewNote: 'PRIVATE-NOTE', rawUrl: 'https://private.invalid/character', candidateQueue: { secret: true }, aliases: [{ value: '别名甲', evidence: [{ source: 'vndb', sourceId: 'c1' }] }, { value: '无证据别名' }] , actors: [{ vndbStaffId: 's1', name: '演员甲', entityType: 'person', aliases: [{ value: '艺名', evidence: [{ source: 'vndb', claimId: 'claim-1' }] }], originalUrl: 'https://private.invalid/person' }, { vndbStaffId: 's9', name: '公司不应成为声优', entityType: 'company' }, { name: '未解析演员', entityType: 'person' }] },
      { vndbCharacterId: 'c2', characterName: '待审角色', status: 'needs-review', actors: [] },
      { vndbCharacterId: 'c3', characterName: '歧义角色', status: 'ambiguous', actors: [] },
      { vndbCharacterId: 'c4', characterName: '未返回声优角色', status: 'confirmed', actors: [] },
      { characterId: 'source-only-character', characterName: '未映射角色', status: 'unmapped', actors: [] },
    ],
    staff: { scenario: [{ creatorId: '1', name: '编剧甲' }] },
  },
  {
    workId: '11', editionEntityId: 'ed-11', scope: 'work',
    cast: [{ vndbCharacterId: 'c1', characterName: '确认角色', role: 'primary', actors: [{ vndbStaffId: 's1', name: '演员甲', entityType: 'person' }] }],
    staff: {},
  },
]);

const character = projections.characters.find(item => item.vndbCharacterId === 'c1');
assert.ok(character);
assert.equal(character.credits[0].scope, 'edition');
assert.equal(character.credits[1].scope, 'work');
assert.equal(character.aliases.length, 1);
assert.deepEqual(character.aliases[0].evidence, [{ source: 'vndb', id: 'c1' }]);
assert.equal(character.voiceActors.some(actor => actor.vndbStaffId === 's9'), false);
assert.equal(character.voiceActors.some(actor => actor.status === 'unmapped'), true);
assert.equal(character.statistics.confirmedVoiceActorCount, 2);
assert.equal(JSON.stringify(character).includes('PRIVATE-NOTE'), false);
assert.equal(JSON.stringify(character).includes('private.invalid'), false);

const noActor = projections.characters.find(item => item.vndbCharacterId === 'c2');
assert.equal(noActor.status, 'needs-review');
assert.equal(projections.characters.find(item => item.vndbCharacterId === 'c3').status, 'ambiguous');
assert.equal(projections.characters.find(item => item.vndbCharacterId === 'c4').status, 'source-not-returned');
const unresolved = projections.characters.find(item => item.characterName === '未映射角色');
assert.equal(unresolved.status, 'unmapped');
assert.equal(projections.persons.some(item => item.credits.some(credit => credit.creditType === 'staff')), true);
assert.equal(projections.statistics.confirmedVoiceActorCreditCount, 2);

const legacy = { title: 'legacy' };
assert.equal(adaptPersonPageVM({ personEntityId: 's1', legacy }).source, 'legacy');
const personVm = adaptPersonPageVM({ personEntityId: 's1', legacy, projection: { records: projections.persons }, featureFlags: { personPageV1: true } });
assert.equal(personVm.source, 'projected');
assert.equal(personVm.aliases.length, 1);
assert.equal(Object.hasOwn(personVm, 'candidateQueue'), false);
assert.equal(JSON.stringify(personVm).includes('private.invalid'), false);
assert.equal(personVm.statistics.confirmedCreditCount > 0, true);
const characterVm = adaptCharacterPageVM({ characterEntityId: character.characterEntityId, projection: { records: projections.characters }, featureFlags: { characterPageV1: true } });
assert.equal(characterVm.source, 'projected');
assert.equal(characterVm.voiceActors.every(actor => actor.entityType === 'person'), true);
assert.equal(projections.statistics.confirmedCharacterCount, 1);

console.log('M2 Person/Character focused checks: 21/21');

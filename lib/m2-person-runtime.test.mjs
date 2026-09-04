import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { createM2PersonRuntime } from './m2-person-runtime.js';

const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1');
const m1Root = path.resolve('../../blog-kb/backend/exports/terminal-wiki-m1-character-source-only-v1');
const bytes = file => file === 'm1-entities.json'
  ? fs.readFileSync(path.join(m1Root, 'entities.json'))
  : file === 'm1-voice-relations.json'
    ? fs.readFileSync(path.resolve('data/terminal-wiki-m1-person-source-only-v1/voice-relations.json'))
    : file === 'character-roles.json'
      ? fs.readFileSync(path.join(root, 'character-roles.json'))
  : fs.readFileSync(path.join(root, file));
const fetchImpl = async url => {
  const body = bytes(path.basename(new URL(url).pathname));
  return { ok: true, status: 200, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) };
};
const runtime = createM2PersonRuntime({
  manifestUrl: new URL('https://fixture/canonical-manifest.json'),
  entitiesUrl: new URL('https://fixture/entities.json'),
  relationsUrl: new URL('https://fixture/relations.json'),
  baseEntitiesUrl: new URL('https://fixture/m1-entities.json'),
  baseRelationsUrl: new URL('https://fixture/m1-voice-relations.json'),
  variantsUrl: new URL('https://fixture/name-variants.json'),
  characterRolesUrl: new URL('https://fixture/character-roles.json'),
  namePreferencesUrl: new URL('https://fixture/name-preferences.json'),
  crossSourceCrosswalkUrl: new URL('https://fixture/cross-source-crosswalk.json'),
  catalogWorks: [
    { workId: '21180', title: 'ソーサリージョーカーズ', releaseDate: '2015-07-24' },
    { workId: '16281', title: 'サンプル作品', releaseDate: '2008-07-25' },
    { workId: '3007', title: 'CROSS†CHANNEL', releaseDate: '2003-09-26' }
  ],
  fetchImpl,
  cryptoRef: webcrypto
});
const state = await runtime.load();
const stats = state.statistics;
assert.equal(stats.personCount, 10227);
assert.equal(stats.relationCount, 78011);
assert.equal(stats.creditedPersonCount > 0, true);
const voicePerson = state.records.find(item => item.credits.some(credit => credit.creditType === 'character-voiced-by'));
assert.ok(voicePerson);
assert.equal(voicePerson.credits.some(credit => credit.roleCode === 'voice-actor' && credit.characterId), true);
const person = state.records.find(item => item.credits.some(credit => credit.workId === '21180'));
assert.ok(person);
assert.equal(person.visibility, 'review');
assert.equal(Array.isArray(person.nameVariants), true);
const vndbAliasPerson = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's5'));
assert.equal(vndbAliasPerson.canonicalName, '田口 宏子');
assert.equal(vndbAliasPerson.nameVariants.length > 1, true);
assert.equal(vndbAliasPerson.credits.some(credit => credit.workId === '16281' && credit.title === 'サンプル作品'), true);
assert.equal(vndbAliasPerson.credits.some(credit => credit.workId === '16281' && credit.characterRole === 'primary'), true);
assert.equal(vndbAliasPerson.credits.every(credit => credit.title !== '未解析作品'), true);
assert.equal(state.search('田口宏子').some(item => item.entityId === vndbAliasPerson.entityId), true);
assert.equal(state.search('Taguchi Hiroko').some(item => item.entityId === vndbAliasPerson.entityId), true);
assert.equal(person.credits.some(credit => credit.title === 'ソーサリージョーカーズ'), true);
assert.equal(state.search(person.canonicalName)[0].entityId, person.entityId);
const mergedTaguchi = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's5'));
assert.equal(mergedTaguchi?.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '8073'), true);
assert.equal(mergedTaguchi?.credits.some(credit => credit.creditType === 'character-voiced-by'), true);
assert.equal(mergedTaguchi?.credits.length, 249);
assert.equal(state.records.some(item => item.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '8073') && item.entityId !== mergedTaguchi?.entityId), false);
const hokuto = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's113'));
assert.equal(hokuto?.displayName, '北都 南');
const hinano = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's272'));
assert.equal(hinano?.displayName, '榊原 ゆい');
const kanako = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's8737'));
assert.equal(kanako?.displayName, '夏和小');
assert.equal(kanako?.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '26545'), true);
assert.equal(state.records.some(item => item.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '26545') && item.entityId !== kanako?.entityId), false);
const noSharedAlias = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's2121'));
assert.equal(noSharedAlias?.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '10094'), true);
assert.equal(state.records.some(item => item.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '10094') && item.entityId !== noSharedAlias?.entityId), false);
const pon = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's828'));
const ponScenario = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '29864'));
assert.ok(pon);
assert.ok(ponScenario);
assert.equal(pon.sourceRefs.some(ref => ref.source === 'egs' && ref.id === '29864'), false);
assert.equal(ponScenario.entityId === pon.entityId, false);
const genericDeltaCreator = state.records.find(item => item.canonicalName === 'Low');
assert.deepEqual(genericDeltaCreator?.roleHints, []);
assert.equal(genericDeltaCreator?.credits.some(credit => credit.roleCode === 'voice-actor'), false);
const renaissance = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's990'));
assert.equal(renaissance?.credits.length > 0, true);
const suzukiMaika = state.records.find(item => item.sourceRefs.some(ref => ref.source === 'vndb' && ref.id === 's127'));
assert.equal(suzukiMaika?.canonicalName, '鈴木 舞香');
assert.equal(suzukiMaika?.credits.some(credit => credit.workId === '3007' && credit.characterRole === 'appears'), true);
const crossChannelCredits = state.records.flatMap(item => item.credits).filter(credit => credit.creditType === 'character-voiced-by' && credit.workId === '3007');
assert.equal(crossChannelCredits.length, 13);
assert.equal(new Set(crossChannelCredits.map(credit => credit.sourceCharacterId)).size, 11);
console.log('M2 person runtime checks: 7/7');

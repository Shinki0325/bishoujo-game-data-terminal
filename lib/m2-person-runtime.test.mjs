import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';
import { createM2PersonRuntime } from './m2-person-runtime.js';

const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1');
const m1Root = path.resolve('../../blog-kb/backend/exports/terminal-wiki-m1-character-source-only-v1');
const bytes = file => file === 'm1-entities.json'
  ? fs.readFileSync(path.join(m1Root, 'entities.json'))
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
  catalogWorks: [{ workId: '21180', title: 'ソーサリージョーカーズ', releaseDate: '2015-07-24' }],
  fetchImpl,
  cryptoRef: webcrypto
});
const stats = await runtime.inspect();
assert.equal(stats.personCount, 10693);
assert.equal(stats.relationCount, 32286);
assert.equal(stats.creditedPersonCount > 0, true);
const state = await runtime.load();
const person = state.records.find(item => item.credits.some(credit => credit.workId === '21180'));
assert.ok(person);
assert.equal(person.visibility, 'review');
assert.equal(person.credits.some(credit => credit.title === 'ソーサリージョーカーズ'), true);
assert.equal(state.search(person.canonicalName)[0].entityId, person.entityId);
console.log('M2 person runtime checks: 5/5');

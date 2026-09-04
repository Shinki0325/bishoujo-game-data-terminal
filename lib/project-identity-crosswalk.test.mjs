import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyProjectIdentityToCast, prepareProjectIdentityCrosswalk } from './project-identity-crosswalk.js';

const source = JSON.parse(fs.readFileSync(path.resolve('data/terminal-wiki-m2-person-source-only-v1/cross-source-crosswalk.json'), 'utf8'));
const identity = prepareProjectIdentityCrosswalk(source);
assert.equal(identity.personCount, 526);
assert.equal(identity.characterGroupCount, 14);
assert.equal(identity.actorCanonicalBySourceKey.get('egs:3360'), 'per_00000000099b');
assert.equal(identity.actorCanonicalBySourceKey.get('egs:5941'), 'per_000000000dd9');
assert.equal(identity.actorCanonicalBySourceKey.has('egs:11556'), false);
assert.equal(identity.actorCanonicalBySourceKey.has('egs:18577'), false);

const roleConflict = applyProjectIdentityToCast([
  { source: 'egs', characterId: 7266, characterName: '魔人 サテラ', role: 'メイン', actors: [{ creatorId: '5380', name: '北都南' }] },
  { source: 'vndb', characterId: 'c36806', vndbCharacterId: 'c36806', characterName: 'サテラ', role: 'side', actors: [{ vndbStaffId: 's113', name: '北都 南' }] },
], { workId: '22060', identityCrosswalk: identity, resolveImage: entry => ({ source: entry.source }) });
assert.equal(roleConflict.length, 1);
assert.equal(roleConflict[0].characterName, 'サテラ');
assert.equal(roleConflict[0].role, 'main');
assert.equal(roleConflict[0].actors.length, 1);
assert.equal(roleConflict[0].actors[0].vndbStaffId, 's113');
assert.equal(roleConflict[0].identity.members.length, 2);
assert.equal(roleConflict[0].image.source, 'vndb');

const venus = applyProjectIdentityToCast([
  { source: 'egs', characterId: 23647, characterName: 'アーシェラ・バランクール', role: 'メイン', actors: [{ creatorId: '13556', name: '手塚りょうこ' }] },
  { source: 'egs', characterId: 23648, characterName: 'アーシェラ・バランクール', role: 'メイン', actors: [{ creatorId: '13556', name: '手塚りょうこ' }] },
  { source: 'vndb', characterId: 'c100150', vndbCharacterId: 'c100150', characterName: 'アーシェラ・バランクール', role: 'primary', actors: [{ vndbStaffId: 's646', name: '手塚 りょうこ' }] },
  { source: 'vndb', characterId: 'c103971', vndbCharacterId: 'c103971', characterName: 'アーシェラ・バランクール', role: 'primary', actors: [{ vndbStaffId: 's646', name: '手塚 りょうこ' }] },
], { workId: '31428', identityCrosswalk: identity });
assert.equal(venus.length, 1);
assert.equal(venus[0].identity.members.length, 4);
assert.equal(venus[0].actors.length, 1);
assert.equal(venus[0].characterId, 'c100150');

const untouched = applyProjectIdentityToCast([{ source: 'vndb', characterId: 'c57', characterName: '近衛 素奈緒', actors: [] }], { workId: '4887', identityCrosswalk: identity });
assert.equal(untouched.length, 1);
assert.equal(untouched[0].characterId, 'c57');
console.log('project identity crosswalk: 17/17');

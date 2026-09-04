import assert from 'node:assert/strict';
import { personNameVariantCount, personNameVariantLabels } from './person-name-variants.js';

const person = {
  nameVariants: [
    { name: '成瀬 未亜', latin: 'Naruse Mia' },
    { name: '井上 ねねこ', latin: 'Inoue Neneko' },
    { name: '成瀬 未亜', latin: 'Naruse Mia' }
  ],
  aliases: ['成瀬 未亜', '井上 ねねこ', 'Naruse Mia', 'Inoue Neneko']
};

assert.deepEqual(personNameVariantLabels(person), ['成瀬 未亜', '井上 ねねこ']);
assert.equal(personNameVariantCount(person), 2, 'romanizations and duplicate alias carriers are not separate 名义');
assert.deepEqual(personNameVariantLabels({ aliases: ['榊原 ゆい', '榊原 ゆい', 'Hinano'] }), ['榊原 ゆい', 'Hinano']);
assert.equal(personNameVariantCount({ aliases: ['榊原 ゆい', '榊原 ゆい', 'Hinano'] }), 2, 'alias-only persons keep distinct displayed names');
assert.equal(personNameVariantCount({ nameVariantCount: 13 }), 13, 'directory summaries keep the precomputed count');
assert.equal(personNameVariantCount({}), 0);

console.log('person name variant tests passed: 6/6');

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveKeeperPortrait } from './keeper-guide-assets.js';
const guide = { showEnhancement: true, showPortrait: true, expression: 'smile' };
test('eligible scene gets a local avatar and DPR alternatives', () => {
  const asset = resolveKeeperPortrait(guide);
  assert.match(asset.src, /brand\/keeper\/shiori-smile-avatar.webp$/);
  assert.match(asset.srcSet, /avatar@2x.webp 2x$/);
  assert.equal(asset.width, asset.height);
  assert.equal(asset.alt, '');
});
test('comparison bust preserves 4:5 geometry', () => {
  const asset = resolveKeeperPortrait({ ...guide, expression: 'neutral' }, { variant: 'bust' });
  assert.match(asset.src, /neutral-bust.webp$/); assert.equal(asset.width / asset.height, .8);
});
test('feature, preference, dismissal and first-drag suppress all URLs', () => {
  assert.equal(resolveKeeperPortrait(guide, { enabled: false }), null);
  for (const value of [null, {...guide, showPortrait:false}, {...guide,showEnhancement:false}, {...guide,expression:'none'}, {...guide,expression:'../surprised'}]) assert.equal(resolveKeeperPortrait(value), null);
  assert.equal(resolveKeeperPortrait(guide, {variant:'full-body'}), null);
});

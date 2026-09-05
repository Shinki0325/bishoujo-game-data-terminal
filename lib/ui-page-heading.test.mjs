import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHeadingCount, syncHeadingCount, syncLocalFeedback } from './ui-page-heading.js';

test('heading counts distinguish unknown from zero and format full populations', () => {
  for (const value of [null, undefined, NaN, -1, 0.5, '1000']) assert.equal(formatHeadingCount(value, '位人物'), '加载中…');
  for (const [value, expected] of [[0,'0'],[999,'999'],[1000,'1,000'],[10000,'10,000']]) assert.equal(formatHeadingCount(value, '位人物'), `${expected} 位人物`);
});
test('local feedback avoids rewriting unchanged live-region text', () => {
  let value='',writes=0;
  const element={get textContent(){return value},set textContent(next){value=next;writes++}};
  syncHeadingCount(element,1000,'部作品');syncHeadingCount(element,1000,'部作品');
  assert.equal(writes,1);assert.equal(value,'1,000 部作品');
  syncLocalFeedback(element,'找到 2 部作品');syncLocalFeedback(element,'找到 2 部作品');
  assert.equal(writes,2);syncHeadingCount(null,10,'家会社');syncLocalFeedback(null,'');
});

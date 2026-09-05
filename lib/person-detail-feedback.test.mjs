import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../views/person-directory-view.js', import.meta.url), 'utf8');

test('person detail loading deduplicates the same person and keeps displayed detail stable', () => {
  assert.match(source, /let detailInFlight = null;/);
  assert.match(source, /detailInFlight\?\.personId === personId[\s\S]*detailInFlight\.request === detailRequest/);
  assert.match(source, /detailDisplayedId === personId && detailInFlight === null/);
  assert.match(source, /flight\.promise = promise;/);
});

test('person detail reload restores tab, timeline sort, and id-less controls through tokens', () => {
  assert.match(source, /function captureDetailViewState\(\)/);
  assert.match(source, /timelineSortKey/);
  assert.match(source, /function restoreDetailViewState\(state\)/);
  assert.match(source, /dataset\?\.detailFocusToken/);
  assert.match(source, /dataset\.detailFocusToken = 'timeline-sort'/);
  assert.match(source, /dataset\.detailFocusToken = 'timeline-direction'/);
  assert.match(source, /dataset\.detailFocusToken = credit\.workId \? `timeline-work:/);
  assert.match(source, /restoreDetailViewState\(viewState\)/);
});

test('Escape shares the user close path while programmatic close only invalidates', () => {
  assert.match(source, /function invalidateDetailRequest\(\)[\s\S]*detailInFlight = null;[\s\S]*detailDisplayedId = null/);
  assert.match(source, /function closeDetailFromUser\(\)[\s\S]*if \(dialog\?\.open\) dialog\.close\(\)[\s\S]*onSelect\?\.\(null\)/);
  assert.match(source, /closeDetailFromUser\(\)[\s\S]*invalidateDetailRequest\(\)/);
  assert.match(source, /dialog\?\.addEventListener\('cancel', event => \{\s*event\.preventDefault\(\);\s*closeDetailFromUser\(\);/);
  assert.match(source, /close\?\.addEventListener\('click', closeDetailFromUser\)/);
  const closeBlockStart = source.indexOf("dialog?.addEventListener('close'");
  const renderDetailStart = source.indexOf('function renderDetail');
  assert.ok(closeBlockStart >= 0 && renderDetailStart > closeBlockStart);
  assert.doesNotMatch(source.slice(closeBlockStart, renderDetailStart), /onSelect/);
  assert.match(source.slice(closeBlockStart, renderDetailStart), /if \(dialog\.open\) return;/);
});

console.log('GALPEDIA person detail feedback contract: 3/3');

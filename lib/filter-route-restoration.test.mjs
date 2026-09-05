import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');

test('works route restoration clears stale filter draft before applying URL state', () => {
  const restoreIndex = source.indexOf('controller.setFilterState({ titleQuery: location.query, sortKey, sortDirection });');
  const clearIndex = source.lastIndexOf('controller.clearFilters();', restoreIndex);

  assert.ok(clearIndex >= 0, 'works route should clear stale filters');
  assert.ok(restoreIndex > clearIndex, 'URL state should be applied after clearing stale filters');
});

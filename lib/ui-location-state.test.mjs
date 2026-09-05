import assert from 'node:assert/strict';
import test from 'node:test';
import { formatUiLocationHash, parseUiLocationHash } from './ui-location-state.js';

test('company sort location accepts both directions for every supported key', () => {
  for (const value of [
    'totalVoteCount-asc', 'totalVoteCount-desc',
    'workCount-asc', 'workCount-desc',
    'averageVoteCount-asc', 'averageVoteCount-desc',
    'releaseYearStart-asc', 'releaseYearStart-desc',
    'brandName-asc', 'brandName-desc'
  ]) {
    assert.equal(parseUiLocationHash(`#companies?sort=${value}`).sort, value);
    const expected = value === 'totalVoteCount-desc' ? '#companies' : `#companies?sort=${value}`;
    assert.equal(formatUiLocationHash({ page: 'companies', sort: value }), expected);
  }
});

test('company sort location preserves the historical default and rejects unknown values', () => {
  assert.equal(parseUiLocationHash('#companies').sort, 'totalVoteCount-desc');
  assert.equal(formatUiLocationHash({ page: 'companies', sort: 'totalVoteCount-desc' }), '#companies');
  assert.equal(parseUiLocationHash('#companies?sort=unknown-asc').sort, 'totalVoteCount-desc');
  assert.equal(formatUiLocationHash({ page: 'companies', sort: 'unknown-asc' }), '#companies');
});

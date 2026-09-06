import assert from 'node:assert/strict';
import test from 'node:test';
import { createQueryIndex, projectedCountsForIndex, queryIndexedCatalog } from './query-index.js';
import {
  createPersonWorkIndex,
  PERSON_WORK_INDEX_FORMAT,
  personWorkIndexStats
} from './person-work-index.js';

const works = [
  { workId: '1', title: 'Voice work', brandId: 'a', median: 80, voteCount: 100, releaseDate: '2001-01-01', filterIds: [], genreFilterIds: [], platformFilterId: 'platform-pc' },
  { workId: '2', title: 'Scenario work', brandId: 'a', median: 80, voteCount: 100, releaseDate: '2002-01-01', filterIds: [], genreFilterIds: [], platformFilterId: 'platform-pc' },
  { workId: '3', title: 'Shared work', brandId: 'b', median: 80, voteCount: 100, releaseDate: '2003-01-01', filterIds: [], genreFilterIds: [], platformFilterId: 'platform-pc' },
  { workId: '4', title: 'Uncredited work', brandId: 'c', median: 80, voteCount: 100, releaseDate: '2004-01-01', filterIds: [], genreFilterIds: [], platformFilterId: 'platform-pc' }
];

const personRecords = [
  {
    entityId: 'per_alpha',
    credits: [
      { workId: '1', creditType: 'character-voiced-by', roleCode: 'voice-actor' },
      { workId: '3', creditType: 'work-credits-person', roleCode: 'scenario' },
      { workId: 'missing', creditType: 'work-credits-person', roleCode: 'music' }
    ]
  },
  {
    entityId: 'per_beta',
    credits: [
      { workId: '2', creditType: 'work-credits-person', roleCode: 'scenario' },
      { workId: '3', creditType: 'character-voiced-by', roleCode: 'voice-actor' }
    ]
  }
];

const personWorkIndex = createPersonWorkIndex(personRecords, {
  workIds: works.map(work => work.workId)
});

const baseState = {
  mode: 'basic', titleQuery: '', minimumScore: 0, minimumVoteCount: 0,
  releaseYearStart: 1987, releaseYearEnd: 2026, brandIds: [],
  attributeSelections: { 'game-type': [], platform: [], length: [] },
  basicOperator: 'AND', positiveFilterIds: [], excludedFilterIds: [],
  excludeNukige: false, advancedExpression: '', sortKey: 'releaseDate', sortDirection: 'asc',
  personIds: []
};

function index() {
  return createQueryIndex({
    works,
    knownFilterIds: [],
    brands: [],
    personWorkIndex: { ...personWorkIndex, workOrder: [...personWorkIndex.workOrder] }
  });
}

test('person reverse index keeps only canonical person, role, and catalogue work ids', () => {
  assert.equal(personWorkIndex.format, PERSON_WORK_INDEX_FORMAT);
  assert.deepEqual(personWorkIndex.persons, {
    per_alpha: { 'voice-actor': ['1'], scenario: ['3'] },
    per_beta: { 'voice-actor': ['3'], scenario: ['2'] }
  });
  assert.deepEqual(personWorkIndexStats(personWorkIndex), {
    personCount: 2, relationCount: 4, workCount: 3
  });
});

test('person condition matches selected people with OR semantics', () => {
  const result = queryIndexedCatalog(index(), { ...baseState, personIds: ['per_alpha', 'per_beta'] });
  assert.deepEqual(result.map(work => work.workId), ['1', '2', '3']);
});

test('person role narrows selected people without exposing character entities', () => {
  const query = { ...baseState, personIds: ['per_alpha', 'per_beta'], personRole: 'voice-actor' };
  assert.deepEqual(queryIndexedCatalog(index(), query).map(work => work.workId), ['1', '3']);
  assert.deepEqual(
    queryIndexedCatalog(index(), { ...query, personRole: 'scenario' }).map(work => work.workId),
    ['2', '3']
  );
});

test('year distribution uses the active person condition', () => {
  const counts = projectedCountsForIndex(index(), {
    ...baseState,
    personIds: ['per_alpha'],
    personRole: 'voice-actor'
  }).yearCounts;
  assert.equal(counts[2001], 1);
  assert.equal(counts[2002] ?? 0, 0);
  assert.equal(counts[2003] ?? 0, 0);
});

test('a person condition fails closed when the reverse index is unavailable', () => {
  const noPersonIndex = createQueryIndex({ works, knownFilterIds: [], brands: [] });
  assert.deepEqual(
    queryIndexedCatalog(noPersonIndex, { ...baseState, personIds: ['per_alpha'] }),
    []
  );
});

test('person reverse index must use the catalog work order when pinned', () => {
  assert.throws(
    () => createQueryIndex({
      works,
      knownFilterIds: [],
      personWorkIndex: { ...personWorkIndex, workOrder: ['2', '1', '3', '4'] }
    }),
    /workOrder must match/
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createQueryIndex, queryIndexedCatalog, projectedCountsForIndex } from './query-index.js';

const works = [
  { workId: '1', title: '成瀬未亜', brandId: 'a', median: 80, voteCount: 100, releaseDate: '2001-01-01', filterIds: [], genreFilterIds: [], platformFilterId: 'platform-pc' },
  { workId: '2', title: 'Other work', brandId: 'a', median: 70, voteCount: 50, releaseDate: '2002-01-01', filterIds: [], genreFilterIds: [], platformFilterId: 'platform-pc' }
];
const state = {
  mode:'basic',titleQuery:'',minimumScore:0,minimumVoteCount:30,
  releaseYearStart:1987,releaseYearEnd:2026,brandIds:[],
  attributeSelections:{'game-type':[],platform:[],length:[]},
  basicOperator:'AND',positiveFilterIds:[],excludedFilterIds:[],
  excludeNukige:false,advancedExpression:'',sortKey:'voteCount',sortDirection:'desc',personIds:[]
};
test('default results and facet counts do not construct text search carriers', () => {
  let reads = 0;
  const index = createQueryIndex({works,knownFilterIds:[],workAliasesById:{get(){reads++;return [];}}});
  assert.equal(reads,0);
  assert.deepEqual(queryIndexedCatalog(index,state).map(w=>w.workId),['1','2']);
  projectedCountsForIndex(index,state,[]);
  assert.equal(reads,0);
});
test('lazy CJK, aliases and pinyin searches preserve eager results and reuse carriers', () => {
  const options={works,knownFilterIds:[],workAliasesById:new Map([['1',['测试别名']]])};
  const eager=createQueryIndex(options),lazy=createQueryIndex(options);
  void eager.normalizedTitles;void eager.normalizedLooseTitles;void eager.pinyinTitles;
  for(const query of ['成濑','测试别名','chenglai','Other','no_match']) {
    assert.deepEqual(queryIndexedCatalog(lazy,{...state,titleQuery:query}).map(w=>w.workId),queryIndexedCatalog(eager,{...state,titleQuery:query}).map(w=>w.workId));
  }
  assert.equal(lazy.normalizedTitles,lazy.normalizedTitles);
  assert.ok(Object.isFrozen(lazy.pinyinTitles));
});

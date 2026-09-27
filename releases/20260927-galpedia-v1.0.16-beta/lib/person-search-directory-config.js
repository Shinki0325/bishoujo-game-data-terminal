import { PERSON_DIRECTORY_INDEX } from './full-wiki-person-directory-index-config.js';

export const PERSON_SEARCH_DIRECTORY = Object.freeze({
  enabled: true,
  schemaVersion: 'terminal-wiki-person-search-directory-v1',
  url: '../runtime-data/person-search-index-v1/person-search.7b57f98ab4a5edd3.json',
  sha256: '7b57f98ab4a5edd3bb0707ea4c60f3879a1895440f0c7d555d17a7d06f7d02a5',
  bytes: 12333250,
  directoryManifestSha256: '466c7c0c6adba9312d456a51019575656fd124a850cd06194bf587d8b8471e35',
  sourceManifestSha256: 'ae82bc6ed5b4f295a14d81634259f7f4437773833a7e8a211914234fa51892ca',
  sourceIndexSha256: PERSON_DIRECTORY_INDEX.sha256,
  sourceIndexBytes: PERSON_DIRECTORY_INDEX.bytes,
  personWorkIndexSourceManifestSha256: '0c95e7e8e7753e94f7e8400264c7e1da1aaff0b69f91b77c6449101e8e799d3b',
  personWorkIndexSha256: '9ca195220b546b43b5d59a75b174ef7b162d61dfc1154d3992bfd75192b7574c',
  personWorkIndexBytes: 5420215,
  counts: Object.freeze({persons: 53075, indexedPersons: 34793}),
  columns: Object.freeze(["entityId","canonicalEntityId","displayName","canonicalName","aliases","nameVariants","roles","primaryRole","searchKey","pinyinSearchKey","hasWorkRelations"]),
  yieldEvery: 512
});

if (PERSON_DIRECTORY_INDEX.directoryManifestSha256 !== PERSON_SEARCH_DIRECTORY.directoryManifestSha256
  || PERSON_DIRECTORY_INDEX.sourceManifestSha256 !== PERSON_SEARCH_DIRECTORY.sourceManifestSha256
  || PERSON_DIRECTORY_INDEX.schemaVersion !== 'terminal-wiki-person-directory-index-v2') {
  throw new TypeError('人物轻量检索配置与原始人物索引绑定不一致');
}

import { PERSON_DIRECTORY_INDEX } from './full-wiki-person-directory-index-config.js';

export const PERSON_SEARCH_DIRECTORY = Object.freeze({
  enabled: true,
  schemaVersion: 'terminal-wiki-person-search-directory-v1',
  url: '../runtime-data/effective-person-work-index-v1/search.json',
  sha256: '42cbae12d47573c232ec87af431fdf57f18c32fe7422504daf1037ccc78371d1',
  bytes: 13459898,
  directoryManifestSha256: '466c7c0c6adba9312d456a51019575656fd124a850cd06194bf587d8b8471e35',
  sourceManifestSha256: 'ae82bc6ed5b4f295a14d81634259f7f4437773833a7e8a211914234fa51892ca',
  sourceIndexSha256: PERSON_DIRECTORY_INDEX.sha256,
  sourceIndexBytes: PERSON_DIRECTORY_INDEX.bytes,
  personWorkIndexSourceManifestSha256: 'd145e8184971f0f6b57440d328a3c8ec57dbb35a992e9758789884cf0df9c035',
  personWorkIndexSha256: '4fa7c97862dfe6bb79eb60ef84d1663eb64523c4de38ac86d891237f2ed1660d',
  personWorkIndexBytes: 16348110,
  counts: Object.freeze({persons: 55524, indexedPersons: 55499}),
  columns: Object.freeze(["entityId","canonicalEntityId","displayName","canonicalName","aliases","nameVariants","roles","primaryRole","searchKey","pinyinSearchKey","hasWorkRelations"]),
  yieldEvery: 512
});

if (PERSON_DIRECTORY_INDEX.directoryManifestSha256 !== PERSON_SEARCH_DIRECTORY.directoryManifestSha256
  || PERSON_DIRECTORY_INDEX.sourceManifestSha256 !== PERSON_SEARCH_DIRECTORY.sourceManifestSha256
  || PERSON_DIRECTORY_INDEX.schemaVersion !== 'terminal-wiki-person-directory-index-v2') {
  throw new TypeError('人物轻量检索配置与原始人物索引绑定不一致');
}

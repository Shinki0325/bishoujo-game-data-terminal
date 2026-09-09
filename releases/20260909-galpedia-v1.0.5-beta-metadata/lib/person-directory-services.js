import { getPersonWorkspaceRuntime } from './person-workspace-data.js';
import { createM2PersonRuntime } from './m2-person-runtime.js?v=20260904-m2-identity-character-image-v1';
import { createPersonWorkIndexRuntime } from './person-work-index-runtime.js';
import { DATA_URLS, RUNTIME_FEATURES, RUNTIME_DATA_CACHE_MODE,
  M1_PERSON_ONLY_ENTITIES_SHA256, M1_PERSON_VOICE_RELATIONS_SHA256,
  PERSON_WORK_INDEX_SHA256 } from './runtime-config.js?v=a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';

// Configures existing services without fetching. The filter index is published
// only after the Worker accepts it; failed registration can be retried.
export function createPersonDirectoryServices({
  workerOwned, catalogWorks, loadCatalogWorks, locationSearch = '',
  ensureWorker, updateWorker,
  fetchImpl = globalThis.fetch, cryptoRef = globalThis.crypto,
  features = RUNTIME_FEATURES,
  getPerformanceRuntime = getPersonWorkspaceRuntime,
  createCoreRuntime = createM2PersonRuntime,
  createIndexRuntime = createPersonWorkIndexRuntime
}) {
  let personRuntime = null;
  let personPerformanceRuntime = null;
  let personWorkIndexRuntime = null;
  if (features.personDirectoryV1?.enabled === true) {
    if (features.personDirectoryV1.performanceCandidate === true
      && !new URLSearchParams(locationSearch).has('skipPersonPerformance')) {
      personPerformanceRuntime = getPerformanceRuntime();
    }
    personRuntime = createCoreRuntime({
      manifestUrl: DATA_URLS.m2PersonManifest,
      entitiesUrl: DATA_URLS.m2PersonEntities,
      relationsUrl: DATA_URLS.m2PersonRelations,
      baseEntitiesUrl: DATA_URLS.m1PersonEntities,
      baseEntitiesSha256: M1_PERSON_ONLY_ENTITIES_SHA256,
      baseRelationsUrl: DATA_URLS.m1PersonVoiceRelations,
      baseRelationsSha256: M1_PERSON_VOICE_RELATIONS_SHA256,
      variantsUrl: DATA_URLS.m2PersonNameVariants,
      characterRolesUrl: DATA_URLS.m2PersonCharacterRoles,
      namePreferencesUrl: DATA_URLS.m2PersonNamePreferences,
      crossSourceCrosswalkUrl: DATA_URLS.m2PersonCrossSourceCrosswalk,
      catalogWorks: workerOwned ? [] : catalogWorks,
      loadCatalogWorks: workerOwned ? loadCatalogWorks : null,
      fetchImpl,
      cryptoRef,
      cacheMode: RUNTIME_DATA_CACHE_MODE
    });
    if (features.personFilterV1?.enabled === true) {
      personWorkIndexRuntime = createIndexRuntime({
        indexUrl: DATA_URLS.personWorkIndex,
        sha256: PERSON_WORK_INDEX_SHA256,
        fetchImpl,
        cryptoRef,
        cacheMode: RUNTIME_DATA_CACHE_MODE
      });
    }
  }
  let personWorkIndex = null;
  let personWorkIndexPromise = null;
  async function ensureFilterIndex() {
    if (personWorkIndex !== null) return personWorkIndex;
    if (personWorkIndexRuntime === null) throw new Error('人物筛选索引不可用');
    if (personWorkIndexPromise !== null) return personWorkIndexPromise;
    personWorkIndexPromise = personWorkIndexRuntime.load()
      .then(async index => {
        await ensureWorker();
        await updateWorker(index);
        personWorkIndex = index;
        return index;
      })
      .catch(error => {
        personWorkIndexPromise = null;
        throw error;
      });
    return personWorkIndexPromise;
  }
  return Object.freeze({
    core: personRuntime, performance: personPerformanceRuntime,
    ensureFilterIndex,
    get filterIndex() { return personWorkIndex; }
  });
}

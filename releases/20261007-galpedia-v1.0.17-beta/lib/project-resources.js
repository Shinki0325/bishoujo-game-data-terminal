import { createLazyResource } from './lazy-resource.js';
import { loadRuntimeSource } from './runtime-source-cache.js';
import { prepareCharacterImageMap } from './character-image-map.js';
import { prepareProjectIdentityCrosswalk } from './project-identity-crosswalk.js';
import {
  DATA_URLS, RUNTIME_FEATURES, DATA_REVISION, MEDIA_CLEARANCE_BRIDGE_SHA256,
  CHARACTER_IMAGE_MAP_SHA256, CHARACTER_IMAGE_ALIAS_MAP_SHA256,
  CHARACTER_IMAGE_MAP_SNAPSHOT_ID, M2_PERSON_CROSS_SOURCE_CROSSWALK_SHA256
} from './runtime-config.js';

function loadProjectRuntimeModule(attempt) {
  return attempt === 0 ? import('./project-entity-runtime.js') : import(`./project-entity-runtime.js?retry=${attempt}`);
}

// These resources outlive individual views. Callers abandon their own observers,
// not shared reads. Optional mappings recover as null and retry on the next call;
// the required media proof rejects and is retried by createLazyResource.
export function createProjectResources({
  catalogSource,
  requiresCatalogFetch = false,
  fetchSource = loadRuntimeSource,
  cryptoRef = globalThis.crypto,
  features = RUNTIME_FEATURES,
  loadRuntimeModule = loadProjectRuntimeModule,
  logger = console
}) {
  let characterImageMapPromise = null;
  const loadCharacterImageMap = () => {
    if (!(features.projectEntitiesV1.enabled && features.projectEntitiesV1.characterImages)) {
      return Promise.resolve(null);
    }
    if (characterImageMapPromise === null) {
      characterImageMapPromise = Promise.all([
        fetchSource(DATA_URLS.characterImageMap, '角色图片映射'),
        fetchSource(DATA_URLS.characterImageAliasMap, '角色图片别名映射')
      ])
        .then(([source, aliasSource]) => {
          if (source.sha256 !== CHARACTER_IMAGE_MAP_SHA256) {
            throw new TypeError('character image map hash does not match the runtime pin');
          }
          if (aliasSource.sha256 !== CHARACTER_IMAGE_ALIAS_MAP_SHA256) {
            throw new TypeError('character image alias map hash does not match the runtime pin');
          }
          return prepareCharacterImageMap(source.value, {
            snapshotId: CHARACTER_IMAGE_MAP_SNAPSHOT_ID,
            aliases: aliasSource.value,
            sourceMapSha256: source.sha256
          });
        })
        .catch(error => {
          logger.warn('character image map unavailable; keeping character images disabled', error);
          characterImageMapPromise = null;
          return null;
        });
    }
    return characterImageMapPromise;
  };
  let projectIdentityCrosswalkPromise = null;
  const loadProjectIdentityCrosswalk = () => {
    if (projectIdentityCrosswalkPromise === null) {
      projectIdentityCrosswalkPromise = fetchSource(DATA_URLS.m2PersonCrossSourceCrosswalk, '人物角色身份映射')
        .then(source => {
          if (source.sha256 !== M2_PERSON_CROSS_SOURCE_CROSSWALK_SHA256) {
            throw new TypeError('project identity crosswalk hash does not match the runtime pin');
          }
          return prepareProjectIdentityCrosswalk(source.value);
        })
        .catch(error => {
          logger.warn('project identity crosswalk unavailable; keeping source rows separate', error);
          projectIdentityCrosswalkPromise = null;
          return null;
        });
    }
    return projectIdentityCrosswalkPromise;
  };
  let projectEntityRuntime = null;
  const ensureProjectEntityRuntime = createLazyResource(async attempt => {
    if (!(features.projectEntitiesV1.enabled && features.projectEntitiesV1.mediaClearance)) return null;
    try {
      const [mediaClearanceBridgeSource, module, proofCatalog] = await Promise.all([
        fetchSource(DATA_URLS.mediaClearanceBridge, 'G1 media clearance bridge'),
        loadRuntimeModule(attempt),
        requiresCatalogFetch ? fetchSource(DATA_URLS.catalog, '作品详情校验目录') : Promise.resolve(catalogSource)
      ]);
      if (mediaClearanceBridgeSource.sha256 !== MEDIA_CLEARANCE_BRIDGE_SHA256) {
        throw new TypeError('G1 media clearance bridge hash does not match the runtime pin');
      }
      if (proofCatalog.sha256 !== catalogSource.sha256) throw new TypeError('workbench detail catalog hash mismatch');
      projectEntityRuntime = await module.createProjectEntityRuntime({
        bridge: mediaClearanceBridgeSource.value,
        catalog: { ...proofCatalog.value, catalogSha256: proofCatalog.sha256 },
        dataRevision: DATA_REVISION,
        cryptoRef
      });
      logger.info('G1 media clearance bridge applied', projectEntityRuntime.audit);
      return projectEntityRuntime;
    } catch (error) {
      throw new TypeError('G1 media clearance bridge rejected', { cause: error });
    }
  });

  return Object.freeze({
    loadCharacterImages: loadCharacterImageMap,
    loadIdentityCrosswalk: loadProjectIdentityCrosswalk,
    ensureRuntime: ensureProjectEntityRuntime,
    get current() { return projectEntityRuntime; }
  });
}

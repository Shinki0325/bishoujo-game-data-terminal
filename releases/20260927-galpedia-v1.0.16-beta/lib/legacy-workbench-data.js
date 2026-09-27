import { mergeVndbAdmissionsIntoFixture } from './catalog-admissions.js';
import { prepareEnrichmentSidecar } from './enrichment-sidecar.js';
import { prepareBangumiPublicBindingsCarrier } from './bangumi-public-bindings.js';
import { prepareBangumiCanonicalAliasFallback } from './bangumi-canonical-alias-fallback.js';
import { prepareCompanyProfileSidecar } from './company-profile-sidecar.js';
import { prepareVndbRatingsSidecar } from './vndb-ratings.js';
import { prepareBangumiRatingsSidecar } from './bangumi-ratings.js';
import { createRuntimePopulationContract } from './population-contract.js';
import { createWeightedRatingSort } from './rating-sort.js';
import { projectWorkWithVndbRating } from './vndb-rating-view.js';
import { projectWorkWithBangumiRating } from './bangumi-rating-view.js';
import {
  applyAuthorityFanoutMediaToWork,
  prepareAuthorityFanoutMediaProjection,
  prepareAuthorityFanoutPageBindings
} from './authority-fanout.js';
import { loadRuntimeSource } from './runtime-source-cache.js';
import { prepareRuntimeSample } from './runtime-sample.js';
import { fetchStagedRuntimeCoreSources } from './runtime-core-sources.js';
import {
  restrictAssetsManifestToCatalog,
  projectBrandsWithAliases,
  projectWorkWithDisplayTitle,
  applyBangumiCanonicalAliasFallback
} from './workbench-data-projection.js';
import { DATA_URLS, RUNTIME_FEATURES, BANGUMI_PUBLIC_BINDINGS_SHA256, MEDIA_CLEARANCE_BRIDGE_SHA256, DATA_REVISION } from './runtime-config.js';

// Data assembly owns validation and projection, never the page or Worker session.
// The caller supplies startup measurements and the browser diagnostic sink.
export async function loadLegacyWorkbenchData({
  startupMetrics,
  fetchSource = loadRuntimeSource,
  features = RUNTIME_FEATURES,
  publishDiagnostics = () => {}
}) {
  const [
    coreSources,
    [
      filterAuthoritySource,
      workGroupAuthoritySource,
      reviewQueueSource,
      enrichmentSource,
      companyProfileSource,
      presentationFamiliesSource,
      bangumiPublicBindingsSource,
      vndbRatingsSource,
      bangumiRatingsSource,
      bangumiCanonicalAliasFallbackSource,
      authorityFanoutSource
    ]
  ] = await startupMetrics.measureAsync('runtime-fetch-and-parse', () => Promise.all([
    fetchStagedRuntimeCoreSources({
      fetchRequired: fetchSource,
      catalogUrl: DATA_URLS.catalog,
      admissionsUrl: DATA_URLS.vndbAdmissions,
      indexesUrl: DATA_URLS.indexes,
      assetsManifestUrl: DATA_URLS.assetsManifest
    }),
    Promise.all([
      fetchSource(DATA_URLS.filterAuthority, '筛选权威'),
      fetchSource(DATA_URLS.workGroups, '作品组权威'),
      fetchSource(DATA_URLS.workGroupReviewQueue, '作品组 review queue'),
      fetchSource(DATA_URLS.enrichment, 'alias enrichment sidecar'),
      fetchSource(DATA_URLS.companyProfile, 'company profile sidecar'),
      fetchSource(DATA_URLS.presentationFamilies, 'presentation families sidecar'),
      features.bangumiPublicBindingsV1.enabled
        ? fetchSource(DATA_URLS.bangumiPublicBindings, 'Bangumi public bindings carrier')
        : Promise.resolve(null),
      features.vndbRatingsV1.enabled
        ? fetchSource(DATA_URLS.vndbRatings, 'VNDB ratings sidecar')
        : Promise.resolve(null),
      features.bangumiRatingsV1.enabled
        ? fetchSource(DATA_URLS.bangumiRatings, 'Bangumi ratings sidecar')
        : Promise.resolve(null),
      features.bangumiCanonicalAliasFallbackV1.enabled
        ? fetchSource(DATA_URLS.bangumiCanonicalAliasFallback, 'Bangumi canonical alias fallback')
        : Promise.resolve(null),
      features.authorityFanoutV1.enabled
        ? fetchSource(DATA_URLS.authorityFanout, 'authority fanout projection')
        : Promise.resolve(null)
    ])
  ]));
  const {
    catalogSource,
    admissions,
    backendIndexesSource,
    assetsManifestSource
  } = coreSources;
  const mergedAdmissions = mergeVndbAdmissionsIntoFixture(catalogSource.value, admissions);
  const sampleSource = mergedAdmissions.source;
  const populationContract = createRuntimePopulationContract({
    coreWorkIds: catalogSource.value.works.map(work => work.workId),
    admittedWorkIds: admissions?.works.map(work => work.workId) ?? []
  });
  const runtimePopulation = 'full';
  const runtimeDiagnostics = Object.freeze({
    mode: runtimePopulation,
    admissionsStatus: coreSources.admissionsStatus,
    coreWorkCount: populationContract.core.workIds.length,
    admissionsWorkCount: populationContract.admissions.workIds.length,
    runtimeWorkCount: populationContract.runtime.workIds.length
  });
  publishDiagnostics(runtimeDiagnostics);
  const backendIndexes = admissions === null ? backendIndexesSource.value : null;
  const assetsManifest = admissions === null
    ? restrictAssetsManifestToCatalog(
      assetsManifestSource.value,
      catalogSource.value.works.map(work => work.workId)
    )
    : null;
  const filterAuthority = filterAuthoritySource.value;
  const workGroupAuthority = workGroupAuthoritySource.value;
  const reviewQueue = sampleSource.schemaVersion === 'egs-tier-full-v1'
    ? null
    : reviewQueueSource.value;
  const sample = startupMetrics.measure('sample-preparation', () => prepareRuntimeSample(sampleSource, {
    backendIndexes,
    assetsManifest,
    filterAuthority,
    workGroupAuthority,
    reviewQueue,
    sourceHashes: admissions === null ? {
      indexes: backendIndexesSource.sha256,
      assetsManifest: assetsManifestSource.sha256,
      filterAuthority: filterAuthoritySource.sha256,
      workGroupAuthority: workGroupAuthoritySource.sha256,
      ...(sampleSource.schemaVersion === 'egs-tier-full-v1'
        ? {}
        : { reviewQueue: reviewQueueSource.sha256 })
      } : null
  }));
  let enrichment = null;
  if (enrichmentSource !== null) {
    try {
      enrichment = prepareEnrichmentSidecar(enrichmentSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: new Set(populationContract.core.workIds),
        companyIds: new Set(catalogSource.value.companies.map(brand => brand.companyId))
      });
    } catch (error) {
      throw new TypeError('alias enrichment sidecar rejected', { cause: error });
    }
  }
  let workAliasesById = enrichment?.workAliasesById ?? null;
  const workPinyinById = enrichment?.workPinyinById ?? null;
  let workDisplayTitlesById = enrichment?.workDisplayTitlesById ?? null;
  let vndbRatings = null;
  if (vndbRatingsSource !== null) {
    try {
      const config = features.vndbRatingsV1;
      if (typeof config.sha256 !== 'string' || vndbRatingsSource.sha256 !== config.sha256) {
        throw new TypeError('VNDB ratings sidecar hash does not match the runtime pin');
      }
      vndbRatings = prepareVndbRatingsSidecar(vndbRatingsSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.runtime.workIds,
        allowSuperset: admissions === null
      });
    } catch (error) {
      throw new TypeError('VNDB ratings sidecar rejected', { cause: error });
    }
  }
  let bangumiPublicBindings = null;
  if (bangumiPublicBindingsSource !== null) {
    try {
      if (bangumiPublicBindingsSource.sha256 !== BANGUMI_PUBLIC_BINDINGS_SHA256) {
        throw new TypeError('Bangumi public bindings carrier hash does not match the runtime pin');
      }
      bangumiPublicBindings = prepareBangumiPublicBindingsCarrier(bangumiPublicBindingsSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.runtime.workIds
      });
    } catch (error) {
      throw new TypeError('Bangumi public bindings carrier rejected', { cause: error });
    }
  }
  let bangumiRatings = null;
  if (bangumiRatingsSource !== null && bangumiPublicBindingsSource !== null && bangumiPublicBindings !== null) {
    try {
      const config = features.bangumiRatingsV1;
      if (typeof config.sha256 !== 'string' || bangumiRatingsSource.sha256 !== config.sha256) {
        throw new TypeError('Bangumi ratings sidecar hash does not match the runtime pin');
      }
      bangumiRatings = prepareBangumiRatingsSidecar(bangumiRatingsSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        bangumiPublicBindingsSha256: bangumiPublicBindingsSource.sha256,
        // Bangumi ratings currently cover the core catalog only; admissions
        // remain explicit no-rating records in the merged runtime.
        workIds: populationContract.core.workIds
      });
    } catch (error) {
      throw new TypeError('Bangumi ratings sidecar rejected', { cause: error });
    }
  }
  // The import flow intentionally consumes only the already-validated, confirmed
  // relation rows. It never derives a match from a title or a loose VNDB relation.
  const confirmedBangumiImportBindings = bangumiPublicBindings === null
    ? null
    : bangumiPublicBindings.bindings;
  if (bangumiCanonicalAliasFallbackSource !== null && bangumiPublicBindings !== null) {
    try {
      const config = features.bangumiCanonicalAliasFallbackV1;
      if (typeof config.sha256 !== 'string' || bangumiCanonicalAliasFallbackSource.sha256 !== config.sha256) {
        throw new TypeError('Bangumi canonical alias fallback hash does not match the runtime pin');
      }
      const fallback = prepareBangumiCanonicalAliasFallback(bangumiCanonicalAliasFallbackSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        enrichmentSha256: enrichmentSource?.sha256,
        bangumiPublicBindingsSha256: bangumiPublicBindingsSource.sha256,
        workIds: populationContract.core.workIds
      });
      ({ workAliasesById, workDisplayTitlesById } = applyBangumiCanonicalAliasFallback({
        workAliasesById,
        workDisplayTitlesById,
        fallbackByWorkId: fallback.workFallbackById
      }));
    } catch (error) {
      throw new TypeError('Bangumi canonical alias fallback rejected', { cause: error });
    }
  }
  const displayWorks = sample.works.map(work => projectWorkWithDisplayTitle(work, workDisplayTitlesById));
  let authorityFanout = null;
  if (authorityFanoutSource !== null) {
    try {
      const config = features.authorityFanoutV1;
      if (typeof config.sha256 !== 'string' || authorityFanoutSource.sha256 !== config.sha256) {
        throw new TypeError('authority fanout projection hash does not match the runtime pin');
      }
      const mediaProjection = prepareAuthorityFanoutMediaProjection(authorityFanoutSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.core.workIds
      });
      const pageBindingProjection = prepareAuthorityFanoutPageBindings(authorityFanoutSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        workIds: populationContract.core.workIds,
        ratingsSha256: features.vndbRatingsV1.sha256
      });
      authorityFanout = {
        selectedMediaByWorkId: mediaProjection.selectedMediaByWorkId,
        pageBindingIssues: pageBindingProjection.pageBindingIssues
      };
      if (authorityFanout.pageBindingIssues.length > 0) {
        throw new TypeError(`authority fanout page bindings rejected: ${authorityFanout.pageBindingIssues.length} issue(s)`);
      }
      console.info('authority fanout projection applied', { selectedWorkCount: authorityFanout.selectedMediaByWorkId.size });
    } catch (error) {
      throw new TypeError('authority fanout projection rejected', { cause: error });
    }
  }
  const vndbWeightedSort = vndbRatings === null
    ? null
    : createWeightedRatingSort({ ratings: vndbRatings.ratingByWorkId, scoreField: 'ratingRaw' });
  const bangumiWeightedSort = bangumiRatings === null
    ? null
    : createWeightedRatingSort({ ratings: bangumiRatings.ratingByWorkId, scoreField: 'score' });
  const egsWeightedSort = createWeightedRatingSort({
    ratings: new Map(sample.works.map(work => [work.workId, {
      ratingStatus: Number.isFinite(work.median) && Number.isInteger(work.voteCount)
        ? 'mapped-rated'
        : 'snapshot-unavailable',
      score: work.median,
      voteCount: work.voteCount
    }])),
    scoreField: 'score'
  });
  let legacyEntityRuntime = null, legacyApplyMedia;
  if (!features.authorityFanoutV1.enabled) {
    const [bridge, module] = await Promise.all([fetchSource(DATA_URLS.mediaClearanceBridge, 'G1 media clearance bridge'), import('./project-entity-runtime.js')]);
    if (bridge.sha256 !== MEDIA_CLEARANCE_BRIDGE_SHA256) throw new TypeError('G1 media clearance bridge hash mismatch');
    legacyEntityRuntime = await module.createProjectEntityRuntime({bridge:bridge.value,catalog:{...catalogSource.value,catalogSha256:catalogSource.sha256},dataRevision:DATA_REVISION,cryptoRef:crypto});
    legacyApplyMedia = module.applyProjectedMediaToWork;
  }
  const ratedDisplayWorks = displayWorks.map(work => {
    const vndbRated = projectWorkWithVndbRating(work, vndbRatings?.ratingByWorkId);
    const rated = projectWorkWithBangumiRating(vndbRated, bangumiRatings?.ratingByWorkId);
    const clearanceProjected = legacyEntityRuntime === null ? rated : legacyApplyMedia(rated, legacyEntityRuntime.selectedMediaByWorkId);
    const authorityProjected = authorityFanout === null
      ? clearanceProjected
      : applyAuthorityFanoutMediaToWork(clearanceProjected, authorityFanout.selectedMediaByWorkId);
    return {
      ...authorityProjected,
      externalAdmissionVisible: authorityProjected.isCrossSourceAdmission === true
        && (authorityProjected.vndbRating?.ratingStatus === 'mapped-rated'
          || authorityProjected.bangumiRating?.ratingStatus === 'mapped-rated'),
      egsScore: egsWeightedSort?.score(
        authorityProjected.median,
        authorityProjected.voteCount
      ) ?? null,
      vndbScore: vndbWeightedSort?.score(
        authorityProjected.vndbRating?.sortScore,
        authorityProjected.vndbRating?.sortVoteCount
      ) ?? null,
      vndbVoteCount: authorityProjected.vndbRating?.sortVoteCount ?? null,
      bangumiScore: bangumiWeightedSort?.score(
        authorityProjected.bangumiRating?.sortScore,
        authorityProjected.bangumiRating?.sortVoteCount
      ) ?? null,
      bangumiVoteCount: authorityProjected.bangumiRating?.sortVoteCount ?? null
    };
  });
  const brands = projectBrandsWithAliases(
    sample.brands,
    enrichment?.companyAliasesById,
    enrichment?.companyPinyinById
  );
  let companyProfile = null;
  if (companyProfileSource !== null) {
    try {
      companyProfile = prepareCompanyProfileSidecar(companyProfileSource.value, {
        catalogSnapshotId: sampleSource.snapshot?.snapshotId,
        catalogSha256: catalogSource.sha256,
        companyIds: new Set(catalogSource.value.companies.map(brand => brand.companyId))
      });
    } catch (error) {
      throw new TypeError('company profile sidecar rejected', { cause: error });
    }
  }
  return { catalogSource, sampleSource, sample, runtimeDiagnostics, populationContract, enrichment, workAliasesById, workPinyinById, workDisplayTitlesById, ratedDisplayWorks, presentationFamiliesSource, bangumiPublicBindings, confirmedBangumiImportBindings, brands, companyProfile };
}

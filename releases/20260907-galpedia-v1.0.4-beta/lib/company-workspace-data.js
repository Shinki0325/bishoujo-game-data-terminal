import { loadRuntimeSource } from './runtime-source-cache.js';
import { DATA_URLS, RUNTIME_FEATURES, ENRICHMENT_SIDECAR_SHA256, COMPANY_PROFILE_SIDECAR_SHA256, BANGUMI_PUBLIC_BINDINGS_SHA256 } from './runtime-config.js';
import { prepareBackendBetaFixture } from './backend-beta-fixture.js';
import { mergeVndbAdmissionsIntoFixture } from './catalog-admissions.js';
import { prepareVndbAdmissionsSidecar } from './vndb-admissions.js';
import { prepareEnrichmentSidecar } from './enrichment-sidecar.js';
import { prepareCompanyProfileSidecar } from './company-profile-sidecar.js';
import { prepareBangumiPublicBindingsCarrier } from './bangumi-public-bindings.js';
import { prepareBangumiCanonicalAliasFallback } from './bangumi-canonical-alias-fallback.js';
import { prepareAuthorityFanoutMediaProjection, applyAuthorityFanoutMediaToWork } from './authority-fanout.js';
import { buildCompanyDirectory } from './company-directory.js';

let pending;
const pin = (source, hash, label) => {
  if (source.sha256 !== hash) throw new TypeError(`${label} integrity failed`);
  return source.value;
};

// Company browsing needs the catalogue and its display projections, not score
// engines, character graphs, media-clearance auditing, export or ranking code.
export function loadCompanyWorkspace() {
  pending ??= (async () => {
    const [catalog, admissionsSource, enrichmentSource, profileSource, fanoutSource, bindingsSource, fallbackSource] = await Promise.all([
      loadRuntimeSource(DATA_URLS.catalog, '作品目录'),
      loadRuntimeSource(DATA_URLS.vndbAdmissions, '补充作品目录'),
      loadRuntimeSource(DATA_URLS.enrichment, '名称资料'),
      loadRuntimeSource(DATA_URLS.companyProfile, '会社资料'),
      loadRuntimeSource(DATA_URLS.authorityFanout, '作品封面'),
      loadRuntimeSource(DATA_URLS.bangumiPublicBindings, '作品关联'),
      loadRuntimeSource(DATA_URLS.bangumiCanonicalAliasFallback, '作品显示名称')
    ]);
    const coreIds = catalog.value.works.map(work => work.workId);
    const context = { catalogSnapshotId: catalog.value.snapshot.snapshotId, catalogSha256: catalog.sha256 };
    const admissions = prepareVndbAdmissionsSidecar(admissionsSource.value, { ...context, workIds: coreIds });
    const { source } = mergeVndbAdmissionsIntoFixture(catalog.value, admissions);
    const sample = prepareBackendBetaFixture(source);
    const companyIds = new Set(catalog.value.companies.map(company => company.companyId));
    const enrichment = prepareEnrichmentSidecar(pin(enrichmentSource, ENRICHMENT_SIDECAR_SHA256, 'aliases'), {
      ...context, workIds: new Set(coreIds), companyIds
    });
    const profile = prepareCompanyProfileSidecar(pin(profileSource, COMPANY_PROFILE_SIDECAR_SHA256, 'companies'), { ...context, companyIds });
    prepareBangumiPublicBindingsCarrier(pin(bindingsSource, BANGUMI_PUBLIC_BINDINGS_SHA256, 'bindings'), {
      ...context, workIds: sample.works.map(work => work.workId)
    });
    const fallback = prepareBangumiCanonicalAliasFallback(pin(fallbackSource, RUNTIME_FEATURES.bangumiCanonicalAliasFallbackV1.sha256, 'titles'), {
      ...context, enrichmentSha256: enrichmentSource.sha256, bangumiPublicBindingsSha256: bindingsSource.sha256, workIds: coreIds
    });
    const media = prepareAuthorityFanoutMediaProjection(pin(fanoutSource, RUNTIME_FEATURES.authorityFanoutV1.sha256, 'covers'), { ...context, workIds: coreIds });
    const works = sample.works.map(work => {
      const displayTitle = enrichment.workDisplayTitlesById?.get(work.workId) ?? fallback.workFallbackById.get(work.workId)?.displayTitle;
      return applyAuthorityFanoutMediaToWork(displayTitle ? { ...work, displayTitle } : work, media.selectedMediaByWorkId);
    });
    return buildCompanyDirectory({
      brands: sample.brands, works,
      companyAliasesById: enrichment.companyAliasesById,
      companyPinyinById: enrichment.companyPinyinById,
      avatarByCompanyId: profile.avatarByCompanyId
    });
  })().catch(error => { pending = null; throw error; });
  return pending;
}

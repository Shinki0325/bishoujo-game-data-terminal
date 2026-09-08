import { preparePresentationFamiliesSidecar } from './presentation-families.js';
import { buildCompanyDirectory, restoreCompanySummary } from './company-directory.js';
import { PRESENTATION_FAMILIES_SIDECAR_SHA256 } from './runtime-config.js?v=a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';

// Original families deduplicate person representative slots only. Work catalog
// folding retains its separate Bangumi-identity boundary.
export function prepareWorkbenchDirectories({
  presentationFamiliesSource, catalogSnapshotId, catalogSha256,
  presentationWorkIds, bangumiPublicBindings, companySummary,
  brands, works, companyAliasesById, companyPinyinById, avatarByCompanyId
}) {
  let presentationFamilies = null;
  // Catalog projection may split a VNDB version family at independent
  // Bangumi subjects. Person representative works are a compact summary and
  // keep the raw version-family identity solely for slot de-duplication.
  const representativeFamilyByWorkId = new Map();
  for (const family of presentationFamiliesSource?.value?.families ?? []) {
    if (typeof family?.presentationWorkId !== 'string' || !family.presentationWorkId) continue;
    for (const workId of family.catalogMemberWorkIds ?? []) {
      if (typeof workId === 'string' && workId) representativeFamilyByWorkId.set(workId, family.presentationWorkId);
    }
  }
  if (presentationFamiliesSource !== null) {
    try {
      if (presentationFamiliesSource.sha256 !== PRESENTATION_FAMILIES_SIDECAR_SHA256) {
        throw new TypeError('presentation families sidecar hash does not match the runtime pin');
      }
      presentationFamilies = preparePresentationFamiliesSidecar(presentationFamiliesSource.value, {
        catalogSnapshotId: catalogSnapshotId,
        catalogSha256: catalogSha256,
        workIds: presentationWorkIds,
        bangumiSubjectByWorkId: bangumiPublicBindings === null
          ? null
          : new Map(bangumiPublicBindings.bindings.map(binding => [binding.egsWorkId, binding.bangumiSubjectId]))
      });
    } catch (error) {
      throw new TypeError('presentation families sidecar rejected', { cause: error });
    }
  }
  const companyDirectory = companySummary !== null ? restoreCompanySummary(companySummary) : buildCompanyDirectory({
    brands,
    works,
    companyAliasesById: companyAliasesById,
    companyPinyinById: companyPinyinById,
    avatarByCompanyId: avatarByCompanyId
  });
  return { presentationFamilies, representativeFamilyByWorkId, companyDirectory };
}

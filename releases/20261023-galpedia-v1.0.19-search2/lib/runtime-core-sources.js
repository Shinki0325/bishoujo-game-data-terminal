import { loadRuntimeSource } from './runtime-source-cache.js';
import { prepareVndbAdmissionsSidecar } from './vndb-admissions.js';

export async function fetchStagedRuntimeCoreSources({
  catalogUrl,
  admissionsUrl,
  fetchRequired = loadRuntimeSource,
  prepareAdmissions = prepareVndbAdmissionsSidecar
}) {
  const [catalogSource, admissionsSource] = await Promise.all([
    fetchRequired(catalogUrl, 'catalog'),
    fetchRequired(admissionsUrl, 'VNDB admissions sidecar')
  ]);
  const admissions = prepareAdmissions(admissionsSource.value, {
    catalogSnapshotId: catalogSource.value.snapshot?.snapshotId,
    catalogSha256: catalogSource.sha256,
    workIds: catalogSource.value.works.map(work => work.workId)
  });
  return Object.freeze({
    catalogSource,
    admissions,
    admissionsStatus: 'full',
    backendIndexesSource: null,
    assetsManifestSource: null,
    useCoreFallback: false
  });
}

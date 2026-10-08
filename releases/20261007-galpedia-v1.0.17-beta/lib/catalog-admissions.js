export function mergeVndbAdmissionsIntoFixture(source, admissions) {
  if (admissions === null || admissions.works.length === 0) return { source, admissionCount: 0 };
  const merged = JSON.parse(JSON.stringify(source));
  // The backend indexes are position-bound to the 6,799-work core export.
  // Admissions are merged in memory, so discard those stale indexes and let
  // the runtime build its own query state for the expanded presentation pool.
  merged.indexes = null;
  const existingWorkIds = new Set(merged.works.map(work => work.workId));
  const companies = new Map(merged.companies.map(company => [company.companyId, company]));
  for (const item of admissions.works) {
    if (existingWorkIds.has(item.workId)) throw new TypeError(`VNDB admission overlaps catalog work ${item.workId}`);
    existingWorkIds.add(item.workId);
    const companyId = item.companyId || `vndb-${item.vndbId}`;
    if (!companies.has(companyId)) {
      const company = { companyId, name: `未收录会社 (${companyId})`, aliases: [] };
      merged.companies.push(company);
      companies.set(companyId, company);
    }
    merged.works.push({
      workId: item.workId,
      title: item.title,
      furigana: item.furigana,
      releaseDate: item.releaseDate || '1900-01-01',
      companyId,
      median: item.median,
      voteCount: item.voteCount,
      isCrossSourceAdmission: true,
      filterIds: [],
      genreIds: [],
      platformId: 'platform-pc',
      workGroupId: null,
      isNukige: false,
      thumbnail: item.thumbnail,
      preview: item.preview
    });
  }
  return { source: merged, admissionCount: admissions.works.length };
}


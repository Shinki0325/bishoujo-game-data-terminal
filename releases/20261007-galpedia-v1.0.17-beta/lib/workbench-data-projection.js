// Validated sidecars expose read-only lookup facades containing methods.
// Worker postMessage needs data-only Maps, not those function-bearing facades.
export function toWorkerLookup(source) {
  if (source == null || source instanceof Map) return source;
  return new Map(source.entries());
}

export function restrictAssetsManifestToCatalog(assetsManifest, catalogWorkIds) {
  if (assetsManifest === null || assetsManifest === undefined) return assetsManifest;
  const allowed = new Set(catalogWorkIds);
  if (!Array.isArray(assetsManifest.assets)) return assetsManifest;
  const assets = assetsManifest.assets.filter(asset => allowed.has(asset.workId));
  return assets.length === assetsManifest.assets.length
    ? assetsManifest
    : Object.freeze({ ...assetsManifest, assets: Object.freeze(assets) });
}

export function projectBrandsWithAliases(brands, companyAliasesById, companyPinyinById = null) {
  return brands.map(brand => {
    const aliases = companyAliasesById?.get?.(brand.brandId);
    const pinyin = companyPinyinById?.get?.(brand.brandId);
    if (
      (!Array.isArray(aliases) || aliases.length === 0)
      && (!Array.isArray(pinyin) || pinyin.length === 0)
    ) return brand;
    const existing = Array.isArray(brand.searchAliases) ? brand.searchAliases : [];
    const seen = new Set();
    const merged = [...existing, ...aliases].filter(alias => {
      const normalized = String(alias).normalize('NFKC').trim().toLocaleLowerCase('ja-JP');
      if (normalized.length === 0 || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    const existingPinyin = Array.isArray(brand.searchPinyin) ? brand.searchPinyin : [];
    const mergedPinyin = [...existingPinyin, ...(Array.isArray(pinyin) ? pinyin : [])]
      .map(value => String(value).normalize('NFKC').trim().toLocaleLowerCase('en-US'))
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
    return {
      ...brand,
      searchAliases: merged,
      ...(mergedPinyin.length > 0 ? { searchPinyin: mergedPinyin } : {})
    };
  });
}

export function projectWorkWithDisplayTitle(work, workDisplayTitlesById = null) {
  const displayTitle = workDisplayTitlesById?.get?.(work.workId);
  if (typeof displayTitle !== 'string' || displayTitle.length === 0) return work;
  return { ...work, displayTitle };
}

export function applyBangumiCanonicalAliasFallback({
  workAliasesById = null,
  workDisplayTitlesById = null,
  fallbackByWorkId
}) {
  const mergedAliases = new Map(workAliasesById ?? []);
  const mergedDisplayTitles = new Map(workDisplayTitlesById ?? []);
  for (const [workId, fallback] of fallbackByWorkId) {
    if (mergedDisplayTitles.has(workId)) continue;
    mergedDisplayTitles.set(workId, fallback.displayTitle);
    const aliases = mergedAliases.get(workId) ?? [];
    mergedAliases.set(workId, Object.freeze([
      fallback.displayTitle,
      ...aliases.filter(alias => alias !== fallback.displayTitle)
    ]));
  }
  return Object.freeze({
    workAliasesById: mergedAliases,
    workDisplayTitlesById: mergedDisplayTitles
  });
}

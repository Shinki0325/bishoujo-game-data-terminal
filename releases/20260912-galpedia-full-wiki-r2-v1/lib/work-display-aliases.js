// Presentation names are selected separately from the complete search index.
export function aliasKey(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja')
    .replace(/[\u30a1-\u30f6]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

function sourceIdentifier(value) {
  return /^(?:galge:)?GS\d+$/iu.test(value)
    || /^(?:egs|vndb|bgm|bangumi|steam|galge|dlsite):(?:[a-z]+:)?[a-z]*\d+$/iu.test(value);
}

export function cleanDisplayAliases(values, title, {excluded = []} = {}) {
  const seen = new Set([title, ...excluded].map(aliasKey));
  const result = [];
  for (const value of values ?? []) {
    if (typeof value !== 'string') continue;
    const text = value.trim().replace(/\s+/gu, ' '), key = aliasKey(text);
    if (!key || sourceIdentifier(text) || seen.has(key)) continue;
    seen.add(key); result.push(text);
  }
  return result;
}

// Display preference only: identities and the original edition title stay intact.
export function projectWorkDisplayTitle(work, loaded) {
  const fallback = {displayTitle:work.title, source:'edition-title', bangumiSubjectId:null};
  if (!loaded) return fallback;
  const {presentation, edition} = loaded;
  const selected = work.fullWikiRatings?.bangumi?.subjectId;
  const subjects = [...new Set((selected ? [selected] : edition.sourceIds?.bangumiSubjectsExactEgs ?? []).map(String))];
  if (subjects.length !== 1) return fallback;
  const rows = (presentation.bangumiNameVariants ?? []).filter(row => String(row.bangumiSubjectId) === subjects[0]);
  const usable = row => typeof row.value === 'string' && row.value.trim() && !sourceIdentifier(row.value.trim());
  const chineseName = rows.find(row => row.field === 'nameCn' && usable(row));
  return chineseName ? {displayTitle:chineseName.value.trim().replace(/\s+/gu, ' '),
    source:'bangumi-name-cn', bangumiSubjectId:subjects[0]} : fallback;
}

export function projectWorkDisplayAliases(work, loaded, fallback = []) {
  if (!loaded) return cleanDisplayAliases(fallback, work.title);
  const {presentation, edition, relations} = loaded;
  const selected = work.fullWikiRatings?.bangumi?.subjectId;
  const subjects = new Set((selected ? [selected] : edition.sourceIds?.bangumiSubjectsExactEgs ?? []).map(String));
  const rows = (presentation.bangumiNameVariants ?? []).filter(row => subjects.has(String(row.bangumiSubjectId)));
  const candidates = [
    ...rows.filter(row => row.field === 'nameCn'),
    ...rows.filter(row => row.field !== 'nameCn'),
    ...(rows.some(row => row.field === 'nameCn' || row.field === 'alias') ? []
      : [...(presentation.vndbNameVariants ?? []), {value:edition.furigana}])
  ].filter(row => typeof row.value === 'string');
  const excluded = (relations?.editions ?? []).filter(row => String(row.egsWorkId) !== String(work.workId)).map(row => row.title);
  for (const value of Object.values(edition.sourceIds ?? {})) excluded.push(...(Array.isArray(value) ? value : [value]));
  return cleanDisplayAliases(candidates.map(row => row.value), work.title, {excluded});
}

export function splitDisplayAliases(aliases) {
  let length = 0;
  const visible = [], more = [];
  for (const name of aliases) {
    if (more.length || visible.length >= 3 || (visible.length && length + name.length > 80)) more.push(name);
    else {visible.push(name);length += name.length;}
  }
  return {visible, more};
}

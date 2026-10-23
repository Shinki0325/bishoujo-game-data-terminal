import { groupCharacterAppearances } from './character-display-policy.js';
const nameKey = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase('ja').replace(/[\p{P}\p{S}\s]+/gu, '');
export const isMainCharacter = role => ['main', 'primary', 'メイン', '主角'].includes(String(role ?? ''));

// Keep the published representative policy independent of lazy loading and
// of the number of cards requested by a particular surface.
export function selectRepresentativeCharacters(candidates, limit = 6) {
  if (limit <= 0) return [];
  const ranked = groupCharacterAppearances(candidates).sort((a, b) =>
    Number(isMainCharacter(b.role)) - Number(isMainCharacter(a.role))
    || Number(Boolean(b.imageAvailable ?? b.imageUrl)) - Number(Boolean(a.imageAvailable ?? a.imageUrl))
    || (Number(b.bangumiVoteCount) || 0) - (Number(a.bangumiVoteCount) || 0)
    || String(b.releaseDate ?? '').localeCompare(String(a.releaseDate ?? ''))
    || String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh-Hans')
    || String(a.characterId ?? '').localeCompare(String(b.characterId ?? ''), 'en'));
  const ids = new Set(), names = new Set(), selected = [];
  for (const row of ranked) {
    const keys = [nameKey(row.name), nameKey(row.originalName)].filter(Boolean);
    if (ids.has(row.characterId) || keys.some(key => names.has(key))) continue;
    ids.add(row.characterId); keys.forEach(key => names.add(key)); selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected;
}

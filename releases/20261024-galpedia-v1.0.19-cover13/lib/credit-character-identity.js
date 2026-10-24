import { REVIEWED_CHARACTER_BINDINGS } from './reviewed-character-bindings.js';
export function nativeCharacterKey(f) {
  return f.egsCharacterId ? `egs:${f.egsCharacterId}` : f.bangumiCharacterId ? `bangumi:${f.bangumiSubjectId}:${f.bangumiCharacterId}` : f.vndbCharacterId ? `vndb:${f.vndbCharacterId}` : null;
}
export function reviewedCreditCharacter(f, workId = f.egsWorkId || f.workId) {
  const key = nativeCharacterKey(f);
  const scoped = f.egsCharacterId && workId ? `egs:${workId}:${f.egsCharacterId}`
    : f.bangumiCharacterId && workId ? `bangumi:${workId}:${f.bangumiSubjectId}:${f.bangumiCharacterId}` : null;
  return REVIEWED_CHARACTER_BINDINGS[scoped] || REVIEWED_CHARACTER_BINDINGS[key];
}
export function resolveCreditCharacter(f,catalog={}) {
  // An EGS character can recur in separate works with distinct canonical
  // records. Never promote a reviewed work-specific match to a global alias.
  const key=nativeCharacterKey(f);
  return reviewedCreditCharacter(f) || catalog.characterSources?.[key] || f.canonicalCharacterId || f.characterId
    || (f.egsCharacterId ? `char_egs_${f.egsCharacterId}` : f.bangumiCharacterId ? `char_bangumi_${f.bangumiCharacterId}` : f.vndbCharacterId ? `char_vndb_${f.vndbCharacterId}` : null);
}
export function withCreditCharacter(f,catalog={}) {
  const id=resolveCreditCharacter(f,catalog);return id ? {...f,canonicalCharacterId:id,characterId:id} : f;
}

// Only retire native fallback cards when a reviewed match names a canonical
// card already present in this exact work. Existing canonical forms stay apart.
export function reviewedFallbackCastTarget(character, workId) {
  if (!/^char_(?:egs|bangumi)_/.test(character.characterId || '')) return null;
  const targets = new Set([
    ...(character.sourceIds?.egsCharacterIds ?? []).map(id => reviewedCreditCharacter({egsCharacterId:id},workId)),
    ...(character.sourceIds?.bangumi ?? []).map(a => reviewedCreditCharacter({bangumiSubjectId:a.subjectId,bangumiCharacterId:a.characterId},workId))
  ].filter(Boolean));
  return targets.size === 1 ? [...targets][0] : null;
}

import { resolveCreditCharacter } from './credit-character-identity.js';
import { personTimelineCharacterCoverage } from './person-character-coverage.js';
import { REVIEWED_VOICE_NOTE_BINDINGS } from './reviewed-character-bindings.js';
import { groupPersonSongs } from './person-song-projection.js';
import { personSongDisplay } from './person-song-display.js';
import { canonicalRole } from './credit-role-policy.js';
export function groupPersonTimelineCredits(credits = [], acceptedCast = []) {
  const castByPresentation = new Map();
  for (const character of acceptedCast) {
    const rows = castByPresentation.get(character.presentationWorkId) ?? [];
    rows.push(character); castByPresentation.set(character.presentationWorkId, rows);
  }
  const works = new Map();
  for (const [index, rawCredit] of credits.entries()) {
    const credit={...rawCredit,characterId:rawCredit.characterId||resolveCreditCharacter(rawCredit)};
    // Edition IDs, not titles or family IDs, define a timeline entry.
    const key = credit.nativeReleaseIdentity ? JSON.stringify(['native-release',credit.nativeReleaseIdentity]) : credit.workId ? String(credit.workId) : (credit.presentationWorkId || credit.sourceWorkIdentity) ? JSON.stringify(['work',credit.presentationWorkId || credit.sourceWorkIdentity,credit.sourceEdition?.kind,credit.sourceEdition?.id]) : `missing:${index}`;
    let group = works.get(key);
    if (!group) {
      group = { ...credit, sourceCredits: [], roleCodes: [], characters: [] };
      works.set(key, group);
    }
    group.sourceCredits.push(credit);
    const role = credit.creditType === 'character-voiced-by' ? 'voice-actor' : credit.roleCode ?? 'unknown';
    if (!group.roleCodes.includes(role)) group.roleCodes.push(role);
    const characterName=credit.characterDisplayName||credit.characterName;
    if (role !== 'voice-actor' || !characterName) continue;
    const identity = credit.characterId
      ? `${String(credit.characterId).startsWith('char_') ? 'canonical' : credit.source ?? 'source'}:${credit.characterId}`
      : `name:${String(characterName).normalize('NFKC').replace(/\s+/gu, '')}`;
    if (!group.characters.some(item => item.identity === identity)) group.characters.push({
      identity, identified: Boolean(credit.characterId), name: characterName, role: credit.characterRole
    });
  }
  return [...works.values()].map(group => {
    // The selected work roster already confirms this person's cast. It can
    // resolve work-level voice credits without guessing from their note text.
    const confirmed = new Map();
    if (group.roleCodes.includes('voice-actor')) for (const credit of group.sourceCredits) {
      if (credit.nativeReleaseIdentity) continue;
      for (const character of castByPresentation.get(credit.presentationWorkId) ?? []) {
        confirmed.set(character.characterId, {identity:`canonical:${character.characterId}`, identified:true, name:character.name, role:character.role});
      }
    }
    if (confirmed.size) group.characters = [...confirmed.values()];
    group.characters=personTimelineCharacterCoverage(group.characters,group.workId||group.sourceWorkId,group.personId);
    // A work-level cast note is supplementary when actual character entities
    // are known; it must not create a second role next to its resolved name.
    const identified=group.characters.filter(character=>character.identified);
    const names=new Set(identified.map(c=>String(c.name).normalize('NFKC').replace(/\s+/gu,'')));
    // All attested spellings of an already resolved entity count as shown.
    // Do not turn a second source's original name into an extra voice note.
    const identities = new Set(identified.map(c => c.identity));
    for (const credit of group.sourceCredits) {
      const identity = credit.characterId ? `${String(credit.characterId).startsWith('char_') ? 'canonical' : credit.source ?? 'source'}:${credit.characterId}` : null;
      if (identity && identities.has(identity)) for (const name of [credit.characterDisplayName,credit.characterName,credit.sourceCharacterName]) {
        if (name) names.add(String(name).normalize('NFKC').replace(/\s+/gu,''));
      }
    }
    const noteCovered = c => {
      const name = String(c.name).normalize('NFKC').replace(/\s+/gu,'');
      if (names.has(name)) return true;
      // Hide a list only when every whole name is already represented; keep
      // partial matches and qualifiers, and never use this to merge identities.
      const listed=name.replace(/[、,&]$/u,'').split(/[、,&]/u);
      if (listed.length>1 && listed.every(part=>part && names.has(part))) return true;
      const target = REVIEWED_VOICE_NOTE_BINDINGS[JSON.stringify([group.personId,String(group.workId),name])];
      return Boolean(target && identities.has(`canonical:${target}`));
    };
    group.voiceCreditNotes=identified.length ? group.characters.filter(c=>!c.identified&&!noteCovered(c)).map(c=>c.name) : [];
    if(identified.length)group.characters=identified;
    group.songs = groupPersonSongs(group.sourceCredits);
    return group;
  });
}
export function representativePersonSongs(person, groups, primaryRole) {
  const roles = ['vocalist', 'vocal'].includes(primaryRole) ? ['vocalist', 'vocal']
    : ['music', 'songs'].includes(primaryRole) ? ['vocalist', 'vocal', 'composition', 'lyrics', 'arrangement']
    : [primaryRole];
  const works = person.representativeWorks ?? [];
  const rank = group => {
    const index = works.findIndex(work => String(work.workId) === String(group.workId));
    return index < 0 ? works.length : index;
  };
  const candidates = [...groups].filter(group => group.workId).sort((a, b) =>
    rank(a) - rank(b) || (b.work?.bangumiVoteCount ?? b.bangumiVoteCount ?? 0) - (a.work?.bangumiVoteCount ?? a.bangumiVoteCount ?? 0)
    || String(a.workId).localeCompare(String(b.workId), 'en'));
  const preferOpening = roles.includes('vocalist');
  const pool = [];
  for (const [workRank, group] of candidates.entries()) {
    for (const song of personSongDisplay(group.songs, group.sourceCredits).songs) {
      if (!song.roleCodes.some(role => roles.includes(canonicalRole(role)))) continue;
      // Recording labels are evidence; a song title containing "cover" is not.
      if ((song.categories ?? []).some(c => /カバー|翻唱|\bcover(?:s|ed)?\b/iu.test(c))) continue;
      const opening = (song.categories ?? []).some(c => /(?:^|[^a-z])OP(?:曲|テーマ)?(?:\s*\d+)?$/iu.test(c)
        || /^(?:opening(?: theme| song)?|オープニング(?:テーマ|曲|主題歌)?)$/iu.test(c));
      pool.push({group, song, workRank, priority:preferOpening && opening ? 0 : 1});
    }
  }
  pool.sort((a,b)=>a.priority-b.priority || a.workRank-b.workRank);
  const selected = [], seen = new Set(), selectedWorks = new Set();
  for (const {group, song} of pool) {
    if (selectedWorks.has(String(group.workId))) continue;
    // Only source identities deduplicate across editions. A title alone must
    // never collapse different recordings or manufacture a song identity.
    const identities = song.songIds?.length ? song.songIds : song.songId ? [song.songId] : [];
    const keys = identities.length ? identities.map(id => `song:${id}`) : [JSON.stringify([group.workId, song.title, song.categories])];
    if (keys.some(key => seen.has(key))) continue;
    keys.forEach(key => seen.add(key));
    selectedWorks.add(String(group.workId));
    const work = works.find(work => String(work.workId) === String(group.workId));
    selected.push({ ...group.work, ...group, ...work, song });
    if (selected.length === 6) break;
  }
  return selected;
}

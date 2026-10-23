import { canonicalRole } from './credit-role-policy.js';

const SONG_ROLES = ['vocalist', 'lyrics', 'composition', 'arrangement'];
// Call within an edition group. A song's usage belongs to that edition,
// never to the artist or the song globally. Titles are not identity keys.
export function groupPersonSongs(credits = []) {
  const songs = new Map();
  for (const credit of credits) {
    if (credit.relationType !== 'song-credited-person' && credit.creditType !== 'song-credited-person') continue;
    if (!credit.songId || !credit.songTitle) continue;
    const displayKey=credit.displayGroupId||credit.songId;
    let song = songs.get(displayKey);
    if (!song) {
      song = { songId: credit.songId, songIds: [], title: credit.songTitle, categories: [], roleCodes: [], sourceCredits: [] };
      songs.set(displayKey, song);
    }
    if(!song.songIds.includes(credit.songId))song.songIds.push(credit.songId);
    for (const category of credit.songCategories ?? []) {
      if (typeof category === 'string' && category.trim() && !song.categories.includes(category.trim())) song.categories.push(category.trim());
    }
    const role = canonicalRole(credit.roleCode);
    if (SONG_ROLES.includes(role) && !song.roleCodes.includes(role)) song.roleCodes.push(role);
    song.sourceCredits.push(credit);
  }
  return [...songs.values()].map(song => ({ ...song, roleCodes: SONG_ROLES.filter(role => song.roleCodes.includes(role)) }));
}

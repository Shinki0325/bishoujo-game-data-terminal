import { canonicalRole } from './credit-role-policy.js';
import { releaseYear } from './work-release-date.js';

const MUSIC = new Set(['vocalist', 'vocal', 'lyrics', 'composition', 'arrangement', 'music', 'songs']);
export function personCreditInMode(credit, mode) {
  const role = credit.creditType === 'character-voiced-by' ? 'voice-actor' : canonicalRole(credit.roleCode);
  if (['scenario','artwork'].includes(mode)) return role === mode;
  if (mode === 'vocal') return ['vocal','vocalist'].includes(role);
  if (mode === 'music') return ['composition','lyrics','arrangement','music','songs','sound-director'].includes(role);
  return mode === 'all' || mode === 'works' || (mode === 'characters' ? ['voice-actor', 'voice'].includes(role) : MUSIC.has(role));
}

// Count editions once regardless of duplicate sources, songs, roles or aliases.
// Work-level facts have no release year and must not inherit a navigation target's date.
export function personScopeOverview(groups = []) {
  const dated = new Map(), companies = new Map(), editions = new Set(), works = new Set(), firstByWork = new Map();
  for (const group of groups) {
    const work = group.presentationWorkId || group.sourceWorkIdentity || (group.workId ? `edition:${group.workId}` : group.nativeReleaseIdentity);
    if (work) works.add(work);
    if (!group.nativeReleaseIdentity && (!group.workId || (group.scope && group.scope.status !== 'confirmed'))) continue;
    const id = String(group.workId||group.nativeReleaseIdentity);
    if (editions.has(id)) continue;
    editions.add(id);
    const year = releaseYear(group.releaseDate);
    if (work && year > 1900 && year < 3000) firstByWork.set(work,Math.min(firstByWork.get(work)??year,year));
    const companyId = group.brandId ?? group.work?.brandId;
    if (!companyId) continue;
    const key = String(companyId);
    const company = companies.get(key) ?? { companyId: key, name: group.brandName ?? group.work?.brandName ?? key, works: new Set() };
    if(work)company.works.add(work); companies.set(key, company);
  }
  for(const year of firstByWork.values())dated.set(year,(dated.get(year)??0)+1);
  const years = [...dated.keys()].sort((a,b)=>a-b);
  return { firstYear: years[0] ?? null, lastYear: years.at(-1) ?? null,
    activityYears: years.map(year => ({year, count: dated.get(year)})), editionCount: editions.size, workCount:works.size, datedWorkCount:firstByWork.size,
    coCompanies: [...companies.values()].map(({works,...company})=>({...company,count:works.size})).sort((a,b)=>b.count-a.count||a.companyId.localeCompare(b.companyId)) };
}

// A fold is presentation only. Never use title equality to establish a family,
// or mix unbound work-level facts into a particular edition's credits.
export function groupPersonEditionRows(rows, familyForWork = () => null) {
  const output = [], byKey = new Map();
  for (const row of rows) {
    const family = row.workId ? familyForWork(String(row.workId)) : null;
    const member = family?.members?.find(m => String(m.workId) === String(row.workId));
    const title = row.displayTitle || row.title || '';
    const key = member && family.presentationWorkId && (!row.scope || row.scope.status === 'confirmed')
      ? JSON.stringify([family.presentationWorkId]) : null;
    let group = key ? byKey.get(key) : null;
    if (!group) { group = { rows: [] }; output.push(group); if (key) byKey.set(key, group); }
    group.rows.push({ ...row, editionPlatform: member?.platform || '', editionLabel: member?.label || '', editionTitle: member?.title || '' });
  }
  return output;
}

// Match the same contexts used by the collaboration indices, without joining
// people by name or songs by title. Source-scoped voice credits stay scoped.
export function personCollaborationDetails(ownCredits, peerCredits, { songs = false, vocalOnly = false, musicOnly = false, workUnit = false, staffMode = null } = {}) {
  const songRoles = new Set(['vocalist', 'lyrics', 'composition', 'arrangement']);
  const roleOf = credit => credit.roleCode === 'vocal' ? 'vocalist' : canonicalRole(credit.roleCode);
  const context = credit => {
    const role = roleOf(credit);
    if (credit.scope?.status === 'conflict') return null;
    if (songs) return (credit.relationType || credit.creditType) === 'song-credited-person'
      && songRoles.has(role) && credit.songId && credit.workId && credit.scope?.status === 'confirmed'
      ? JSON.stringify([credit.songId, String(credit.workId)]) : null;
    if (staffMode) return ['scenario','artwork','director','planning','original-story','character-design'].includes(role)
      && (credit.relationType||credit.creditType)!=='song-credited-person' && credit.workId && credit.scope?.status==='confirmed'
      ? JSON.stringify(['edition',String(credit.workId)]) : null;
    if (role !== 'voice-actor') return null;
    if (credit.nativeReleaseIdentity) return JSON.stringify(['native-release',credit.nativeReleaseIdentity,credit.presentationWorkId]);
    if (credit.workId && credit.scope?.status === 'confirmed') return JSON.stringify(['edition', String(credit.workId)]);
    const family = credit.presentationWorkId || credit.sourceWorkIdentity;
    if (!family) return null;
    return JSON.stringify(['source', credit.source, family, credit.sourceEdition?.kind, credit.sourceEdition?.id]);
  };
  const peers = new Map();
  for (const credit of peerCredits ?? []) {
    const key = context(credit); if (!key) continue;
    const role = roleOf(credit);
    if (songs && vocalOnly && role === 'vocalist') continue;
    const roles = peers.get(key) ?? new Set(); roles.add(role); peers.set(key, roles);
  }
  const rows = new Map();
  for (const credit of ownCredits ?? []) {
    const key = context(credit), peerRoles = peers.get(key);
    if (!peerRoles || (staffMode && roleOf(credit)!==staffMode) || (songs && vocalOnly && roleOf(credit) !== 'vocalist') || (songs && musicOnly && !['composition','lyrics','arrangement'].includes(roleOf(credit)))) continue;
    const identity = songs && !workUnit ? credit.songId : credit.nativeReleaseIdentity || credit.presentationWorkId || credit.sourceWorkIdentity || `edition:${credit.workId}`;
    let row = rows.get(identity);
    if (!row) { row = { id: identity, title: songs && !workUnit ? credit.songTitle : credit.displayTitle || credit.title, roles: [], works: [] }; rows.set(identity, row); }
    row.roles = [...new Set([...row.roles, ...peerRoles])];
    if (!row.works.some(work => work.key === key)) row.works.push({ key, workId: credit.workId || null,
      sourceWorkId: credit.sourceWorkId || null, nativeWorkId: credit.nativeWorkId || null,
      title: credit.displayTitle || credit.title, releaseDate: credit.workId||credit.nativeReleaseIdentity ? credit.releaseDate : '',
      categories: [...new Set(credit.songCategories ?? [])] });
  }
  return [...rows.values()].sort((a,b)=>String(a.title).localeCompare(String(b.title),'zh-Hans'));
}

export function representativePersonWorks(groups, limit = 6) {
  const seen = new Set();
  return [...groups].filter(g=>g.workId && (!g.scope || g.scope.status==='confirmed'))
    .sort((a,b)=>(Number((b.work??b).bangumiVoteCount)||0)-(Number((a.work??a).bangumiVoteCount)||0)
      ||(Number((b.work??b).voteCount)||0)-(Number((a.work??a).voteCount)||0)
      ||String(a.workId).localeCompare(String(b.workId)))
    .filter(g=>{const key=g.presentationWorkId||g.sourceWorkIdentity||`edition:${g.workId}`;if(seen.has(key))return false;seen.add(key);return true;})
    .slice(0,limit).map(g=>{const w={...g.work,...g};return Object.fromEntries(['workId','title','displayTitle','imageUrl','workThumbnailPath','median','bangumiVoteCount','bangumiScore','bangumiRating'].filter(k=>w[k]!==undefined).map(k=>[k,w[k]]));});
}

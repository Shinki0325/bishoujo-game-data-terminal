import { canonicalRole, directoryRoleFor } from './credit-role-policy.js';
const vocals = new Set(['vocalist', 'vocal']);
const music = new Set(['composition', 'lyrics', 'arrangement', 'music', 'songs', 'sound-director']);
// Directory membership may overlap; identity and primary credit remain unchanged.
export function personDirectoryRoles(person) {
  if (Array.isArray(person?.directoryRoles)) return person.directoryRoles;
  const primary = canonicalRole(person?.primaryRole);
  const base = person?.directoryRole || directoryRoleFor(primary);
  const roles = Object.entries(person?.roles ?? {}).filter(([, n]) => Number(n) > 0).map(([r]) => canonicalRole(r));
  if (!roles.length) roles.push(primary);
  const result = base && base !== 'music' ? [base] : [];
  for (const role of ['voice-actor','scenario','artwork']) if (roles.includes(role)) result.push(role);
  if (roles.some(r => vocals.has(r))) result.push('vocalist');
  if (roles.some(r => music.has(r)) || (base === 'music' && !roles.some(r => vocals.has(r)))) result.push('music');
  return [...new Set(result.length ? result : ['unknown'])];
}
export const personInDirectoryRole = (person, role) => role === 'all' || personDirectoryRoles(person).includes(role);
export function personDirectoryRoleCounts(rows) {
  const counts = {};
  for (const row of rows) for (const role of personDirectoryRoles(row)) counts[role] = (counts[role] ?? 0) + 1;
  return counts;
}

export const personDirectoryVocalCount = person => Number(person.directoryVocalCount ?? ((Number(person.roles?.vocalist) || 0) + (Number(person.roles?.vocal) || 0)));
const roleMetric = (person, role) => Number(role === 'vocalist' ? person.roleStats?.vocal ?? person.vocalSongCount : role === 'voice-actor' ? person.roleStats?.voice : ['scenario','artwork'].includes(role) ? person.roleStats?.[role+'Works'] : person.roleStats?.musicWorks) || 0;
export const orderPersonDirectoryRows = (rows, role) => ['vocalist', 'voice-actor', 'music', 'scenario', 'artwork'].includes(role)
  ? [...rows].sort((a, b) => roleMetric(b, role) - roleMetric(a, role)
    || (role === 'vocalist' ? personDirectoryVocalCount(b) - personDirectoryVocalCount(a) : 0)) : rows;

export function personDirectoryMetric(person, role) {
  if (person.entityKind === 'source-placeholder') return '来源未注明姓名';
  const stats = person.roleStats ?? {};
  if (role === 'voice-actor') return stats.voice > 0 ? `配音 ${stats.voice} 个角色` : '配音记录';
  if (role === 'vocalist') return (stats.vocal ?? person.vocalSongCount) > 0 ? `演唱 ${stats.vocal ?? person.vocalSongCount} 首` : '演唱记录';
  if (['scenario','artwork'].includes(role)) return stats[role+'Works'] > 0 ? `${role==='scenario'?'剧本':'原画'} ${stats[role+'Works']} 部作品` : `${role==='scenario'?'剧本':'原画'}记录`;
  if (role === 'music') return stats.musicWorks > 0 ? `音乐制作 · ${stats.musicWorks} 部作品` : '音乐制作记录';
  return `作品 ${person.workCount}`;
}
export const personDirectoryMetricHint = role => ['scenario','artwork'].includes(role)
  ? '只计已收录的对应职责作品；按已核定作品身份跨版本去重，其他职责不计入。'
  : role === 'voice-actor'
  ? '站内已收录且有明确角色对应的配音；按已核定角色档案跨版本去重，独立角色、年龄阶段及形态保留。未对应具体角色的配音职责不冒算数量。'
  : role === 'music'
    ? '站内已收录的对应职责作品数；同一作品的多个版本和多首曲目只计一部，排序按各音乐职责涉及的作品去重。仅注明音乐制作、未细分职责的作品单列，不推断为作曲。'
  : role === 'vocalist'
    ? '站内已收录的具体歌曲，按对应职责分别计数；同一歌曲跨版本去重，已审核同曲分组归一，独立录音保留。未明确歌曲的制作职责不冒算首数。'
    : '';

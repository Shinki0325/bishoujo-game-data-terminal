// 年度生日按月日重复；使用 UTC 计算格位，今天由浏览器本地日期决定。
export const keyOf = (month, day) => `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
export const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();
export function monthGrid(year, month) {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = daysInMonth(year, month);
  return Array.from({length: Math.ceil((offset + count) / 7) * 7}, (_, i) => {
    const day = i - offset + 1;
    return day > 0 && day <= count ? {day, key: keyOf(month, day)} : null;
  });
}
export function adjacent(year, month, delta) {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {year: d.getUTCFullYear(), month: d.getUTCMonth() + 1};
}
export function matches(character, query, works) {
  const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');
  const q = normalize(query);
  return !q || [character.name, ...character.aliases, ...character.workIds.map(id => works[id]?.title || '')].some(x => normalize(x).includes(q));
}
export function imagePolicy(status, mode) {
  const safe = ['unflagged', 'reviewed-approved', 'exempt-by-work'].includes(status);
  return {visible: status !== 'missing' && (safe || mode === 'show' || mode === 'blur' && status === 'nsfw'), blurred: !safe && status === 'nsfw' && mode === 'blur'};
}

// 缺少评分人数排在已有计数之后；角色跨作品或版本只取最大值，不累加。
export function workVotes(id, votes) {
  const value = votes[id];
  return Number.isInteger(value) && value >= 0 ? value : -1;
}
export function sortCharactersByVotes(characters, votes) {
  const compareText = (a,b) => a < b ? -1 : a > b ? 1 : 0;
  const score = c => c.workIds.length ? workVotes(c.workIds[0],votes) : -1;
  return characters.map(c => ({...c, workIds: [...c.workIds].sort((a,b) => workVotes(b,votes)-workVotes(a,votes)||compareText(a,b))}))
    .sort((a,b) => score(b)-score(a)||compareText(a.name,b.name)||compareText(a.id,b.id));
}

import {buildSearchHaystack, buildPinyinSearchHaystack, normalizeLooseSearchText, normalizeGeneratedPinyinQuery} from './search-normalization.js';
import {foldCjkSearchVariants} from './cjk-search-variants.js';

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
const characterSearchKeys = new WeakMap();
let lastSearchQuery;
function searchQuery(query) {
  if(lastSearchQuery&&lastSearchQuery.raw===query)return lastSearchQuery;
  const text=normalizeLooseSearchText(query);
  return lastSearchQuery={raw:query,text,folded:foldCjkSearchVariants(text),pinyin:normalizeGeneratedPinyinQuery(query)};
}
export function matches(character, query, works) {
  const needle=searchQuery(query);
  if(!needle.text)return true;
  let keys=characterSearchKeys.get(character);
  if(!keys||keys.works!==works){
    const values=[character.name,...(character.aliases||[]),...(character.workIds||[]).map(id=>works?.[id]?.title||'')];
    keys={works,values,text:buildSearchHaystack(values,{loose:true}),pinyin:null};
    characterSearchKeys.set(character,keys);
  }
  if(keys.text.includes(needle.text)||keys.text.includes(needle.folded))return true;
  // 与人物搜索共用字形折叠、拼音词典及至少四个字母/数字的触发规则。
  // 首次输入拼音时才生成检索串，按角色缓存，避免浏览日历时批量转换。
  if(!needle.pinyin)return false;
  keys.pinyin??=buildPinyinSearchHaystack(keys.values);
  return keys.pinyin.includes(needle.pinyin);
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

// 浏览器本地日期的连续七天，包含今天；由真实日历处理跨月、跨年及闰日。
export function upcomingBirthdayDays(today=new Date(),count=7){
  return Array.from({length:count},(_,offset)=>{const date=new Date(today.getFullYear(),today.getMonth(),today.getDate()+offset);return {year:date.getFullYear(),month:date.getMonth()+1,day:date.getDate(),key:keyOf(date.getMonth()+1,date.getDate()),offset};});
}

// Display equivalence only. Source credits, song IDs and person identities are untouched.
const MUSICAL_ROLES = new Set(['vocalist', 'vocal', 'songs', 'music', 'lyrics', 'composition', 'arrangement']);
const KANA = Object.fromEntries([
  ['あいうえお', 'a i u e o'], ['かきくけこ', 'ka ki ku ke ko'],
  ['がぎぐげご', 'ga gi gu ge go'], ['さしすせそ', 'sa shi su se so'],
  ['ざじずぜぞ', 'za ji zu ze zo'], ['たちつてと', 'ta chi tsu te to'],
  ['だぢづでど', 'da ji zu de do'], ['なにぬねの', 'na ni nu ne no'],
  ['はひふへほ', 'ha hi fu he ho'], ['ばびぶべぼ', 'ba bi bu be bo'],
  ['ぱぴぷぺぽ', 'pa pi pu pe po'], ['まみむめも', 'ma mi mu me mo'],
  ['やゆよ', 'ya yu yo'], ['らりるれろ', 'ra ri ru re ro'], ['わをん', 'wa wo n'],
].flatMap(([chars, sounds]) => [...chars].map((char, i) => [char, sounds.split(' ')[i]])));
const DIGRAPHS = Object.fromEntries([
  ['き', 'ky'], ['ぎ', 'gy'], ['し', 'sh'], ['じ', 'j'], ['ち', 'ch'],
  ['に', 'ny'], ['ひ', 'hy'], ['び', 'by'], ['ぴ', 'py'], ['み', 'my'], ['り', 'ry'],
].flatMap(([char, stem]) => [['ゃ', 'a'], ['ゅ', 'u'], ['ょ', 'o']].map(([small, vowel]) => [char + small, stem + vowel])));

function normalize(value) { return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim(); }
function titleKey(value) {
  // Keep meaningful punctuation, numerals, remix/live suffixes. Never guess kanji readings.
  const title = normalize(value).replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
  if (!/^[a-z0-9ぁ-ゖ\s~〜～\-]+$/u.test(title)) return null;
  let result = '';
  for (let i = 0; i < title.length; i++) {
    const char = title[i];
    if (/[\s~〜～\-]/u.test(char)) continue;
    // Avoid conflating n + vowel/y with the na/nya mora. Apostrophe conventions vary.
    if (char === 'ん' && /[あいうえおやゆよa-z]/u.test(title[i + 1] || '')) return null;
    const pair = DIGRAPHS[title.slice(i, i + 2)];
    if (pair) { result += pair; i++; continue; }
    if (char === 'っ') {
      const next = DIGRAPHS[title.slice(i + 1, i + 3)] || KANA[title[i + 1]];
      if (!next || !/^[kstphbmdjgzr]/u.test(next)) return null;
      result += next[0]; continue;
    }
    if (KANA[char]) result += KANA[char];
    else if (/[a-z0-9]/u.test(char)) result += char;
    else return null;
  }
  return result || null;
}

function parseNote(note) {
  const clauses = [];
  // All text must be accounted for; no trailing prose or incomplete quotes may be dropped.
  const pattern = /([^「『"“]*?)(?:「([^」]+)」|『([^』]+)』|"([^"\r\n]+)"|“([^”]+)”)/gu;
  let end = 0, match;
  while ((match = pattern.exec(note))) {
    if (match.index !== end) return null;
    const prefix = match[1].replace(/^[\s、,;；]+/u, '').trim();
    const role = prefix.match(/^(.*?)(OP(?:曲)?|ED(?:曲)?|INS|Insert song|挿入歌|插入歌)\s*$/iu);
    if (!role) return null;
    const kind = /^(?:OP|ED)/iu.test(role[2]) ? role[2].slice(0, 2).toUpperCase() : 'INS';
    const title = match[2] || match[3] || match[4] || match[5];
    clauses.push({text: match[0].replace(/^[\s、,;；]+/u, '').trim(), title,
      exact: normalize(title), phonetic: titleKey(title), japanese: /[ぁ-ヺ一-龯]/u.test(title), nativeLabel: /[「『]/u.test(match[0]),
      kind, qualifier: normalize(role[1])});
    end = pattern.lastIndex;
  }
  if (!clauses.length || note.slice(end).trim()) return null;
  // Platform/route prefixes often carry over to following clauses. Keep such compounds intact.
  if (clauses.length > 1 && clauses.some(c => c.qualifier)) return null;
  return clauses;
}

function sourceContext(credit) {
  if (!credit.presentationWorkId || !credit.personId || !MUSICAL_ROLES.has(credit.roleCode)) return null;
  if (credit.scope?.status === 'conflict') return null;
  const edition = credit.sourceEdition || {};
  const ids = [...(credit.scope?.editionIds || [])].map(String).sort();
  const original = edition.kind === 'original';
  const unspecified = edition.kind === 'unspecified' && edition.id == null;
  // An unspecified EGS credit is only comparable to the original when its own work
  // is confirmed. Named editions and facts for other releases must never disappear.
  const local = unspecified && credit.source === 'egs' && credit.scope?.status === 'confirmed'
    && ids.length === 1 && ids[0] === String(credit.egsWorkId);
  return {identity: JSON.stringify([credit.presentationWorkId, credit.personId, credit.roleCode]),
    edition: JSON.stringify([edition.kind, edition.id, ids]), original, local,
    source: credit.source, ids};
}

function compatible(a, b) {
  if (!a || !b || a.identity !== b.identity) return false;
  if (a.edition === b.edition) return true;
  if (!(a.original || a.local) || !(b.original || b.local)) return false;
  if (a.ids.length && b.ids.length) return a.ids.join('|') === b.ids.join('|');
  return (a.original && b.local) || (b.original && a.local);
}

export function compactSongNoteTexts(notes, credits, readText) {
  const rows = notes.map(note => {
    const sources = credits.filter(c => readText(c).split('；').map(v => v.trim()).includes(note));
    const contexts = sources.map(sourceContext);
    return {note, clauses: parseNote(note), contexts: contexts.length && contexts.every(Boolean) ? contexts : []};
  });
  const candidates = rows.flatMap((row, rowIndex) => (row.clauses || []).map(clause => ({...clause, row, rowIndex})));
  const removed = new Set();
  for (const candidate of candidates) {
    const alternatives = candidates.filter(other => other.rowIndex !== candidate.rowIndex
      && other.kind === candidate.kind && other.qualifier === candidate.qualifier
      && candidate.row.contexts.length && other.row.contexts.length
      && candidate.row.contexts.every(a => other.row.contexts.every(b => compatible(a, b))));
    const equivalent = other => other.exact === candidate.exact
      || (other.phonetic && other.phonetic === candidate.phonetic && other.japanese !== candidate.japanese);
    const matches = alternatives.filter(equivalent);
    // If several distinct Japanese spellings share a reading, keep the romanization.
    const spellings = new Set(matches.filter(c => c.japanese).map(c => c.exact));
    if (spellings.size > 1) continue;
    const priority = c => Number(c.japanese) * 2 + Number(c.nativeLabel);
    if (matches.some(other => priority(other) > priority(candidate)
      || (priority(other) === priority(candidate) && other.rowIndex < candidate.rowIndex))) removed.add(candidate);
  }
  return rows.flatMap((row, rowIndex) => {
    const group = candidates.filter(c => c.rowIndex === rowIndex);
    if (!group.some(c => removed.has(c))) return [row.note];
    const kept = group.filter(c => !removed.has(c));
    return kept.length ? [kept.map(c => c.text).join('、')] : [];
  });
}

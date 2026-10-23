import { reviewedOriginalSongNoteDisplay } from './reviewed-original-song-note-display.js';
import { compactSongNoteTexts } from './song-note-display.js';

// An explicitly empty reviewed display must never fall back to source prose.
export function creditResponsibilityText(credit = {}) {
  // A reviewed, source-scoped display wins over the normalized source wording.
  // Keep responsibilityText and the original source fields for provenance.
  if (credit.responsibilityDisplayResolution && Object.hasOwn(credit, 'creditNoteDisplay')) return String(credit.creditNoteDisplay ?? '').trim();
  const originalDisplay = reviewedOriginalSongNoteDisplay(credit);
  if (originalDisplay !== null) return originalDisplay;
  if (Object.hasOwn(credit, 'responsibilityText')) return String(credit.responsibilityText ?? '').trim();
  if (Object.hasOwn(credit, 'creditNoteDisplay')) return String(credit.creditNoteDisplay ?? '').trim();
  return String(credit.creditNoteOriginal || (credit.roleCode !== 'voice-actor' ? credit.sourceRoleDetailName : '') || '').trim();
}

// Reviewed display equivalence only: never infer song identity from transliteration.
// The complete source statement and person/work/role must still match.
// Evidence: reports/galpedia-entity-detail-unify-20261013/song-note-review.json.
function compactReviewedCreditNoteTexts(values, credits = []) {
  const notes = [...values];
  const relevant = credits.filter(c => c.presentationWorkId === 'vndb:v57'
    && c.personId === 'per_fwb6582e2ff2f6d80a74e3ff7d' && c.roleCode === 'vocalist');
  const japanese = 'OP曲「紅空恋歌」、ED曲「祝福の大地、暁光の世界」、挿入歌「そらの隙間」';
  const romanized = 'PC OP "Akazora Renka", Insert song "Sora no Sukima", ED "Shukufuku no Daichi, Gyoukou no Sekai", Xbox 360 OP "Hakujitsumu"';
  const observed = new Set(relevant.map(creditResponsibilityText));
  if (!observed.has(romanized) || !notes.includes(romanized)) return notes;
  const pc = 'PC：OP「紅空恋歌」、ED「祝福の大地、暁光の世界」、插入歌「そらの隙間」';
  return [...new Set(notes.flatMap(note => note === romanized
    ? [pc, 'Xbox 360：OP「Hakujitsumu」']
    : note === japanese && observed.has(japanese) ? [pc] : [note]))];
}

export function compactCreditNoteTexts(values, credits = []) {
  const reviewed = compactReviewedCreditNoteTexts(values, credits);
  return compactSongNoteTexts(reviewed, credits, creditResponsibilityText);
}

export function creditResponsibilityNotes(credits = []) {
  const notes = new Map();
  for (const credit of credits) for (const value of creditResponsibilityText(credit).split('；')) {
    let text = value.trim(), key = text.normalize('NFKC').replace(/\s+/gu, ' ').toLowerCase();
    if(['art','artwork','SD原画'].includes(credit.roleCode) && ['sd','sd原画','sd 原画','sd絵担当','sdイラスト','デフォルメ原画'].includes(key)){key='sd';text='SD';}
    if (key && !notes.has(key)) notes.set(key, text);
  }
  return compactCreditNoteTexts(notes.values(), credits);
}

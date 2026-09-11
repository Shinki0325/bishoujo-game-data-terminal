/**
 * Central release-date semantics for the Terminal Wiki.
 *
 * The source value is never rewritten. The exact 2050-01-01 value is the
 * vendor's known "release date not decided" sentinel in this snapshot;
 * another 2050 date remains a real calendar date.
 */

export const RELEASE_DATE_TBD_VALUE = '2050-01-01';
export const RELEASE_DATE_TBD_YEAR = 2050;
export const RELEASE_DATE_MIN_YEAR = 1987;
export const RELEASE_DATE_DEFAULT_MAX_YEAR = 2026;

export const RELEASE_STATUS = Object.freeze({
  ALL: 'all',
  RELEASED: 'released',
  UNRELEASED: 'unreleased',
  TBD: 'tbd',
  UNKNOWN: 'unknown'
});

const DATE_RE = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/u;
const DAY_MS = 86400000;

function asRaw(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function utcOrdinal(year, month = 1, day = 1) {
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.trunc(time / DAY_MS);
}

function todayOrdinal(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return utcOrdinal(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  const match = DATE_RE.exec(asRaw(value));
  if (match) return utcOrdinal(Number(match[1]), Number(match[2] ?? 1), Number(match[3] ?? 1));
  const now = new Date();
  return utcOrdinal(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
}

/** Return a parsed, non-mutating view of a source release date. */
export function releaseDateInfo(value, { today = new Date() } = {}) {
  const raw = asRaw(value);
  const match = DATE_RE.exec(raw);
  if (!match) {
    return Object.freeze({ raw, kind: RELEASE_STATUS.UNKNOWN, year: null, date: null, ordinal: null, precision: null });
  }
  const year = Number(match[1]);
  const month = Number(match[2] ?? 1);
  const day = Number(match[3] ?? 1);
  const ordinal = year >= 1000 && year <= 2999 ? utcOrdinal(year, month, day) : null;
  if (ordinal === null) {
    return Object.freeze({ raw, kind: RELEASE_STATUS.UNKNOWN, year: null, date: null, ordinal: null, precision: null });
  }
  const precision = match[2] ? 'date' : 'year';
  const date = match[2] ? raw : `${match[1]}-01-01`;
  if (raw === RELEASE_DATE_TBD_VALUE) {
    return Object.freeze({ raw, kind: RELEASE_STATUS.TBD, year, date, ordinal, precision });
  }
  const kind = ordinal > todayOrdinal(today) ? RELEASE_STATUS.UNRELEASED : RELEASE_STATUS.RELEASED;
  return Object.freeze({ raw, kind, year, date, ordinal, precision });
}

export function releaseStatus(value, options) {
  return releaseDateInfo(value, options).kind;
}

export function releaseStatusLabel(value, options) {
  switch (releaseStatus(value, options)) {
    case RELEASE_STATUS.RELEASED: return '已发售';
    case RELEASE_STATUS.UNRELEASED: return '未发售';
    case RELEASE_STATUS.TBD: return '发售未定';
    default: return '日期未知';
  }
}

/** Compact, user-facing date text; source dates are retained verbatim. */
export function formatReleaseDate(value, options) {
  const info = releaseDateInfo(value, options);
  if (info.kind === RELEASE_STATUS.TBD) return '发售未定';
  if (info.kind === RELEASE_STATUS.UNKNOWN) return '日期未知';
  if (info.kind === RELEASE_STATUS.UNRELEASED) return `${info.raw}（未发售）`;
  return info.raw;
}

export const formatReleaseMeta = formatReleaseDate;

/** Numeric extraction for calendar logic; the vendor sentinel is not a year. */
export function releaseYear(value) {
  const info = releaseDateInfo(value);
  return info.kind === RELEASE_STATUS.TBD ? null : info.year;
}

/** Full date-range matching keeps placeholders visible only for the full window. */
export function releaseYearMatches(
  value,
  start,
  end,
  { minimum = RELEASE_DATE_MIN_YEAR, maximum = RELEASE_DATE_DEFAULT_MAX_YEAR } = {}
) {
  const lower = Number.isInteger(start) ? start : minimum;
  const upper = Number.isInteger(end) ? end : maximum;
  const info = releaseDateInfo(value);
  if (lower <= minimum && upper >= maximum) return true;
  return info.kind !== RELEASE_STATUS.TBD
    && info.kind !== RELEASE_STATUS.UNKNOWN
    && info.year >= lower
    && info.year <= upper;
}

export function releaseStatusMatches(value, status = RELEASE_STATUS.ALL, options) {
  if (!status || status === RELEASE_STATUS.ALL) return true;
  const kind = releaseStatus(value, options);
  if (status === RELEASE_STATUS.UNRELEASED) return kind === RELEASE_STATUS.UNRELEASED || kind === RELEASE_STATUS.TBD;
  return kind === status;
}

function sortRank(info) {
  if (info.kind === RELEASE_STATUS.TBD) return 1;
  if (info.kind === RELEASE_STATUS.UNKNOWN) return 2;
  return 0;
}

/** Keep TBD/unknown at the end in either direction. */
export function releaseDateSortCompare(left, right, { direction = 'asc', today = new Date() } = {}) {
  const a = releaseDateInfo(left, { today });
  const b = releaseDateInfo(right, { today });
  const rankDifference = sortRank(a) - sortRank(b);
  if (rankDifference) return rankDifference;
  if (a.ordinal === null || b.ordinal === null) return a.raw.localeCompare(b.raw);
  const multiplier = direction === 'desc' ? -1 : 1;
  return (a.ordinal - b.ordinal) * multiplier || a.raw.localeCompare(b.raw);
}

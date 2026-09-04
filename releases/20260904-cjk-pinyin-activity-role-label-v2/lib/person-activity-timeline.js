export const PERSON_ACTIVITY_BUCKET_YEARS = 2;
export const PERSON_ACTIVITY_DETAIL_MIN_YEARS = 12;
export const PERSON_ACTIVITY_EARLY_END_YEAR = 1998;

function yearValue(value) {
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 && year < 3000 ? year : null;
}

export function normalizePersonActivityBounds(bounds) {
  const startYear = yearValue(bounds?.startYear);
  const endYear = yearValue(bounds?.endYear);
  const bucketCount = Number(bounds?.bucketCount);
  if (startYear === null || endYear === null || endYear < startYear) return null;
  if (!Array.isArray(bounds?.buckets) || !bounds.buckets.length || bucketCount !== bounds.buckets.length) return null;
  const buckets = [];
  let expectedStart = startYear;
  for (const item of bounds.buckets) {
    const bucketStart = yearValue(item?.startYear);
    const bucketEnd = yearValue(item?.endYear);
    if (bucketStart !== expectedStart || bucketEnd === null || bucketEnd < bucketStart || bucketEnd > endYear) return null;
    buckets.push(Object.freeze({ startYear: bucketStart, endYear: bucketEnd }));
    expectedStart = bucketEnd + 1;
  }
  if (expectedStart !== endYear + 1) return null;
  const labelYears = (Array.isArray(bounds?.labelYears) ? bounds.labelYears : [])
    .map(yearValue)
    .filter((year, index, values) => year !== null && year >= startYear && year <= endYear && values.indexOf(year) === index);
  if (!labelYears.length || labelYears[0] !== startYear || labelYears.at(-1) !== endYear) return null;
  return Object.freeze({ startYear, endYear, bucketCount, buckets: Object.freeze(buckets), labelYears: Object.freeze(labelYears) });
}

function buildDirectoryBuckets(startYear, endYear) {
  const buckets = [];
  let nextYear = startYear;
  if (startYear <= PERSON_ACTIVITY_EARLY_END_YEAR && endYear > PERSON_ACTIVITY_EARLY_END_YEAR) {
    const earlyMidpoint = Math.floor((startYear + PERSON_ACTIVITY_EARLY_END_YEAR) / 2);
    buckets.push({ startYear, endYear: earlyMidpoint });
    buckets.push({ startYear: earlyMidpoint + 1, endYear: PERSON_ACTIVITY_EARLY_END_YEAR });
    nextYear = PERSON_ACTIVITY_EARLY_END_YEAR + 1;
  }
  for (let year = nextYear; year <= endYear; year += PERSON_ACTIVITY_BUCKET_YEARS) {
    buckets.push({ startYear: year, endYear: Math.min(endYear, year + PERSON_ACTIVITY_BUCKET_YEARS - 1) });
  }
  return buckets;
}

export function resolvePersonActivityBounds(persons, currentYear = new Date().getFullYear()) {
  const years = [];
  for (const person of Array.isArray(persons) ? persons : []) {
    const firstYear = yearValue(person?.firstYear);
    const lastYear = yearValue(person?.lastYear);
    if (firstYear !== null) years.push(firstYear);
    if (lastYear !== null) years.push(lastYear);
  }
  const safeCurrentYear = yearValue(currentYear) ?? new Date().getFullYear();
  const startYear = years.length ? Math.min(...years) : safeCurrentYear;
  const endYear = Math.max(safeCurrentYear, ...(years.length ? years : [safeCurrentYear]));
  const buckets = buildDirectoryBuckets(startYear, endYear);
  return normalizePersonActivityBounds({
    startYear,
    endYear,
    bucketCount: buckets.length,
    buckets,
    labelYears: [startYear, 2000, 2010, 2020, endYear]
  });
}

export function buildPersonDirectoryActivity(years, bounds) {
  const normalized = normalizePersonActivityBounds(bounds);
  if (!normalized) return [];
  const { startYear, endYear, bucketCount, buckets: activityBuckets } = normalized;
  const buckets = Array.from({ length: bucketCount }, () => 0);
  for (const rawYear of Array.isArray(years) ? years : []) {
    const year = yearValue(rawYear);
    if (year === null || year < startYear || year > endYear) continue;
    const index = activityBuckets.findIndex(bucket => year >= bucket.startYear && year <= bucket.endYear);
    if (index >= 0) buckets[index] += 1;
  }
  const peak = Math.max(1, ...buckets);
  return buckets.map(value => value === 0 ? 0 : Math.round(value / peak * 100));
}

export function extendPersonActivityYears(person, currentYear = new Date().getFullYear()) {
  const source = Array.isArray(person?.activityYears) ? person.activityYears : [];
  const sourceYears = source.map(item => yearValue(item?.year)).filter(year => year !== null);
  const firstYear = yearValue(person?.firstYear) ?? (sourceYears.length ? Math.min(...sourceYears) : null);
  const lastRecordedYear = yearValue(person?.lastYear) ?? (sourceYears.length ? Math.max(...sourceYears) : null);
  if (firstYear === null || lastRecordedYear === null) return [];
  const safeCurrentYear = yearValue(currentYear) ?? lastRecordedYear;
  const endYear = Math.max(lastRecordedYear, safeCurrentYear);
  const startYear = Math.min(firstYear, endYear - PERSON_ACTIVITY_DETAIL_MIN_YEARS + 1);
  const counts = new Map(source.map(item => [yearValue(item?.year), Math.max(0, Number(item?.count) || 0)]).filter(([year]) => year !== null));
  const peak = Math.max(1, ...counts.values());
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => {
    const year = startYear + index;
    const count = counts.get(year) ?? 0;
    return Object.freeze({ year, count, percent: count === 0 ? 0 : Math.round(count / peak * 100) });
  });
}

export function formatPersonActivitySpan(firstYear, lastYear) {
  const first = yearValue(firstYear);
  const last = yearValue(lastYear);
  if (first === null || last === null) return '日期未知';
  return first === last ? String(first) : `${first}–${last}`;
}

export function activityAxisLabelYears(bounds) {
  return normalizePersonActivityBounds(bounds)?.labelYears ?? [];
}

export function activityAxisLabelPosition(bounds, year) {
  const normalized = normalizePersonActivityBounds(bounds);
  const targetYear = yearValue(year);
  if (!normalized || targetYear === null) return null;
  if (targetYear === normalized.startYear) return 0;
  if (targetYear === normalized.endYear) return 100;
  const index = normalized.buckets.findIndex(bucket => targetYear >= bucket.startYear && targetYear <= bucket.endYear);
  if (index < 0) return null;
  return (index + 1) / normalized.bucketCount * 100;
}

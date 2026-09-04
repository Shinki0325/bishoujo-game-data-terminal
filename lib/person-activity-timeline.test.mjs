import assert from 'node:assert/strict';
import {
  activityAxisLabelPosition,
  activityAxisLabelYears,
  buildPersonDirectoryActivity,
  extendPersonActivityYears,
  formatPersonActivitySpan,
  normalizePersonActivityBounds,
  resolvePersonActivityBounds
} from './person-activity-timeline.js';

const bounds = resolvePersonActivityBounds([
  { firstYear: 1989, lastYear: 2010 },
  { firstYear: 2003, lastYear: 2003 },
  { firstYear: 2008, lastYear: 2026 }
], 2026);
assert.deepEqual(bounds, {
  startYear: 1989,
  endYear: 2026,
  bucketCount: 16,
  buckets: [
    { startYear: 1989, endYear: 1993 },
    { startYear: 1994, endYear: 1998 },
    { startYear: 1999, endYear: 2000 },
    { startYear: 2001, endYear: 2002 },
    { startYear: 2003, endYear: 2004 },
    { startYear: 2005, endYear: 2006 },
    { startYear: 2007, endYear: 2008 },
    { startYear: 2009, endYear: 2010 },
    { startYear: 2011, endYear: 2012 },
    { startYear: 2013, endYear: 2014 },
    { startYear: 2015, endYear: 2016 },
    { startYear: 2017, endYear: 2018 },
    { startYear: 2019, endYear: 2020 },
    { startYear: 2021, endYear: 2022 },
    { startYear: 2023, endYear: 2024 },
    { startYear: 2025, endYear: 2026 }
  ],
  labelYears: [1989, 2000, 2010, 2020, 2026]
});
assert.deepEqual(normalizePersonActivityBounds(bounds), bounds);
assert.equal(normalizePersonActivityBounds({ ...bounds, bucketCount: 18 }), null);
assert.deepEqual(activityAxisLabelYears(bounds), [1989, 2000, 2010, 2020, 2026]);
assert.equal(activityAxisLabelPosition(bounds, 1989), 0);
assert.equal(activityAxisLabelPosition(bounds, 2000), 18.75);
assert.equal(activityAxisLabelPosition(bounds, 2010), 50);
assert.equal(activityAxisLabelPosition(bounds, 2020), 81.25);
assert.equal(activityAxisLabelPosition(bounds, 2026), 100);

const activity = buildPersonDirectoryActivity([2000, 2001, 2001, 2009, 2010], bounds);
assert.equal(activity.length, 16);
assert.equal(activity.filter(Boolean).length, 3);
assert.equal(activity.at(-1), 0);
const earlyActivity = buildPersonDirectoryActivity([1989, 1993, 1994, 1998, 1999], bounds);
assert.equal(earlyActivity.length, 16);
assert.equal(earlyActivity[0], 100);
assert.equal(earlyActivity[1], 100);
assert.equal(earlyActivity[2], 50);

const extended = extendPersonActivityYears({
  firstYear: 2000,
  lastYear: 2010,
  activityYears: Array.from({ length: 11 }, (_, index) => ({ year: 2000 + index, count: index === 0 ? 2 : 1 }))
}, 2026);
assert.equal(extended[0].year, 2000);
assert.equal(extended.at(-1).year, 2026);
assert.equal(extended.find(item => item.year === 2010).count, 1);
assert.equal(extended.find(item => item.year === 2011).count, 0);
assert.equal(extended.find(item => item.year === 2011).percent, 0);

const recentSingle = extendPersonActivityYears({ firstYear: 2024, lastYear: 2024, activityYears: [{ year: 2024, count: 1 }] }, 2026);
assert.equal(recentSingle.length, 12);
assert.equal(recentSingle[0].year, 2015);
assert.equal(formatPersonActivitySpan(2003, 2003), '2003');
assert.equal(formatPersonActivitySpan(2000, 2010), '2000–2010');

console.log('person activity timeline checks: 24/24');

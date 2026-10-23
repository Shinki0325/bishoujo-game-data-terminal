import {WORK_FULL_CARDS} from '../lib/work-full-cards-config.js';
import {createAvailableSplitWorkCards} from '../lib/split-work-cards.js';

// Keep the static analysis facts; only EGS edition ratings follow the main site's
// pinned descriptor. No metadata shards or media are needed for this projection.
export async function projectAnalysisRatings(core, {
  config = WORK_FULL_CARDS.split,
  createReader = createAvailableSplitWorkCards,
} = {}) {
  if (!config) return {rows: core, status: 'snapshot', revision: null};
  try {
    const reader = createReader(config, {requestPolicy: {timeoutMs: 2500, maxAttempts: 1}});
    const project = await reader.queryProjection();
    const manifest = await reader.manifest();
    const ids = new Set(core.map(row => row.id));
    if (ids.size !== core.length || ids.size !== manifest.count
      || manifest.workIds.some(id => !ids.has(id))) throw Error('分析作品目录与评分目录不一致');
    const rawProject = reader.queryRawProjection ? await reader.queryRawProjection() : () => null;
    const rows = core.map(row => {
      const value = project({workId: row.id});
      const raw = rawProject(row.id);
      return {...row, median: value.median, votes: value.voteCount,
        ...(raw?.vndb ? {vndb: raw.vndb.rawRating, vndbVotes: raw.vndb.voteCount} : {}),
        ...(raw?.bangumi ? {bangumi: raw.bangumi.rawScore, bangumiVotes: raw.bangumi.voteCount} : {})};
    });
    return {rows, status: reader.usingFallback ? 'previous' : 'current', revision: reader.revision};
  } catch {
    // An optional rating refresh must not take away an otherwise usable workbench.
    return {rows: core, status: 'snapshot-unavailable', revision: null};
  }
}

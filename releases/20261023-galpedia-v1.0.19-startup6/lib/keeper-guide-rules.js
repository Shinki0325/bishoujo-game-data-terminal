import {
  KEEPER_GUIDE_CONTENT_VERSION,
  normalizeKeeperGuideId
} from './keeper-guide-preferences.js';

export const KEEPER_GUIDE_FEATURE = 'keeperGuide';

const TEXT = Object.freeze({
  bangumiInput: Object.freeze({
    expression: 'neutral', title: '从你的公开收藏开始',
    summary: '填写 Bangumi 用户名、UID 或个人主页链接，读取公开游戏收藏。不需要登录；读取后先确认匹配结果，不会立即改动排榜。',
    helpArticleId: 'tier.bangumi', actionId: null
  }),
  bangumiResult: Object.freeze({
    expression: 'smile', title: '先核对，再加入候选池',
    summary: '默认勾选可导入的主作品，其他版本可展开选择。未匹配的条目不会自动导入；确认后只追加所选作品，已有候选和档位保持不变。',
    helpArticleId: 'tier.bangumi', actionId: null
  }),
  helpOverview: Object.freeze({
    expression: 'smile',
    title: '当前页面的使用说明',
    summary: '从当前页面的概览开始，按需要查看这里的操作与数据说明。',
    helpArticleId: 'home.overview',
    actionId: 'open-help-overview'
  }),
  compareZero: Object.freeze({
    expression: 'neutral',
    title: '先选两部作品，再开始比较',
    summary: '在作品卡上加入作品；选满两部后，就可以并排查看它们。',
    helpArticleId: 'works.compare',
    actionId: 'focus-compare-selection'
  }),
  compareOne: Object.freeze({
    expression: 'neutral',
    title: '再选一部作品即可比较',
    summary: '当前已有 1 部作品，再从作品卡加入 1 部就能开始比较。',
    helpArticleId: 'works.compare',
    actionId: 'focus-compare-selection'
  }),
  tierStart: Object.freeze({
    expression: 'smile',
    title: '先把想排的作品加入候选池',
    summary: '可以从作品库选择，也可以导入 Bangumi 公开收藏，再把作品放进排榜。',
    helpArticleId: 'tier.overview',
    actionId: 'go-to-work-selection'
  }),
  tierFirstDrag: Object.freeze({
    expression: 'none',
    title: '把一部作品拖到一个等级里',
    summary: '从候选作品中拖动一部到目标等级，开始排序。',
    helpArticleId: 'tier.overview',
    actionId: null
  })
});

const OUTPUT_KEYS = Object.freeze([
  'id',
  'contentVersion',
  'showEnhancement',
  'showPortrait',
  'expression',
  'title',
  'summary',
  'helpArticleId',
  'actionId'
]);

const DISALLOWED_AUTO_STATUSES = new Set([
  'unready',
  'not-ready',
  'loading',
  'error',
  'busy',
  'live',
  'topoverlay',
  'top-overlay'
]);

const DISALLOWED_LOAD_STATES = new Set([
  'unready',
  'not-ready',
  'loading',
  'error',
  'busy'
]);

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function finiteCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.floor(value));
}

function optionalCount(snapshot, keys) {
  for (const key of keys) {
    const value = finiteCount(snapshot[key]);
    if (value !== null) return value;
  }
  return null;
}

function guideMarkContains(value, id) {
  if (!value) return false;
  if (value instanceof Set) {
    return value.has(id) || [...value].some((entry) => normalizeKeeperGuideId(entry) === id);
  }
  if (Array.isArray(value)) {
    return value.some((entry) => {
      if (typeof entry === 'string') return normalizeKeeperGuideId(entry) === id;
      if (!isObject(entry)) return false;
      return normalizeKeeperGuideId(entry.id) === id && entry.contentVersion === KEEPER_GUIDE_CONTENT_VERSION;
    });
  }
  if (!isObject(value)) return false;
  for (const [rawId, version] of Object.entries(value)) {
    if (normalizeKeeperGuideId(rawId) === id && version === KEEPER_GUIDE_CONTENT_VERSION) return true;
  }
  return false;
}

function marked(prefs, field, id) {
  if (!isObject(prefs)) return false;
  return guideMarkContains(prefs[field], id);
}

function featureEnabled(snapshot, prefs) {
  if (isObject(snapshot) && (
    snapshot.featureEnabled === false ||
    snapshot.keeperGuideEnabled === false ||
    snapshot.enabled === false ||
    snapshot[KEEPER_GUIDE_FEATURE] === false ||
    snapshot.featureFlags?.[KEEPER_GUIDE_FEATURE] === false ||
    snapshot.flags?.[KEEPER_GUIDE_FEATURE] === false
  )) return false;
  if (isObject(prefs) && (
    prefs.featureEnabled === false ||
    prefs.keeperGuideEnabled === false ||
    prefs[KEEPER_GUIDE_FEATURE] === false ||
    prefs.featureFlags?.[KEEPER_GUIDE_FEATURE] === false ||
    prefs.flags?.[KEEPER_GUIDE_FEATURE] === false
  )) return false;
  return true;
}

function resolveSceneId(snapshot) {
  if (!isObject(snapshot)) return null;
  return normalizeKeeperGuideId(snapshot.id ?? snapshot.scene ?? snapshot.guideId);
}

function isOverviewArticleId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9-]*\.overview$/.test(value);
}

function helpArticleId(snapshot) {
  if (isOverviewArticleId(snapshot.helpArticleId)) return snapshot.helpArticleId;
  if (isOverviewArticleId(snapshot.articleId)) return snapshot.articleId;
  return TEXT.helpOverview.helpArticleId;
}

function flagIsActive(value, activeValues = ['true', 'open', 'active']) {
  return value === true || (typeof value === 'string' && activeValues.includes(value.toLowerCase()));
}

function hasAutomaticReadyState(snapshot) {
  if (snapshot.ready !== true || snapshot.restored !== true) return false;
  if (flagIsActive(snapshot.busy) || flagIsActive(snapshot.isBusy)) return false;
  if (flagIsActive(snapshot.live) || flagIsActive(snapshot.isLive)) return false;
  if (flagIsActive(snapshot.liveMode, ['true', 'open', 'active', 'live'])) return false;
  if (flagIsActive(snapshot.topOverlay) || flagIsActive(snapshot.topOverlayOpen)) return false;
  if (flagIsActive(snapshot.dialogOpen) || flagIsActive(snapshot.hasTopOverlay)) return false;
  const status = typeof snapshot.status === 'string' ? snapshot.status.toLowerCase() : '';
  const loadState = typeof snapshot.loadState === 'string' ? snapshot.loadState.toLowerCase() : '';
  return !DISALLOWED_AUTO_STATUSES.has(status) && !DISALLOWED_LOAD_STATES.has(loadState);
}

function showPortrait(snapshot, prefs, enhancement, textOnly = false) {
  if (!enhancement || textOnly) return false;
  if (isObject(prefs) && prefs.illustrations === false) return false;
  if (snapshot.suppressPortrait === true) return false;
  return true;
}

function baseGuide(id, copy, snapshot, prefs, enhancement, textOnly = false) {
  const result = {
    id,
    contentVersion: KEEPER_GUIDE_CONTENT_VERSION,
    showEnhancement: enhancement,
    showPortrait: showPortrait(snapshot, prefs, enhancement, textOnly),
    expression: copy.expression,
    title: copy.title,
    summary: copy.summary,
    helpArticleId: copy.helpArticleId,
    actionId: copy.actionId
  };
  // Keep the public return contract deliberate if copy objects grow later.
  return Object.freeze(Object.fromEntries(OUTPUT_KEYS.map((key) => [key, result[key]])));
}

function rankingCounts(snapshot) {
  // `candidateTotal` and `rankedTotal` are supplied by the adapter from the
  // unfiltered model. These fallbacks are only for small embedders/tests.
  const rankedTotal = optionalCount(snapshot, ['rankedTotal', 'rankedCount']);
  if (rankedTotal === null) return null;
  let candidateTotal = optionalCount(snapshot, ['candidateTotal']);
  if (candidateTotal === null) {
    const selectedIds = Array.isArray(snapshot.selectedWorkIds)
      ? snapshot.selectedWorkIds
      : Array.isArray(snapshot.workIds) ? snapshot.workIds : null;
    if (selectedIds) candidateTotal = selectedIds.length;
    else candidateTotal = optionalCount(snapshot, ['selectedWorkCount', 'workTotal', 'totalWorkCount']);
  }
  if (candidateTotal === null) return null;
  return { candidateTotal, rankedTotal };
}

function isWorkRanking(snapshot) {
  const workspace = snapshot.workspace ?? snapshot.surface;
  const subject = snapshot.rankingSubject ?? snapshot.subject;
  if (workspace !== undefined && workspace !== 'ranking') return false;
  if (subject !== undefined && subject !== 'work') return false;
  return workspace === 'ranking' && subject === 'work';
}

/**
 * Resolve one guide enhancement from an immutable adapter snapshot.
 *
 * The resolver is intentionally side-effect free. It never marks a guide as
 * dismissed/completed; the adapter must call the preference store only after
 * a real user action has completed.
 */
export function resolveKeeperGuide(snapshot, prefs = {}) {
  if (!isObject(snapshot) || !featureEnabled(snapshot, prefs)) return null;
  const id = resolveSceneId(snapshot);
  if (!id) return null;

  const isHelpOverview = id === 'helpOverview';
  if (!isHelpOverview && !hasAutomaticReadyState(snapshot)) return null;

  if (id === 'helpOverview') {
    const enhancement = !marked(prefs, 'dismissed', id) && !marked(prefs, 'completed', id);
    const copy = {
      ...TEXT.helpOverview,
      helpArticleId: helpArticleId(snapshot)
    };
    return baseGuide(id, copy, snapshot, prefs, enhancement);
  }

  if (id === 'bangumi.input' || id === 'bangumi.result') {
    if (snapshot.importDialogOpen !== true || snapshot.p1Enabled !== true) return null;
    const phase = id === 'bangumi.input' ? 'input' : 'result';
    if (snapshot.importPhase !== phase) return null;
    const enhancement = prefs.autoTips !== false && !marked(prefs, 'dismissed', id) && !marked(prefs, 'completed', id);
    return baseGuide(id, phase === 'input' ? TEXT.bangumiInput : TEXT.bangumiResult, snapshot, prefs, enhancement);
  }

  if (id === 'compareActive') {
    if (snapshot.compareActive === false || snapshot.mode === 'browse') return null;
    const selectedCount = optionalCount(snapshot, [
      'compareSelectedCount',
      'selectedCompareCount',
      'selectedCount'
    ]);
    const compareIds = Array.isArray(snapshot.compareWorkIds) ? snapshot.compareWorkIds : null;
    const actualCount = compareIds ? compareIds.length : selectedCount;
    if (actualCount === null) return null;
    const compareMin = optionalCount(snapshot, ['compareMin', 'minimumCompareCount']);
    if (compareMin !== null && compareMin < 1) return null;
    if (compareMin === null && (snapshot.compareMin !== undefined || snapshot.minimumCompareCount !== undefined)) return null;
    const minimum = compareMin ?? 2;
    if (actualCount >= minimum) return null;
    const remaining = Math.max(0, minimum - actualCount);
    const copy = actualCount === 0
      ? {
        ...TEXT.compareZero,
        title: `先选 ${minimum} 部作品，再开始比较`,
        summary: `在作品卡上加入作品；还需选择 ${remaining} 部才能开始比较。`
      }
      : {
        ...TEXT.compareOne,
        title: `再选 ${remaining} 部作品即可比较`,
        summary: `当前已有 ${actualCount} 部作品，再从作品卡加入 ${remaining} 部就能开始比较。`
      };
    const enhancement = Boolean(
      prefs.autoTips !== false &&
      !marked(prefs, 'dismissed', id) &&
      !marked(prefs, 'completed', id)
    );
    return baseGuide(id, copy, snapshot, prefs, enhancement);
  }

  if (id === 'tier.start' || id === 'tier.firstDrag') {
    if (!isWorkRanking(snapshot)) return null;
    const counts = rankingCounts(snapshot);
    if (!counts) return null;
    const { candidateTotal, rankedTotal } = counts;
    if (candidateTotal === 0 && rankedTotal === 0) {
      const outputId = 'tier.start';
      const enhancement = Boolean(
        prefs.autoTips !== false &&
        !marked(prefs, 'dismissed', outputId) &&
        !marked(prefs, 'completed', outputId)
      );
      return baseGuide(outputId, TEXT.tierStart, snapshot, prefs, enhancement);
    }
    if (candidateTotal > 0 && rankedTotal === 0) {
      const outputId = 'tier.firstDrag';
      const enhancement = Boolean(
        prefs.autoTips !== false &&
        !marked(prefs, 'dismissed', outputId) &&
        !marked(prefs, 'completed', outputId)
      );
      return baseGuide(outputId, TEXT.tierFirstDrag, snapshot, prefs, enhancement, true);
    }
  }

  return null;
}

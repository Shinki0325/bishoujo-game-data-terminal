import {
  CATALOG_WORK_LIMIT,
  queryCatalog
} from './catalog.js?v=20260824-selection-source-sorting-v1';
import {
  canRedo,
  canUndo,
  commitHistory,
  createEditSnapshot,
  createHistory,
  redoHistory,
  undoHistory
} from './history.js';
import {
  clearTierOrder,
  insertIntoTier,
  removeFromTiers
} from './ordered-board.js';
import { applyTierConfig } from './tier-config.js';
import {
  applyDeselectWorks,
  planCurrentResultToggle,
  planDeselectWorks,
  selectWorks as addSelectedWorks,
  selectionStateForResults
} from './selection.js';
import { planSharedSelectionImport } from './share-import.js';
import {
  DEFAULT_FILTER_STATE,
  STORAGE_KEY,
  StateValidationError,
  USER_WORK_LIMIT,
  consumeRecoverableStoredStateError,
  createDefaultState,
  exportState,
  importState,
  loadState,
  validateState
} from './state.js?v=20260824-selection-source-sorting-v1';

const BULK_CONFIRM_THRESHOLD = 200;
const JSON_EXPORT_FILENAME = 'egs-tier-100-state-v5.json';
const JSON_MIME_TYPE = 'application/json;charset=utf-8';

function cloneValue(value) {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneValue(item)]));
  }
  return value;
}

function cloneDefaultFilterState() {
  return {
    ...DEFAULT_FILTER_STATE,
    brandIds: [...DEFAULT_FILTER_STATE.brandIds],
    positiveFilterIds: [...DEFAULT_FILTER_STATE.positiveFilterIds],
    excludedFilterIds: [...DEFAULT_FILTER_STATE.excludedFilterIds],
    excludeNukige: DEFAULT_FILTER_STATE.excludeNukige,
    attributeSelections: Object.fromEntries(
      Object.entries(DEFAULT_FILTER_STATE.attributeSelections).map(([groupId, filterIds]) => [
        groupId,
        [...filterIds]
      ])
    )
  };
}

function timestamp(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('now must return a valid date value');
  return date.toISOString();
}

function sameEdit(left, right) {
  if (left.selectedWorkIds.length !== right.selectedWorkIds.length) return false;
  for (let index = 0; index < left.selectedWorkIds.length; index += 1) {
    if (left.selectedWorkIds[index] !== right.selectedWorkIds[index]) return false;
  }
  if (left.tiers.length !== right.tiers.length) return false;
  for (let index = 0; index < left.tiers.length; index += 1) {
    const leftTier = left.tiers[index];
    const rightTier = right.tiers[index];
    if (
      leftTier.id !== rightTier.id
      || leftTier.name !== rightTier.name
      || leftTier.colorId !== rightTier.colorId
    ) return false;
  }
  for (const { id: tierId } of left.tiers) {
    if (left.tierOrder[tierId].length !== right.tierOrder[tierId].length) return false;
    for (let index = 0; index < left.tierOrder[tierId].length; index += 1) {
      if (left.tierOrder[tierId][index] !== right.tierOrder[tierId][index]) return false;
    }
  }
  return true;
}

function resolveStorageMethod(storage, name, { required = false } = {}) {
  let current = storage;
  for (let depth = 0; current !== null && depth < 16; depth += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(current, name);
    if (descriptor !== undefined) {
      if (!Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`storage.${name} must be a data property`);
      }
      if (typeof descriptor.value !== 'function') {
        if (!required && descriptor.value === undefined) return null;
        throw new TypeError(`storage.${name} must be a function`);
      }
      return descriptor.value;
    }
    current = Object.getPrototypeOf(current);
  }
  if (required) throw new TypeError(`storage.${name} must be a function`);
  return null;
}

function createStorageAdapter(storage) {
  const getItem = resolveStorageMethod(storage, 'getItem', { required: true });
  const setItem = resolveStorageMethod(storage, 'setItem');
  const removeItem = resolveStorageMethod(storage, 'removeItem');
  return {
    getItem(key) {
      return Reflect.apply(getItem, storage, [key]);
    },
    setItem(key, value) {
      if (setItem === null) throw new TypeError('storage.setItem must be a function');
      return Reflect.apply(setItem, storage, [key, value]);
    },
    removeItem: removeItem === null
      ? null
      : key => Reflect.apply(removeItem, storage, [key])
  };
}

export function createAppController({ sample, localWorks = [], storage, confirm, announce, now, downloadJson }) {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new TypeError('sample must be an object');
  }
  if (!Array.isArray(sample.works) || !Array.isArray(sample.filters)) {
    throw new TypeError('sample must contain works and filters arrays');
  }
  if (sample.works.length > CATALOG_WORK_LIMIT) {
    throw new RangeError(`sample.works exceeds the ${CATALOG_WORK_LIMIT} entry limit`);
  }
  if (
    typeof confirm !== 'function'
    || typeof announce !== 'function'
    || typeof now !== 'function'
    || typeof downloadJson !== 'function'
  ) {
    throw new TypeError('confirm, announce, now, and downloadJson must be functions');
  }

  if (!Array.isArray(localWorks)) throw new TypeError('localWorks must be an array');
  const authorityWorkIds = sample.works.map(work => work.workId);
  const workById = new Map(sample.works.map(work => [work.workId, work]));
  function validateLocalWorks(works) {
    if (!Array.isArray(works)) throw new TypeError('local works must be an array');
    const additions = [];
    const seen = new Set(workById.keys());
    for (const work of works) {
      if (
        work === null || typeof work !== 'object' || Array.isArray(work)
        || typeof work.workId !== 'string' || !work.workId.startsWith('custom-local-')
        || typeof work.workGroupId !== 'string' || work.workGroupId !== work.workId
        || typeof work.title !== 'string' || typeof work.localMediaKind !== 'string'
        || seen.has(work.workId)
      ) throw new TypeError('local work is invalid or duplicated');
      seen.add(work.workId);
      additions.push(work);
    }
    return additions;
  }
  for (const work of validateLocalWorks(localWorks)) {
    workById.set(work.workId, work);
    authorityWorkIds.push(work.workId);
  }
  const filterDefinitions = [
    ...sample.filters,
    ...(Array.isArray(sample.genreFilters) ? sample.genreFilters : []),
    ...(Array.isArray(sample.platformFilters) ? sample.platformFilters : [])
  ];
  const knownFilterIds = [...new Set(filterDefinitions.map(filter => filter.filterId))];
  const attributeGroupByFilterId = Object.fromEntries(
    filterDefinitions
      .filter(filter => ['game-type', 'platform', 'length'].includes(filter.groupId))
      .map(filter => [filter.filterId, filter.groupId])
  );
  const authority = {
    sampleId: sample.sampleId,
    workIds: authorityWorkIds,
    filterIds: knownFilterIds,
    attributeGroupByFilterId,
    workGroupByEditionWorkId: Object.fromEntries(
      [...workById.values()].map(work => [
        work.workId,
        typeof work.workGroupId === 'string' && work.workGroupId.length > 0
          ? work.workGroupId
          : work.workId
      ])
    )
  };
  const publicAuthority = {
    sampleId: authority.sampleId,
    workIds: [...sample.works.map(work => work.workId)],
    filterIds: [...knownFilterIds],
    attributeGroupByFilterId: { ...attributeGroupByFilterId },
    workGroupByEditionWorkId: Object.fromEntries(sample.works.map(work => [
      work.workId,
      typeof work.workGroupId === 'string' && work.workGroupId.length > 0
        ? work.workGroupId
        : work.workId
    ]))
  };
  let storageUsable = storage !== null && typeof storage === 'object';
  let storageAdapter = storageUsable ? createStorageAdapter(storage) : null;
  let storageWarningShown = false;

  function warnStorageOnce(message) {
    if (storageWarningShown) return false;
    storageWarningShown = true;
    try {
      announce(message, 'warning');
    } catch {
      // Storage fallback must remain usable even when the warning surface fails.
    }
    return true;
  }

  function loadInitialState() {
    try {
      return loadState(storageAdapter, authority);
    } catch (error) {
      if (!consumeRecoverableStoredStateError(error)) {
        if (
          error instanceof StateValidationError
          && error.code === 'STORAGE_READ_FAILED'
          && error.cause instanceof StateValidationError
        ) {
          throw error.cause;
        }
        throw error;
      }
      if (storageAdapter.removeItem === null) {
        storageUsable = false;
      } else {
        try {
          storageAdapter.removeItem(STORAGE_KEY);
        } catch {
          storageUsable = false;
        }
      }
      warnStorageOnce('Stored state was corrupt and has been reset to defaults.');
      return createDefaultState(sample.sampleId);
    }
  }

  let state;
  if (!storageUsable) {
    state = createDefaultState(sample.sampleId);
  } else {
    try {
      state = loadInitialState();
    } catch (error) {
      if (error?.code !== 'STORAGE_READ_FAILED') throw error;
      storageUsable = false;
      warnStorageOnce('本地状态读取失败，已改用当前页面内存状态');
      state = createDefaultState(sample.sampleId);
    }
  }
  // Retain an explicit restored workspace. Fresh state starts in the work library.
  state = validateState(state, authority);
  let history = createHistory(createEditSnapshot(state));

  function persistPayload(payload) {
    if (!storageUsable) return false;
    try {
      storageAdapter.setItem(STORAGE_KEY, payload);
      return true;
    } catch {
      storageUsable = false;
      warnStorageOnce('本地保存失败，后续变更仅保留在当前页面');
      return false;
    }
  }

  function persist() {
    return persistPayload(exportState(state));
  }

  function replaceState(overrides) {
    state = validateState({
      ...state,
      ...overrides,
      savedAt: timestamp(now)
    }, authority);
    persist();
    return true;
  }

  function commitEdit(
    nextSelectedWorkIds,
    nextTierOrder,
    workspaceMode = state.workspaceMode,
    nextTiers = state.tiers
  ) {
    const currentEdit = createEditSnapshot(state);
    const nextSelectedWorkRefs = nextSelectedWorkIds.map(editionWorkId => {
      const work = workById.get(editionWorkId);
      return {
        workGroupId: typeof work?.workGroupId === 'string' && work.workGroupId.length > 0
          ? work.workGroupId
          : editionWorkId,
        editionWorkId
      };
    });
    const nextState = validateState({
      ...state,
      selectedWorkIds: nextSelectedWorkIds,
      selectedWorkRefs: nextSelectedWorkRefs,
      tiers: nextTiers,
      tierOrder: nextTierOrder,
      workspaceMode,
      savedAt: timestamp(now)
    }, authority);
    const nextEdit = createEditSnapshot(nextState);
    if (sameEdit(currentEdit, nextEdit)) return false;
    const nextHistory = commitHistory(history, nextEdit);
    state = nextState;
    history = nextHistory;
    persist();
    return true;
  }

  function commitCandidateEdit(nextSelection) {
    return commitEdit(nextSelection.selectedWorkIds, nextSelection.tierOrder);
  }

  function restoreHistory(nextHistory) {
    const nextEdit = createEditSnapshot(nextHistory.present);
    if (sameEdit(createEditSnapshot(state), nextEdit)) return false;
    const nextState = validateState({
      ...state,
      selectedWorkIds: nextEdit.selectedWorkIds,
      selectedWorkRefs: nextEdit.selectedWorkIds.map(editionWorkId => {
        const work = workById.get(editionWorkId);
        return {
          workGroupId: typeof work?.workGroupId === 'string' && work.workGroupId.length > 0
            ? work.workGroupId
            : editionWorkId,
          editionWorkId
        };
      }),
      tiers: nextEdit.tiers,
      tierOrder: nextEdit.tierOrder,
      workspaceMode: state.workspaceMode,
      savedAt: timestamp(now)
    }, authority);
    state = nextState;
    history = nextHistory;
    persist();
    return true;
  }

  function visibleWorks(visibleWorkIds) {
    if (visibleWorkIds === undefined) {
      return queryCatalog(
        sample.works,
        state.filterState,
        knownFilterIds,
        state.selectedWorkIds
      );
    }
    if (!Array.isArray(visibleWorkIds)) throw new TypeError('visibleWorkIds must be an array');
    const seen = new Set();
    return visibleWorkIds.map(workId => {
      if (seen.has(workId)) throw new TypeError(`duplicate visible work ID ${String(workId)}`);
      seen.add(workId);
      const work = workById.get(workId);
      if (!work) throw new TypeError(`unknown visible work ID ${String(workId)}`);
      return work;
    });
  }

  function selectRequested(workIds, { confirmLarge = true } = {}) {
    const selectedWorkIds = addSelectedWorks(state.selectedWorkIds, workIds, authorityWorkIds);
    const plannedSelectionCount = selectedWorkIds.length - state.selectedWorkIds.length;
    if (
      confirmLarge
      && plannedSelectionCount > BULK_CONFIRM_THRESHOLD
      && !confirm(`将选择 ${plannedSelectionCount} 个结果，是否继续？`)
    ) {
      return false;
    }
    commitCandidateEdit({ selectedWorkIds, tierOrder: state.tierOrder });
    return true;
  }

  function deselectRequested(workIds) {
    const plan = planDeselectWorks(state.tiers, state.selectedWorkIds, state.tierOrder, workIds);
    if (
      plan.requiresRankedConfirmation
      && !confirm(`将取消 ${plan.rankedWorkIds.length} 个已排榜作品，是否继续？`)
    ) {
      return false;
    }
    const next = applyDeselectWorks(state.tiers, state.selectedWorkIds, state.tierOrder, plan.workIds);
    commitCandidateEdit(next);
    return true;
  }

  return Object.freeze({
    inspect(visibleWorkIds) {
      const visible = visibleWorks(visibleWorkIds);
      const rankedCount = state.tiers.reduce(
        (total, tier) => total + state.tierOrder[tier.id].length,
        0
      );
      return {
        state: cloneValue(state),
        visibleWorks: visible.slice(),
        selectAllState: selectionStateForResults(
          visible.map(work => work.workId),
          state.selectedWorkIds
        ),
        selectedCount: state.selectedWorkIds.length,
        rankedCount,
        unrankedCount: state.selectedWorkIds.length - rankedCount,
        canUndo: canUndo(history),
        canRedo: canRedo(history),
        historyPastCount: history.past.length,
        historyFutureCount: history.future.length
      };
    },

    inspectState() {
      return cloneValue(state);
    },

    setFilterState(nextFilterState) {
      if (nextFilterState === null || typeof nextFilterState !== 'object' || Array.isArray(nextFilterState)) {
        throw new TypeError('nextFilterState must be an object');
      }
      return replaceState({
        filterState: {
          ...state.filterState,
          ...cloneValue(nextFilterState)
        }
      });
    },

    clearFilters() {
      return replaceState({ filterState: cloneDefaultFilterState() });
    },

    setWorkspaceMode(workspaceMode) {
      return replaceState({ workspaceMode });
    },

    setSelectionCardView(selectionCardView) {
      return replaceState({ selectionCardView });
    },

    selectWorks(workIds) {
      return selectRequested(workIds);
    },

    importSharedWorks(workIds, { mode = 'append' } = {}) {
      const plan = planSharedSelectionImport({
        sharedWorkIds: workIds,
        authorityWorkIds,
        currentSelectedWorkIds: state.selectedWorkIds,
        mode
      });
      const nextTierOrder = mode === 'replace'
        ? Object.fromEntries(state.tiers.map(tier => [tier.id, []]))
        : state.tierOrder;
      const changed = commitEdit(plan.nextSelectedWorkIds, nextTierOrder, 'ranking');
      if (!changed) throw new Error('shared import made no state change');
      return plan;
    },

    toggleCurrentResults(visibleWorkIds) {
      const resultWorkIds = visibleWorks(visibleWorkIds).map(work => work.workId);
      const plan = planCurrentResultToggle({
        tiers: state.tiers,
        resultWorkIds,
        selectedWorkIds: state.selectedWorkIds,
        tierOrder: state.tierOrder,
        bulkConfirmThreshold: BULK_CONFIRM_THRESHOLD
      });
      if (plan.action === 'select') {
        if (
          plan.requiresLargeSelectionConfirmation
          && !confirm(`将选择 ${plan.workIds.length} 个结果，是否继续？`)
        ) {
          return false;
        }
        return selectRequested(plan.workIds, { confirmLarge: false });
      }
      return deselectRequested(plan.workIds);
    },

    deselectWorks(workIds) {
      return deselectRequested(workIds);
    },

    registerLocalWorks(works) {
      const additions = validateLocalWorks(works);
      if (state.selectedWorkIds.length + additions.length > USER_WORK_LIMIT) {
        throw new RangeError(`selected works cannot exceed ${USER_WORK_LIMIT}`);
      }
      for (const work of additions) {
        workById.set(work.workId, work);
        authorityWorkIds.push(work.workId);
        authority.workGroupByEditionWorkId[work.workId] = work.workGroupId;
      }
      try {
        const changed = commitEdit(
          [...state.selectedWorkIds, ...additions.map(work => work.workId)],
          state.tierOrder,
          'ranking'
        );
        if (!changed) throw new Error('local work registration made no state change');
        return true;
      } catch (error) {
        for (const work of additions) {
          workById.delete(work.workId);
          authorityWorkIds.splice(authorityWorkIds.indexOf(work.workId), 1);
          delete authority.workGroupByEditionWorkId[work.workId];
        }
        throw error;
      }
    },

    moveToTier(workId, destinationTierId, insertionIndex) {
      const nextTierOrder = insertIntoTier(
        state.tiers,
        state.tierOrder,
        workId,
        destinationTierId,
        insertionIndex,
        state.selectedWorkIds
      );
      return commitEdit(state.selectedWorkIds, nextTierOrder);
    },

    moveCandidatesToTier(workIds, destinationTierId, insertionIndex) {
      if (!Array.isArray(workIds) || workIds.length === 0) {
        throw new TypeError('workIds must be a non-empty array');
      }
      const seen = new Set();
      const ranked = new Set(state.tiers.flatMap(tier => state.tierOrder[tier.id]));
      const candidates = workIds.map((workId, index) => {
        if (typeof workId !== 'string' || workId.length === 0) {
          throw new TypeError(`workIds[${index}] must be a non-empty string`);
        }
        if (seen.has(workId)) throw new TypeError('workIds must be unique');
        if (ranked.has(workId)) throw new TypeError(`workId ${workId} is already ranked`);
        seen.add(workId);
        return workId;
      });
      let nextTierOrder = state.tierOrder;
      for (let index = 0; index < candidates.length; index += 1) {
        nextTierOrder = insertIntoTier(
          state.tiers,
          nextTierOrder,
          candidates[index],
          destinationTierId,
          insertionIndex + index,
          state.selectedWorkIds
        );
      }
      return commitEdit(state.selectedWorkIds, nextTierOrder);
    },

    moveToUnranked(workId) {
      const nextTierOrder = removeFromTiers(
        state.tiers,
        state.tierOrder,
        workId,
        state.selectedWorkIds
      );
      return commitEdit(state.selectedWorkIds, nextTierOrder);
    },

    clearBoard() {
      const nextTierOrder = clearTierOrder(state.tiers, state.tierOrder, state.selectedWorkIds);
      return commitEdit(state.selectedWorkIds, nextTierOrder);
    },

    clearCandidates() {
      if (state.selectedWorkIds.length === 0) return false;
      if (!confirm(`将清空 ${state.selectedWorkIds.length} 个候选作品及全部分级，是否继续？`)) {
        return false;
      }
      const nextTierOrder = clearTierOrder(state.tiers, state.tierOrder, state.selectedWorkIds);
      return commitEdit([], nextTierOrder);
    },

    saveTierConfig(nextTiers) {
      const applied = applyTierConfig({
        currentTiers: state.tiers,
        currentTierOrder: state.tierOrder,
        nextTiers
      });
      return commitEdit(
        state.selectedWorkIds,
        applied.tierOrder,
        state.workspaceMode,
        applied.tiers
      );
    },

    undo() {
      if (!canUndo(history)) return false;
      return restoreHistory(undoHistory(history));
    },

    redo() {
      if (!canRedo(history)) return false;
      return restoreHistory(redoHistory(history));
    },

    prospectiveCount(patch) {
      return queryCatalog(
        sample.works,
        { ...state.filterState, ...cloneValue(patch) },
        knownFilterIds,
        state.selectedWorkIds
      ).length;
    },

    prospectiveCounts(patches) {
      if (!Array.isArray(patches)) throw new TypeError('patches must be an array');
      return patches.map(patch => queryCatalog(
        sample.works,
        { ...state.filterState, ...cloneValue(patch) },
        knownFilterIds,
        state.selectedWorkIds
      ).length);
    },

    importJson(jsonText) {
      const imported = importState(jsonText, authority);
      const nextState = validateState({
        ...imported,
        savedAt: timestamp(now)
      }, authority);
      const nextHistory = createHistory(createEditSnapshot(nextState));
      const payload = exportState(nextState);

      state = nextState;
      history = nextHistory;
      persistPayload(payload);
      return true;
    },

    exportJson() {
      const isLocal = workId => workById.get(workId)?.localMediaKind === 'custom';
      const selectedWorkIds = state.selectedWorkIds.filter(workId => !isLocal(workId));
      const tierOrder = Object.fromEntries(state.tiers.map(tier => [
        tier.id,
        state.tierOrder[tier.id].filter(workId => !isLocal(workId))
      ]));
      const projected = validateState({
        ...state,
        selectedWorkIds,
        selectedWorkRefs: selectedWorkIds.map(editionWorkId => ({
          editionWorkId,
          workGroupId: publicAuthority.workGroupByEditionWorkId[editionWorkId]
        })),
        tierOrder
      }, publicAuthority);
      const payload = Object.freeze({
        filename: JSON_EXPORT_FILENAME,
        text: exportState(projected),
        mimeType: JSON_MIME_TYPE,
        omittedCustomCount: state.selectedWorkIds.length - selectedWorkIds.length
      });
      downloadJson(payload);
      return payload;
    }
  });
}

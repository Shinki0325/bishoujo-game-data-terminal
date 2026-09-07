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
  selectWorks as addSelectedWorks
} from './selection.js';
import { planSharedSelectionImport } from './share-import.js';
import {
  DEFAULT_FILTER_STATE,
  STORAGE_KEY,
  StateValidationError,
  prepareStateAuthority,
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
    personIds: [...DEFAULT_FILTER_STATE.personIds],
    personRole: DEFAULT_FILTER_STATE.personRole,
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

export function createAppController({ sample, catalogAuthority = null, resolveWork = null, localWorks = [], storage, confirm, announce, now, downloadJson }) {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new TypeError('sample must be an object');
  }
  const idOnly = catalogAuthority !== null;
  if ((!idOnly && !Array.isArray(sample.works)) || !Array.isArray(sample.filters)) {
    throw new TypeError('sample must contain works and filters arrays');
  }
  if (idOnly && (!Array.isArray(catalogAuthority.workIds) || typeof resolveWork !== 'function')) {
    throw new TypeError('ID-only controller requires catalog workIds and resolveWork');
  }
  const publicWorkIds = idOnly ? [...catalogAuthority.workIds] : sample.works.map(work => work.workId);
  if (publicWorkIds.length > CATALOG_WORK_LIMIT) {
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
  const authorityWorkIds = [...publicWorkIds];
  // In ID mode this map contains custom works only. Catalog identities and
  // version ownership must not depend on whether a card has been hydrated.
  const workById = new Map(idOnly ? [] : sample.works.map(work => [work.workId, work]));
  const catalogIds = new Set(publicWorkIds);
  const publicGroups = idOnly
    ? { ...catalogAuthority.workGroupByEditionWorkId }
    : Object.fromEntries(sample.works.map(work => [work.workId,
      typeof work.workGroupId === 'string' && work.workGroupId.length > 0 ? work.workGroupId : work.workId]));
  function validateLocalWorks(works) {
    if (!Array.isArray(works)) throw new TypeError('local works must be an array');
    const additions = [];
    const seen = new Set([...catalogIds, ...workById.keys()]);
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
    workGroupByEditionWorkId: { ...publicGroups, ...Object.fromEntries(
      [...workById.values()].map(work => [
        work.workId,
        typeof work.workGroupId === 'string' && work.workGroupId.length > 0
          ? work.workGroupId
          : work.workId
      ])
    ) }
  };
  const publicAuthority = {
    sampleId: authority.sampleId,
    workIds: [...publicWorkIds],
    filterIds: [...knownFilterIds],
    attributeGroupByFilterId: { ...attributeGroupByFilterId },
    workGroupByEditionWorkId: { ...publicGroups }
  };
  let storageUsable = storage !== null && typeof storage === 'object';
  let stateAuthority = prepareStateAuthority(authority);
  let publicStateAuthority = localWorks.length === 0 ? stateAuthority : null;
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
      return loadState(storageAdapter, stateAuthority);
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
  state = validateState(state, stateAuthority);
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
    }, stateAuthority);
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
      return {
        workGroupId: authority.workGroupByEditionWorkId[editionWorkId],
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
    }, stateAuthority);
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
        return {
          workGroupId: authority.workGroupByEditionWorkId[editionWorkId],
          editionWorkId
        };
      }),
      tiers: nextEdit.tiers,
      tierOrder: nextEdit.tierOrder,
      workspaceMode: state.workspaceMode,
      savedAt: timestamp(now)
    }, stateAuthority);
    state = nextState;
    history = nextHistory;
    persist();
    return true;
  }

  function checkedVisibleIds(visibleWorkIds) {
    if (visibleWorkIds === undefined) {
      if (idOnly) throw new TypeError('ID-only controller requires Worker result IDs');
      return queryCatalog(
        sample.works,
        state.filterState,
        knownFilterIds,
        state.selectedWorkIds
      ).map(work => work.workId);
    }
    if (!Array.isArray(visibleWorkIds)) throw new TypeError('visibleWorkIds must be an array');
    if (visibleWorkIds.length > CATALOG_WORK_LIMIT) throw new RangeError('visible work IDs exceed catalog capacity');
    const seen = new Set();
    const visible = [];
    for (let index = 0; index < visibleWorkIds.length; index++) {
      if (!Object.hasOwn(visibleWorkIds, index)) throw new TypeError('visible work IDs must be dense');
      const workId = visibleWorkIds[index];
      if (seen.has(workId)) throw new TypeError(`duplicate visible work ID ${String(workId)}`);
      seen.add(workId);
      if (!catalogIds.has(workId) && !workById.has(workId)) throw new TypeError(`unknown visible work ID ${String(workId)}`);
      if (!idOnly && workById.get(workId)?.workId !== workId) throw new TypeError('visible work identity changed');
      visible.push(workId);
    }
    return visible;
  }

  function visibleWorks(visibleWorkIds) {
    return checkedVisibleIds(visibleWorkIds).map(workId => {
      const work = workById.get(workId) ?? resolveWork?.(workId);
      if (!work || work.workId !== workId) throw new TypeError('visible work identity changed or is not loaded');
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
      // visibleWorks already checked every ID against the validated catalog.
      // Do not descriptor-snapshot the same full result list a second time.
      const selected = new Set(state.selectedWorkIds);
      let visibleSelected = 0;
      if (selected.size > 0) for (const work of visible) if (selected.has(work.workId)) visibleSelected++;
      const rankedCount = state.tiers.reduce(
        (total, tier) => total + state.tierOrder[tier.id].length,
        0
      );
      return {
        state: cloneValue(state),
        visibleWorks: visible,
        selectAllState: visibleSelected === 0 ? 'none' : visibleSelected === visible.length ? 'all' : 'some',
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
      const resultWorkIds = checkedVisibleIds(visibleWorkIds);
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
      const previousAuthority = stateAuthority;
      if (state.selectedWorkIds.length + additions.length > USER_WORK_LIMIT) {
        throw new RangeError(`selected works cannot exceed ${USER_WORK_LIMIT}`);
      }
      for (const work of additions) {
        workById.set(work.workId, work);
        authorityWorkIds.push(work.workId);
        authority.workGroupByEditionWorkId[work.workId] = work.workGroupId;
      }
      try {
        stateAuthority = prepareStateAuthority(authority);
        const changed = commitEdit(
          [...state.selectedWorkIds, ...additions.map(work => work.workId)],
          state.tierOrder,
          'ranking'
        );
        if (!changed) throw new Error('local work registration made no state change');
        return true;
      } catch (error) {
        stateAuthority = previousAuthority;
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
      if (idOnly) throw new TypeError('ID-only controller requires Worker projected counts');
      return queryCatalog(
        sample.works,
        { ...state.filterState, ...cloneValue(patch) },
        knownFilterIds,
        state.selectedWorkIds
      ).length;
    },

    prospectiveCounts(patches) {
      if (idOnly) throw new TypeError('ID-only controller requires Worker projected counts');
      if (!Array.isArray(patches)) throw new TypeError('patches must be an array');
      return patches.map(patch => queryCatalog(
        sample.works,
        { ...state.filterState, ...cloneValue(patch) },
        knownFilterIds,
        state.selectedWorkIds
      ).length);
    },

    importJson(jsonText) {
      const imported = importState(jsonText, stateAuthority);
      const nextState = validateState({
        ...imported,
        savedAt: timestamp(now)
      }, stateAuthority);
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
      }, publicStateAuthority ??= prepareStateAuthority(publicAuthority));
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

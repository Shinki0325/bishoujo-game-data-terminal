import { normalizeTiers } from './tier-config.js';
import { USER_WORK_LIMIT } from './work-limit.js';
export const COMPANY_RANKING_STORAGE_KEY = 'egs-tier-company-ranking-v1';
export const COMPANY_HISTORY_LIMIT = 100;

function copyOrder(order) {
  return Object.fromEntries(Object.entries(order).map(([tierId, companyIds]) => [tierId, [...companyIds]]));
}

function knownTierIds(tiers) {
  if (!Array.isArray(tiers)) throw new TypeError('tiers must be an array');
  return new Set(tiers.map(tier => tier?.id).filter(id => typeof id === 'string' && id.length > 0));
}

function normalizeStored(value, companyIds, tierIds) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Array.isArray(value.selectedCompanyIds) || value.tierOrder === null || typeof value.tierOrder !== 'object' || Array.isArray(value.tierOrder)) return null;
  const selected = [...new Set(value.selectedCompanyIds.filter(id => companyIds.has(id)))];
  const selectedSet = new Set(selected);
  const order = Object.fromEntries([...tierIds].map(tierId => [tierId, []]));
  const ranked = new Set();
  for (const tierId of tierIds) {
    const row = value.tierOrder[tierId];
    if (!Array.isArray(row)) continue;
    for (const companyId of row) {
      if (selectedSet.has(companyId) && !ranked.has(companyId)) {
        order[tierId].push(companyId);
        ranked.add(companyId);
      }
    }
  }
  return { selectedCompanyIds: selected, tierOrder: order };
}

export function createCompanyRanking({ companies, tiers, storage = null, announce = () => {} }) {
  if (!Array.isArray(companies)) throw new TypeError('companies must be an array');
  const companyIds = new Set(companies.map(company => company?.companyId).filter(id => typeof id === 'string' && id.length > 0));
  let definitions = normalizeTiers(tiers).map(tier => ({ ...tier }));
  let tierIds = knownTierIds(definitions);
  let selectedCompanyIds = [];
  let tierOrder = Object.fromEntries([...tierIds].map(tierId => [tierId, []]));
  const past = [];
  const future = [];

  try {
    const stored = storage?.getItem?.(COMPANY_RANKING_STORAGE_KEY);
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : null;
    const storedTiers = parsed?.tiers ? normalizeTiers(parsed.tiers) : definitions;
    const normalized = normalizeStored(parsed, companyIds, knownTierIds(storedTiers));
    if (normalized) { definitions = storedTiers.map(tier => ({ ...tier })); tierIds = knownTierIds(definitions); }
    if (normalized) { ({ selectedCompanyIds, tierOrder } = normalized); if (!parsed.tiers) persist(); }
  } catch {
    // A missing, malformed, or unavailable local store starts a clean company board.
  }

  function persist() {
    try {
      storage?.setItem?.(COMPANY_RANKING_STORAGE_KEY, JSON.stringify({ schemaVersion: 2, tiers: definitions, selectedCompanyIds, tierOrder }));
    } catch {
      // The interactive board remains usable when storage is unavailable.
    }
  }

  function snapshot() {
    return {
      tiers: definitions.map(tier => ({ ...tier })),
      selectedCompanyIds: [...selectedCompanyIds],
      tierOrder: copyOrder(tierOrder)
    };
  }

  function restore(next) {
    definitions = next.tiers.map(tier => ({ ...tier }));
    tierIds = knownTierIds(definitions);
    selectedCompanyIds = [...next.selectedCompanyIds];
    tierOrder = copyOrder(next.tierOrder);
    persist();
  }

  function mutate(change) {
    const before = snapshot();
    const changed = change() && JSON.stringify(before) !== JSON.stringify(snapshot());
    if (changed) {
      past.push(before);
      if (past.length > COMPANY_HISTORY_LIMIT) past.shift();
      future.length = 0;
      persist();
    }
    return changed;
  }

  function removeFromAll(companyId) {
    for (const tierId of tierIds) tierOrder[tierId] = tierOrder[tierId].filter(id => id !== companyId);
  }

  function inspect() {
    const selected = new Set(selectedCompanyIds);
    const ranked = new Set(Object.values(tierOrder).flat());
    return Object.freeze({
      tiers: Object.freeze(definitions.map(tier => Object.freeze({ ...tier }))),
      selectedCompanyIds: Object.freeze([...selectedCompanyIds]),
      tierOrder: Object.freeze(copyOrder(tierOrder)),
      candidateCompanyIds: Object.freeze(selectedCompanyIds.filter(id => !ranked.has(id))),
      selectedSet: selected,
      rankedCount: ranked.size,
      canUndo: past.length > 0,
      canRedo: future.length > 0
    });
  }

  return Object.freeze({
    inspect,
    removeMany(ids) {
      return mutate(() => {
        const removing = new Set(ids);
        selectedCompanyIds = selectedCompanyIds.filter(id => !removing.has(id));
        for (const id of ids) removeFromAll(id);
        return true;
      });
    },
    moveMany(ids, tierId, index = 0) {
      if (!tierIds.has(tierId) || !ids.every(id => selectedCompanyIds.includes(id))) return false;
      return mutate(() => {
        const moving = [...new Set(ids)];
        for (const id of moving) removeFromAll(id);
        tierOrder[tierId].splice(Math.max(0, Math.min(index, tierOrder[tierId].length)), 0, ...moving);
        return true;
      });
    },
    toggle(companyId, selected) {
      return mutate(() => {
        if (!companyIds.has(companyId)) return false;
        const has = selectedCompanyIds.includes(companyId);
        if (selected && !has && selectedCompanyIds.length >= USER_WORK_LIMIT) {
          announce(`会社榜最多选择 ${USER_WORK_LIMIT} 家，请先移除部分候选。`, 'error');
          return false;
        }
        if (selected && !has) selectedCompanyIds = [...selectedCompanyIds, companyId];
        if (!selected && has) {
          selectedCompanyIds = selectedCompanyIds.filter(id => id !== companyId);
          removeFromAll(companyId);
        }
        return true;
      });
    },
    moveToTier(companyId, tierId, index = null) {
      return mutate(() => {
        if (!companyIds.has(companyId) || !tierIds.has(tierId) || !selectedCompanyIds.includes(companyId)) return false;
        removeFromAll(companyId);
        const row = tierOrder[tierId];
        const insertion = Number.isInteger(index) ? Math.max(0, Math.min(index, row.length)) : row.length;
        row.splice(insertion, 0, companyId);
        return true;
      });
    },
    moveToCandidates(companyId) {
      return mutate(() => {
        if (!companyIds.has(companyId) || !selectedCompanyIds.includes(companyId)) return false;
        removeFromAll(companyId);
        return true;
      });
    },
    setTiers(nextTiers) {
      const nextDefinitions = normalizeTiers(nextTiers).map(tier => ({ ...tier }));
      return mutate(() => {
        const nextTierIds = knownTierIds(nextDefinitions);
        const nextOrder = Object.fromEntries([...nextTierIds].map(tierId => [
          tierId,
          tierOrder[tierId] ?? []
        ]));
        const changed = JSON.stringify(nextDefinitions) !== JSON.stringify(definitions)
          || JSON.stringify(nextOrder) !== JSON.stringify(tierOrder);
        tierIds = nextTierIds;
        definitions = nextDefinitions;
        tierOrder = nextOrder;
        return changed;
      });
    },
    importState(value) {
      if (value?.schemaVersion !== undefined && ![1, 2].includes(value.schemaVersion)) throw new TypeError('unsupported company ranking version');
      if (value?.schemaVersion === 2 && !Array.isArray(value.tiers)) throw new TypeError('company tiers missing');
      const nextDefinitions = value?.tiers ? normalizeTiers(value.tiers).map(tier => ({ ...tier })) : definitions;
      const next = normalizeStored(value, companyIds, knownTierIds(nextDefinitions));
      if (next === null) throw new TypeError('company ranking JSON is invalid');
      if (next.selectedCompanyIds.length > USER_WORK_LIMIT) throw new TypeError('company ranking exceeds 200 items');
      return mutate(() => {
        const changed = JSON.stringify(nextDefinitions) !== JSON.stringify(definitions)
          || JSON.stringify(next.selectedCompanyIds) !== JSON.stringify(selectedCompanyIds)
          || JSON.stringify(next.tierOrder) !== JSON.stringify(tierOrder);
        selectedCompanyIds = [...next.selectedCompanyIds];
        tierOrder = copyOrder(next.tierOrder);
        definitions = nextDefinitions.map(tier => ({ ...tier }));
        tierIds = knownTierIds(definitions);
        return changed;
      });
    },
    clearBoard() {
      return mutate(() => {
        const changed = Object.values(tierOrder).some(row => row.length > 0);
        for (const tierId of tierIds) tierOrder[tierId] = [];
        return changed;
      });
    },
    clearCandidates() {
      return mutate(() => {
        const ranked = new Set(Object.values(tierOrder).flat());
        const next = selectedCompanyIds.filter(companyId => ranked.has(companyId));
        const changed = next.length !== selectedCompanyIds.length;
        selectedCompanyIds = next;
        return changed;
      });
    },
    undo() {
      const previous = past.pop();
      if (!previous) return false;
      future.push(snapshot());
      restore(previous);
      return true;
    },
    redo() {
      const next = future.pop();
      if (!next) return false;
      past.push(snapshot());
      if (past.length > COMPANY_HISTORY_LIMIT) past.shift();
      restore(next);
      return true;
    }
  });
}

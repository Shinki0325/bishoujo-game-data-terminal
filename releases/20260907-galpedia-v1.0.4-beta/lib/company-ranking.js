export const COMPANY_RANKING_STORAGE_KEY = 'egs-tier-company-ranking-v1';

function copyOrder(order) {
  return Object.fromEntries(Object.entries(order).map(([tierId, companyIds]) => [tierId, [...companyIds]]));
}

function knownTierIds(tiers) {
  if (!Array.isArray(tiers)) throw new TypeError('tiers must be an array');
  return new Set(tiers.map(tier => tier?.id).filter(id => typeof id === 'string' && id.length > 0));
}

function normalizeStored(value, companyIds, tierIds) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!Array.isArray(value.selectedCompanyIds) || value.tierOrder === null || typeof value.tierOrder !== 'object') return null;
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

export function createCompanyRanking({ companies, tiers, storage = null }) {
  if (!Array.isArray(companies)) throw new TypeError('companies must be an array');
  const companyIds = new Set(companies.map(company => company?.companyId).filter(id => typeof id === 'string' && id.length > 0));
  let tierIds = knownTierIds(tiers);
  let selectedCompanyIds = [];
  let tierOrder = Object.fromEntries([...tierIds].map(tierId => [tierId, []]));
  const past = [];
  const future = [];

  try {
    const stored = storage?.getItem?.(COMPANY_RANKING_STORAGE_KEY);
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : null;
    const normalized = normalizeStored(parsed, companyIds, tierIds);
    if (normalized) ({ selectedCompanyIds, tierOrder } = normalized);
  } catch {
    // A missing, malformed, or unavailable local store starts a clean company board.
  }

  function persist() {
    try {
      storage?.setItem?.(COMPANY_RANKING_STORAGE_KEY, JSON.stringify({ selectedCompanyIds, tierOrder }));
    } catch {
      // The interactive board remains usable when storage is unavailable.
    }
  }

  function snapshot() {
    return {
      selectedCompanyIds: [...selectedCompanyIds],
      tierOrder: copyOrder(tierOrder)
    };
  }

  function restore(next) {
    selectedCompanyIds = [...next.selectedCompanyIds];
    tierOrder = copyOrder(next.tierOrder);
    persist();
  }

  function mutate(change) {
    const before = snapshot();
    const changed = change();
    if (changed) {
      past.push(before);
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
    toggle(companyId, selected) {
      return mutate(() => {
        if (!companyIds.has(companyId)) return false;
        const has = selectedCompanyIds.includes(companyId);
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
      return mutate(() => {
        const nextTierIds = knownTierIds(nextTiers);
        const nextOrder = Object.fromEntries([...nextTierIds].map(tierId => [
          tierId,
          tierOrder[tierId] ?? []
        ]));
        const changed = JSON.stringify([...nextTierIds]) !== JSON.stringify([...tierIds])
          || JSON.stringify(nextOrder) !== JSON.stringify(tierOrder);
        tierIds = nextTierIds;
        tierOrder = nextOrder;
        return changed;
      });
    },
    importState(value) {
      const next = normalizeStored(value, companyIds, tierIds);
      if (next === null) throw new TypeError('company ranking JSON is invalid');
      return mutate(() => {
        const changed = JSON.stringify(next.selectedCompanyIds) !== JSON.stringify(selectedCompanyIds)
          || JSON.stringify(next.tierOrder) !== JSON.stringify(tierOrder);
        selectedCompanyIds = [...next.selectedCompanyIds];
        tierOrder = copyOrder(next.tierOrder);
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
      restore(next);
      return true;
    }
  });
}

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
  const tierIds = knownTierIds(tiers);
  let selectedCompanyIds = [];
  let tierOrder = Object.fromEntries([...tierIds].map(tierId => [tierId, []]));

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
      selectedSet: selected
    });
  }

  return Object.freeze({
    inspect,
    toggle(companyId, selected) {
      if (!companyIds.has(companyId)) return false;
      const has = selectedCompanyIds.includes(companyId);
      if (selected && !has) selectedCompanyIds = [...selectedCompanyIds, companyId];
      if (!selected && has) {
        selectedCompanyIds = selectedCompanyIds.filter(id => id !== companyId);
        removeFromAll(companyId);
      }
      persist();
      return true;
    },
    moveToTier(companyId, tierId, index = null) {
      if (!companyIds.has(companyId) || !tierIds.has(tierId) || !selectedCompanyIds.includes(companyId)) return false;
      removeFromAll(companyId);
      const row = tierOrder[tierId];
      const insertion = Number.isInteger(index) ? Math.max(0, Math.min(index, row.length)) : row.length;
      row.splice(insertion, 0, companyId);
      persist();
      return true;
    },
    moveToCandidates(companyId) {
      if (!companyIds.has(companyId) || !selectedCompanyIds.includes(companyId)) return false;
      removeFromAll(companyId);
      persist();
      return true;
    }
  });
}

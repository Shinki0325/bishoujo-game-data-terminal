import { appendTier } from './tier-config.js';

// Dispatches board operations to their existing state owners. It neither keeps
// a second selection/undo stack nor owns the active subject or persistence.
export function createRankingWorkspaceController({
  works, companies, getSubject, commit, confirm, createId, focusTier, completeFirstDrag
}) {
  const isCompany = () => getSubject() === 'company';
  const activeState = () => isCompany() ? companies.inspect() : works.inspectState();
  const saveTiers = tiers => isCompany() ? companies.setTiers(tiers) : works.saveTierConfig(tiers);
  function move(work, company) {
    const subject = getSubject();
    const changed = commit(() => subject === 'company' ? company() : work());
    if (changed && subject !== 'company') completeFirstDrag();
    return changed;
  }
  return Object.freeze({
    moveToTier: (id, tierId, index) => move(() => works.moveToTier(id, tierId, index), () => companies.moveToTier(id, tierId, index)),
    moveToUnranked: id => commit(() => isCompany() ? companies.moveToCandidates(id) : works.moveToUnranked(id)),
    setTiers: tiers => commit(() => saveTiers(tiers)),
    deleteTier(tierId) {
      return commit(() => {
        const state = activeState(), tier = state.tiers.find(item => item.id === tierId);
        if (!tier || state.tiers.length <= 3) return false;
        const count = (isCompany() ? companies.inspect() : state).tierOrder[tierId]?.length ?? 0;
        if (count > 0 && !confirm(`等级“${tier.name}”中有 ${count} ${isCompany() ? '家会社' : '部作品'}，删除后将移回候选区。是否继续？`)) return false;
        return saveTiers(state.tiers.filter(item => item.id !== tierId));
      });
    },
    addTier() {
      return commit(() => {
        const tiers = appendTier(activeState().tiers, createId);
        focusTier(tiers.at(-1).id);
        return saveTiers(tiers);
      });
    },
    removeCandidate: id => commit(() => isCompany() ? companies.toggle(id, false) : works.deselectWorks([id])),
    removeCandidates: ids => commit(() => isCompany() ? companies.removeMany(ids) : works.deselectWorks(ids)),
    moveCandidatesToTier: (ids, tierId, index) => move(
      () => works.moveCandidatesToTier(ids, tierId, index),
      () => companies.moveMany(ids, tierId, index)
    ),
    undo: () => commit(() => isCompany() ? companies.undo() : works.undo()),
    redo: () => commit(() => isCompany() ? companies.redo() : works.redo()),
    buildCompanyModel(builder, items) {
      const ranking = companies.inspect();
      return builder({ selectedWorkIds: ranking.selectedCompanyIds, tiers: ranking.tiers, tierOrder: ranking.tierOrder }, items, '');
    }
  });
}

export function projectCompanyRankingItems(companies, imageUrlForCompany) {
  return new Map(companies.map(company => {
    const imageUrl = imageUrlForCompany(company);
    return [company.companyId, {
      workId: company.companyId, title: company.brandName, company,
      companyImageUrl: imageUrl, coverPath: imageUrl ?? `company:${company.companyId}`,
      coverWidth: 512, coverHeight: 512
    }];
  }));
}

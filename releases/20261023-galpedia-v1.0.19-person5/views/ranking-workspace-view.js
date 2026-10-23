// Adapts the ranking workspace chrome without owning board/selection state.
export function createRankingWorkspaceView({ elements, getView, syncCandidateTray }) {
  return Object.freeze({ render({ model, subject, presentation, coverUrls }) {
    const view = getView();
    elements.showCounts.checked = presentation.showCounts;
    elements.showTitles.checked = presentation.showTitles;
    view.setShowCounts(presentation.showCounts);
    view.setShowTitles(presentation.showTitles);
    view.setAnnotations(presentation.annotations);
    const company = subject === 'company';
    elements.root.classList.toggle('is-company-ranking', company);
    elements.subjectWork.setAttribute('aria-pressed', String(!company));
    elements.subjectCompany.setAttribute('aria-pressed', String(company));
    elements.candidatesTitle.textContent = company ? '候选会社' : '候选作品';
    syncCandidateTray();
    elements.candidateSearch.closest('.search-field').hidden = company;
    elements.candidateSearch.placeholder = '搜索候选标题';
    view.render(model, coverUrls);
    view.setMobileDragEnabled(true);
  } });
}

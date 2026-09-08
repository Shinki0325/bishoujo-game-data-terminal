// Adapts the ranking workspace chrome without owning board/selection state.
export function createRankingWorkspaceView({ elements, getView, syncCandidateTray }) {
  let lastView = null;
  let lastFlags = null;
  let lastAnnotationsKey = null;

  function annotationKey(annotations) {
    return JSON.stringify(Object.entries(annotations ?? {}).sort(([left], [right]) => left.localeCompare(right)));
  }

  return Object.freeze({ render({ model, subject, presentation, coverUrls }) {
    const view = getView();
    const flags = `${presentation.showCounts === true}|${presentation.showTitles !== false}`;
    const viewChanged = view !== lastView;
    elements.showCounts.checked = presentation.showCounts;
    elements.showTitles.checked = presentation.showTitles;
    if (viewChanged || flags !== lastFlags) {
      view.setShowCounts(presentation.showCounts);
      view.setShowTitles(presentation.showTitles);
      lastFlags = flags;
    }
    const nextAnnotationsKey = annotationKey(presentation.annotations);
    if (viewChanged || nextAnnotationsKey !== lastAnnotationsKey) {
      view.setAnnotations(presentation.annotations);
      lastAnnotationsKey = nextAnnotationsKey;
    }
    const company = subject === 'company';
    elements.root.classList.toggle('is-company-ranking', company);
    elements.subjectWork.setAttribute('aria-pressed', String(!company));
    elements.subjectCompany.setAttribute('aria-pressed', String(company));
    elements.candidatesTitle.textContent = company ? '候选会社' : '候选作品';
    syncCandidateTray();
    const searchField = elements.candidateSearch.closest?.('.search-field');
    if (searchField) searchField.hidden = company;
    elements.candidateSearch.placeholder = '搜索候选标题';
    view.render(model, coverUrls);
    view.setMobileDragEnabled(true);
    lastView = view;
  } });
}

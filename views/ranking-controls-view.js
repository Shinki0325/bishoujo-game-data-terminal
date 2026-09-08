import { createViewLifetime } from '../lib/view-lifetime.js';

/** Ranking toolbar presentation, mobile mirrors, candidate tray and resize scheduling. */
export function createRankingControlsView({ elements, scalePresentation, activePresentation, subject, getRankingView,
  enterImmersive, documentRef = document, windowRef = window }) {
  const lifetime = createViewLifetime();
  const qualities = [...(documentRef.querySelectorAll?.('[data-ranking-export-quality]') ?? [])];
  for (const select of qualities) lifetime.listen(select, 'change', () => {
    for (const other of qualities) other.value = select.value;
  });
  const scaleControls = [
    ['overall', elements.rankingScaleOverall, elements.rankingScaleOverallOutput],
    ['card', elements.rankingScaleCard, elements.rankingScaleCardOutput],
    ['rail', elements.rankingScaleRail, elements.rankingScaleRailOutput],
    ['annotation', elements.rankingScaleAnnotation, elements.rankingScaleAnnotationOutput],
    ['tierName', elements.rankingScaleTierName, elements.rankingScaleTierNameOutput]
  ];

  function applyUiScale(uiScale) {
    for (const [key, input, output] of scaleControls) {
      const value = Number(uiScale[key]) || 100;
      const cssKey = key === 'tierName' ? 'tier-name' : key;
      input.value = String(value);
      output.value = `${value}%`;
      output.textContent = `${value}%`;
      documentRef.documentElement.style.setProperty(`--ranking-ui-scale-${cssKey}`, String(value / 100));
    }
    getRankingView()?.refreshLayout();
  }

  applyUiScale(scalePresentation.inspect().uiScale);
  for (const [key, input] of scaleControls) {
    lifetime.listen(input, 'input', () => {
      applyUiScale({ ...scalePresentation.inspect().uiScale, [key]: scalePresentation.setUiScale(key, input.value) });
    });
  }
  lifetime.listen(elements.rankingScaleReset, 'click', () => {
    scalePresentation.resetUiScale();
    applyUiScale(scalePresentation.inspect().uiScale);
  });
  let rankingLayoutFrame = null;
  lifetime.listen(windowRef, 'resize', () => {
    windowRef.cancelAnimationFrame(rankingLayoutFrame);
    rankingLayoutFrame = windowRef.requestAnimationFrame(() => {
      rankingLayoutFrame = null;
      getRankingView()?.refreshLayout();
    });
  });

  function setMobileRankingCandidatesOpen(open) {
    documentRef.body.classList.toggle('is-mobile-ranking-candidates-open', open);
    elements.mobileRankingCandidates.setAttribute('aria-expanded', String(open));
    elements.mobileRankingCandidatesLabel.textContent = open ? '收起候选' : '展开候选';
    const candidateLabel = subject() === 'company' ? '候选会社' : '候选作品';
    elements.mobileRankingCandidates.setAttribute('aria-label', `${open ? '收起' : '展开'}${candidateLabel}`);
  }

  function closeMobileRankingCandidates() {
    setMobileRankingCandidatesOpen(false);
  }

  function toggleMobileRankingCandidates() {
    const opening = !documentRef.body.classList.contains('is-mobile-ranking-candidates-open');
    setMobileRankingCandidatesOpen(opening);
  }

  function openMobileRankingMenu() {
    const scale = documentRef.querySelector?.('[data-ranking-mobile-scale]');
    if (scale) scale.value = elements.rankingScaleCard.value;
    if (typeof elements.mobileRankingMenu.showModal === 'function') elements.mobileRankingMenu.showModal();
    else elements.mobileRankingMenu.open = true;
  }

  lifetime.listen(documentRef, 'keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !documentRef.querySelector('dialog:modal')) closeMobileRankingCandidates();
  });
  lifetime.listen(elements.rankingCoachmarkDismiss, 'click', () => { elements.rankingCoachmark.hidden = true; });
  lifetime.listen(elements.rankingShowCounts, 'change', () => {
    getRankingView().setShowCounts(activePresentation().setShowCounts(elements.rankingShowCounts.checked));
  });
  lifetime.listen(elements.rankingShowTitles, 'change', () => {
    getRankingView().setShowTitles(activePresentation().setShowTitles(elements.rankingShowTitles.checked));
  });
  lifetime.listen(elements.mobileRankingUndo, 'click', () => elements.undoEdit.click());
  lifetime.listen(elements.mobileRankingRedo, 'click', () => elements.redoEdit.click());
  lifetime.listen(elements.mobileRankingCandidates, 'click', () => toggleMobileRankingCandidates());
  lifetime.listen(elements.mobileRankingMore, 'click', () => openMobileRankingMenu());
  const quickExport = documentRef.getElementById?.('mobile-ranking-export-quick');
  if (quickExport) lifetime.listen(quickExport, 'click', () => elements.exportPng.click());
  const mobileScale = documentRef.querySelector?.('[data-ranking-mobile-scale]');
  if (mobileScale) lifetime.listen(mobileScale, 'input', () => {
    elements.rankingScaleCard.value = mobileScale.value;
    elements.rankingScaleCard.dispatchEvent(new windowRef.Event('input', { bubbles: true }));
  });
  lifetime.listen(elements.mobileRankingMenu, 'click', event => {
    if (event.target.closest?.('button') && elements.mobileRankingMenu.open) elements.mobileRankingMenu.close();
  }, true);
  lifetime.listen(elements.mobileRankingShowCounts, 'change', () => {
    elements.rankingShowCounts.checked = elements.mobileRankingShowCounts.checked;
    elements.rankingShowCounts.dispatchEvent(new windowRef.Event('change'));
  });
  lifetime.listen(elements.mobileRankingShowTitles, 'change', () => {
    elements.rankingShowTitles.checked = elements.mobileRankingShowTitles.checked;
    elements.rankingShowTitles.dispatchEvent(new windowRef.Event('change'));
  });
  lifetime.listen(elements.mobileRankingImport, 'click', () => elements.importState.click());
  lifetime.listen(elements.mobileRankingExport, 'click', () => elements.exportState.click());
  lifetime.listen(elements.mobileRankingExportPng, 'click', () => elements.exportPng.click());
  lifetime.listen(elements.mobileRankingClearBoard, 'click', () => elements.clearBoard.click());
  lifetime.listen(elements.mobileRankingClearCandidates, 'click', () => elements.clearCandidates.click());
  lifetime.listen(elements.mobileRankingClearAnnotations, 'click', () => elements.clearAnnotations.click());
  lifetime.listen(elements.rankingImmersive, 'click', () => void enterImmersive());
  lifetime.add(() => windowRef.cancelAnimationFrame(rankingLayoutFrame));
  return Object.freeze({
    scaleInputs: scaleControls.map(([, input]) => input),
    setCandidatesOpen: setMobileRankingCandidatesOpen, closeCandidates: closeMobileRankingCandidates, dispose: lifetime.dispose
  });
}

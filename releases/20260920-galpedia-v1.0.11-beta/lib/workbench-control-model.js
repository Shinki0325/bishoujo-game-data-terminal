export const WORKBENCH_CONTROL_KEYS = Object.freeze([
  "titleSearchClear",
  "mobileTitleSearchClear",
  "modeSelection",
  "modeRanking",
  "modePerson",
  "selectionModeToggle",
  "compareModeToggle",
  "browseModeToggle",
  "quickRankingEntry",
  "cardViewToggle",
  "bangumiImportOpen",
  "mobileBangumiImportOpen",
  "companySelectionModeToggle",
  "selectionContextCount",
  "startWorkRanking",
  "clearSelectedWorks",
  "companySelectionContextCount",
  "startCompanyRanking",
  "clearSelectedCompanies",
  "undoEdit",
  "redoEdit",
  "clearBoard",
  "clearCandidates",
  "clearAnnotations",
  "rankingCandidateSearch",
  "rankingShowCounts",
  "rankingShowTitles",
  "rankingScaleReset",
  "rankingHelpButton",
  "rankingImmersive",
  "cleanupMenuButton",
  "displayMenuButton",
  "exportState",
  "exportPng",
  "mobileRankingUndo",
  "mobileRankingRedo",
  "mobileRankingCandidateCount",
  "mobileRankingCandidates",
  "mobileRankingMore",
  "mobileRankingShowCounts",
  "mobileRankingShowTitles",
  "mobileRankingImport",
  "mobileRankingExport",
  "mobileRankingExportPng",
  "mobileRankingClearBoard",
  "mobileRankingClearCandidates",
  "mobileRankingClearAnnotations"
]);

export function projectWorkbenchControls({
  model, company, rankingSubject, importBusy, personAvailable,
  selectionMode, compareMode, companyDirectoryOpen, companySelectionMode,
  bangumiAvailable, annotationCount, pngExportInProgress,
  showCounts, showTitles
}) {
    const controls = Object.fromEntries(WORKBENCH_CONTROL_KEYS.map(key => [key, {}]));
    const hasTitleQuery = String(model?.state?.filterState?.titleQuery ?? '').trim().length > 0;
    controls.titleSearchClear.hidden = !hasTitleQuery;
    controls.mobileTitleSearchClear.hidden = !hasTitleQuery;
    const companyState = rankingSubject === 'company' ? company : null;
    const activeRankingState = companyState === null
      ? model
      : {
        ...model,
        selectedCount: companyState.selectedCompanyIds.length,
        rankedCount: companyState.rankedCount,
        unrankedCount: companyState.candidateCompanyIds.length,
        canUndo: companyState.canUndo,
        canRedo: companyState.canRedo
      };
    controls.modeSelection.disabled = importBusy;
    controls.modeRanking.disabled = importBusy;
    controls.modePerson.disabled = importBusy || !personAvailable;
    controls.selectionModeToggle.disabled = importBusy || compareMode;
    controls.compareModeToggle.disabled = importBusy || companyDirectoryOpen || model.state.workspaceMode === 'ranking';
    controls.browseModeToggle.disabled = importBusy || companyDirectoryOpen || model.state.workspaceMode === 'ranking';
    controls.quickRankingEntry.disabled = importBusy || companyDirectoryOpen || model.state.workspaceMode === 'ranking';
    controls.cardViewToggle.disabled = importBusy;
    controls.bangumiImportOpen.disabled = importBusy || !bangumiAvailable;
    controls.mobileBangumiImportOpen.disabled = importBusy || !bangumiAvailable;
    controls.companySelectionModeToggle.disabled = importBusy;
    controls.selectionModeToggle['aria-pressed'] = String(selectionMode);
    controls.selectionModeToggle.textContent = selectionMode ? '退出选择' : '选择作品';
    controls.selectionModeToggle['aria-label'] = selectionMode ? '退出选择，返回作品浏览' : '选择作品，进入排榜选片模式';
    controls.selectionModeToggle.title = selectionMode ? '退出排榜选片' : '进入排榜选片模式';
    controls.compareModeToggle['aria-pressed'] = String(compareMode);
    controls.compareModeToggle.textContent = compareMode ? '退出比较' : '比较作品';
    controls.browseModeToggle['aria-pressed'] = String(!selectionMode && !compareMode);
    controls.browseModeToggle.title = '返回浏览作品';
    controls.quickRankingEntry.textContent = model.selectedCount > 0 ? '开始排榜' : '选择后排榜';
    controls.quickRankingEntry.hidden = true;
    controls.quickRankingEntry['aria-label'] = model.selectedCount > 0
      ? `开始排榜（已选 ${model.selectedCount} 部）`
      : '选择作品后开始排榜';
    controls.companySelectionModeToggle['aria-pressed'] = String(companySelectionMode);
    controls.companySelectionModeToggle.textContent = companySelectionMode ? '退出选择' : '选择';

    controls.selectionContextCount.textContent = String(model.selectedCount);
    controls.startWorkRanking.disabled = importBusy || model.selectedCount === 0;
    controls.clearSelectedWorks.disabled = importBusy || model.selectedCount === 0;
    const companySelectedCount = company.selectedCompanyIds.length;

    controls.companySelectionContextCount.textContent = String(companySelectedCount);
    controls.startCompanyRanking.disabled = importBusy || companySelectedCount === 0;
    controls.clearSelectedCompanies.disabled = importBusy || companySelectedCount === 0;
    controls.undoEdit.disabled = importBusy || !activeRankingState.canUndo;
    controls.redoEdit.disabled = importBusy || !activeRankingState.canRedo;
    controls.clearBoard.disabled = importBusy || activeRankingState.rankedCount === 0;
    controls.clearCandidates.disabled = importBusy || activeRankingState.selectedCount === 0;
    controls.clearAnnotations.disabled = importBusy
      || annotationCount === 0;
    controls.rankingCandidateSearch.disabled = importBusy || activeRankingState.unrankedCount === 0;
    controls.rankingShowCounts.disabled = importBusy;
    controls.rankingShowTitles.disabled = importBusy;
    controls.rankingScaleReset.disabled = importBusy;
    controls.rankingHelpButton.disabled = importBusy;
    controls.rankingImmersive.disabled = importBusy;
    controls.cleanupMenuButton.disabled = importBusy;
    controls.displayMenuButton.disabled = importBusy;
    controls.exportState.disabled = importBusy;
    controls.exportPng.disabled = importBusy || activeRankingState.rankedCount === 0 || pngExportInProgress;
    controls.exportPng['aria-busy'] = String(pngExportInProgress);
    controls.exportPng['aria-label'] = pngExportInProgress ? '正在导出图片' : '导出图片';
    controls.mobileRankingUndo.disabled = controls.undoEdit.disabled;
    controls.mobileRankingRedo.disabled = controls.redoEdit.disabled;
    controls.mobileRankingCandidateCount.textContent = String(activeRankingState.unrankedCount);
    controls.mobileRankingCandidates.disabled = importBusy;
    controls.mobileRankingMore.disabled = importBusy;
    controls.mobileRankingShowCounts.disabled = importBusy;
    controls.mobileRankingShowTitles.disabled = importBusy;
    controls.mobileRankingShowCounts.checked = showCounts;
    controls.mobileRankingShowTitles.checked = showTitles;
    controls.mobileRankingImport.disabled = importBusy;
    controls.mobileRankingExport.disabled = importBusy;
    controls.mobileRankingExportPng.disabled = controls.exportPng.disabled;
    controls.mobileRankingExportPng['aria-busy'] = String(pngExportInProgress);
    controls.mobileRankingClearBoard.disabled = controls.clearBoard.disabled;
    controls.mobileRankingClearCandidates.disabled = controls.clearCandidates.disabled;
    controls.mobileRankingClearAnnotations.disabled = controls.clearAnnotations.disabled;
    return { controls, inputsDisabled: importBusy,
      selection: { mode: !companyDirectoryOpen && model.state.workspaceMode !== 'ranking' && selectionMode && !compareMode, count: model.selectedCount },
      companySelection: { mode: companyDirectoryOpen && companySelectionMode, count: companySelectedCount }
    };
}


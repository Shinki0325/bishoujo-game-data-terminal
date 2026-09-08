export const WORKBENCH_CONTROL_ELEMENTS = Object.freeze([
  "selectionContextBar",
  "selectionModeToggle",
  "clearSelectedWorks",
  "startWorkRanking",
  "companySelectionContextBar",
  "companySelectionModeToggle",
  "clearSelectedCompanies",
  "startCompanyRanking",
  "selectionView",
  "rankingView",
  "mobileSelectionView",
  "modeSelection",
  "modeRanking",
  "cardViewToggle",
  "bangumiImportOpen",
  "mobileBangumiImportOpen",
  "bangumiPublicFetch",
  "bangumiPublicImportAppend",
  "undoEdit",
  "redoEdit",
  "clearBoard",
  "clearCandidates",
  "clearAnnotations",
  "rankingCandidateSearch",
  "mobileRankingUndo",
  "mobileRankingRedo",
  "mobileRankingCandidates",
  "mobileRankingMore",
  "mobileRankingShowCounts",
  "mobileRankingShowTitles",
  "mobileRankingImport",
  "mobileRankingExport",
  "mobileRankingExportPng",
  "mobileRankingExportQuick",
  "mobileRankingClearBoard",
  "mobileRankingClearCandidates",
  "mobileRankingClearAnnotations",
  "rankingShowCounts",
  "rankingShowTitles",
  "rankingHelpButton",
  "rankingImmersive",
  "cleanupMenuButton",
  "displayMenuButton",
  "exportState",
  "exportPng",
  "titleSearchClear",
  "mobileTitleSearchClear",
  "modePerson",
  "compareModeToggle",
  "browseModeToggle",
  "quickRankingEntry",
  "selectionContextCount",
  "companySelectionContextCount",
  "rankingScaleReset",
  "mobileRankingCandidateCount"
]);

import { syncSelectionContext } from '../lib/ui-selection-context.js';
import { setWorkspaceBusy } from '../lib/browser-io.js';

export function createWorkspaceHostView({ tabs, panels, mobileSelectionView }) {
  return Object.freeze({ render(key) {
    for (const [name, tab] of Object.entries(tabs)) {
      tab.setAttribute('aria-selected', String(name === key));
      tab.tabIndex = name === key ? 0 : -1;
    }
    for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== key;
    mobileSelectionView.hidden = true;
  } });
}

export function createWorkbenchControlsView({ elements, cardDisplayInputs, scaleInputs, selectedWorksToggle }) {
  function render(projection) {
    for (const [name, state] of Object.entries(projection.controls)) {
      const element = elements[name];
      for (const [key, value] of Object.entries(state)) {
        if (key.startsWith('aria-')) element.setAttribute(key, value);
        else element[key] = value;
      }
    }
    for (const input of [...cardDisplayInputs, ...scaleInputs]) input.disabled = projection.inputsDisabled || input.dataset?.displayUnavailable === 'true';
    syncSelectionContext({
      root: elements.selectionContextBar, ...projection.selection, keepEmptyTools: true,
      focusFallback: elements.selectionModeToggle,
      resultActions: [selectedWorksToggle, elements.clearSelectedWorks, elements.startWorkRanking]
    });
    syncSelectionContext({
      root: elements.companySelectionContextBar, ...projection.companySelection,
      focusFallback: elements.companySelectionModeToggle,
      resultActions: [elements.clearSelectedCompanies, elements.startCompanyRanking]
    });
  }
  function setBusy(nextBusy) {
    setWorkspaceBusy({
      roots: [elements.selectionView, elements.rankingView, elements.mobileSelectionView],
      controls: [
        elements.modeSelection,
        elements.modeRanking,
        elements.selectionModeToggle,
        elements.cardViewToggle,
        elements.bangumiImportOpen,
        elements.mobileBangumiImportOpen,
        elements.bangumiPublicFetch,
        elements.bangumiPublicImportAppend,
        ...cardDisplayInputs,
        elements.companySelectionModeToggle,
        elements.undoEdit,
        elements.redoEdit,
        elements.clearBoard,
        elements.clearCandidates,
        elements.clearAnnotations,
        elements.rankingCandidateSearch,
        elements.mobileRankingUndo,
        elements.mobileRankingRedo,
        elements.mobileRankingCandidates,
        elements.mobileRankingMore,
        elements.mobileRankingShowCounts,
        elements.mobileRankingShowTitles,
        elements.mobileRankingImport,
        elements.mobileRankingExport,
        elements.mobileRankingExportPng,
        elements.mobileRankingClearBoard,
        elements.mobileRankingClearCandidates,
        elements.mobileRankingClearAnnotations,
        elements.rankingShowCounts,
        elements.rankingShowTitles,
        elements.rankingHelpButton,
        elements.rankingImmersive,
        elements.cleanupMenuButton,
        elements.displayMenuButton,
        elements.exportState,
        elements.exportPng
      ]
    }, nextBusy);
  }
  return Object.freeze({ render, setBusy });
}

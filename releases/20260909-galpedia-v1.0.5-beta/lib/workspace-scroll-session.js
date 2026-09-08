const emptySelection = () => ({ top: 0, left: 0 });
const emptyRanking = () => ({ top: 0, left: 0, tiers: {}, poolLeft: 0 });

/** Own the two workbench scroll snapshots; views still own reading/writing the DOM. */
export function createWorkspaceScrollSession({ selection, ranking }) {
  let selectionPosition = emptySelection();
  let rankingPosition = emptyRanking();
  let renderedMode = null;
  function captureRanking() {
    rankingPosition = ranking.capture() ?? rankingPosition;
  }
  return Object.freeze({
    capture() {
      if (renderedMode === 'selection') selectionPosition = selection.capture();
      else if (renderedMode === 'ranking') captureRanking();
    },
    captureRanking,
    restore(mode, { skip = false } = {}) {
      // Directory surfaces keep their existing independent scroll behavior.
      if (!skip) {
        if (mode === 'ranking') ranking.restore(rankingPosition);
        else selection.restore(selectionPosition);
      }
      renderedMode = mode;
    },
    resetRanking() { rankingPosition = emptyRanking(); },
    reset() {
      selectionPosition = emptySelection();
      rankingPosition = emptyRanking();
      renderedMode = null;
    }
  });
}

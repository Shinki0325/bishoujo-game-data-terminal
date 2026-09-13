// Presentation-session ownership only. The application still owns routes,
// filters, selected records and ranking state.
export function createWorkspaceHostController({
  renderView, isMobile, setCandidatesOpen,
  suspendCompany, suspendDetails, cancelRankingPreload,
  suspendSelection, suspendPerson
}) {
  let activeKey = null;
  function render({ workspaceMode, personDirectoryOpen, companyDirectoryOpen }) {
    const key = personDirectoryOpen ? 'persons' : companyDirectoryOpen ? 'companies' : workspaceMode;
    if (!['selection', 'ranking', 'persons', 'companies'].includes(key)) throw new TypeError('Unknown workspace');
    const changed = key !== activeKey;
    if (changed) {
      suspendCompany();
      suspendDetails();
      cancelRankingPreload();
      if (key !== 'selection') suspendSelection();
      if (key !== 'persons') suspendPerson();
    }
    if (key !== 'ranking') setCandidatesOpen(false);
    else if (changed && isMobile()) setCandidatesOpen(true);
    activeKey = key;
    renderView(key);
  }
  return Object.freeze({ render, get activeKey() { return activeKey; } });
}


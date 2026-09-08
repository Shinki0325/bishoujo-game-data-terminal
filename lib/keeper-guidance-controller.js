import { createKeeperPreferences, resolveKeeperGuide } from './keeper-guide-runtime.js';

/** Project existing guide rules without owning workbench or preference state. */
export function projectKeeperGuidance(snapshot, preferences, features = {}) {
  const base = {
    ready: snapshot.ready, restored: snapshot.restored,
    busy: snapshot.busy, live: snapshot.live, dialogOpen: snapshot.dialogOpen
  };
  const scene = value => {
    const guide = resolveKeeperGuide({ ...base, ...value, featureEnabled: true }, preferences);
    if (!guide) return null;
    const enabled = features.enabled !== false;
    return {
      ...guide,
      showEnhancement: enabled && guide.showEnhancement,
      showPortrait: enabled && guide.showPortrait,
      enhanced: enabled && guide.showEnhancement && preferences.completed?.[guide.id] !== guide.contentVersion
    };
  };
  const compare = scene({
    id: 'compareActive', workspace: 'selection',
    mode: snapshot.compareMode ? 'compare' : 'browse', compareActive: snapshot.compareMode,
    compareWorkIds: snapshot.compareIds, compareSelectedCount: snapshot.compareIds.length,
    compareMin: snapshot.compareMinimum
  });
  const model = snapshot.model;
  const rankingGuide = model?.state?.workspaceMode === 'ranking' && snapshot.rankingSubject === 'work'
    ? scene({
      id: model.rankedCount > 0 ? null : model.unrankedCount > 0 ? 'tier.firstDrag' : 'tier.start',
      workspace: 'ranking', subject: 'work', selectedWorkIds: model.state.selectedWorkIds,
      candidateTotal: model.unrankedCount, rankedTotal: model.rankedCount
    }) : null;
  return {
    compare, compareMode: snapshot.compareMode,
    compareBarHidden: snapshot.compareIds.length === 0 && !snapshot.compareMode,
    rankingGuide, portraits: features.portraits === true,
    secondaryActionDisabled: snapshot.importBusy || !snapshot.importAvailable
  };
}

export function projectBangumiGuidance(snapshot, preferences, features = {}) {
  return Object.fromEntries(['input', 'result'].map(phase => [phase, resolveKeeperGuide({
    id: `bangumi.${phase}`, ready: snapshot.ready, restored: snapshot.restored,
    featureEnabled: features.enabled !== false, p1Enabled: features.p1 === true,
    importDialogOpen: snapshot.importDialogOpen, importPhase: snapshot.importPhase,
    busy: snapshot.busy, live: snapshot.live, topOverlay: snapshot.otherDialog
  }, preferences)]));
}

/** Own only the guide session and its subscriptions; application state is read on demand. */
export function createKeeperGuidanceController({
  view, readWorkbench, features = {}, preferences = createKeeperPreferences()
}) {
  let ready = false;
  let restored = false;
  let interactionBusy = false;
  let importPhase = 'input';
  let openedFromEmpty = false;
  let disposed = false;
  const snapshot = () => ({ ...readWorkbench(), ...view.readSurface(), ready, restored, importPhase });

  function renderImport() {
    if (!ready || disposed) return;
    view.renderImport(projectBangumiGuidance(snapshot(), preferences.get(), features), features.portraits === true);
  }
  function render() {
    // Observer callbacks may arrive while main is still awaiting initialization.
    // Do not read application ports until restoration has completed.
    if (!ready || disposed || interactionBusy) return;
    renderImport();
    view.render(projectKeeperGuidance(snapshot(), preferences.get(), features));
  }
  const unsubscribe = preferences.subscribe(render);
  const disconnect = view.connect({
    onChange: render,
    onDragStart() { interactionBusy = true; },
    onDragEnd() {
      if (!interactionBusy) return;
      interactionBusy = false;
      render();
    }
  });
  return Object.freeze({
    render, renderImport,
    restore() { if (disposed) return; restored = true; ready = true; render(); },
    setImportPhase(phase) { importPhase = phase; },
    complete(id) { if (!disposed) preferences.complete(id); },
    dismiss(id, version) { if (!disposed) preferences.dismiss(id, version); },
    openImport(fromEmpty) { openedFromEmpty = fromEmpty; },
    closeImport() {
      if (!openedFromEmpty || disposed) return;
      openedFromEmpty = false;
      view.restoreImportFocus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe(); disconnect();
    }
  });
}

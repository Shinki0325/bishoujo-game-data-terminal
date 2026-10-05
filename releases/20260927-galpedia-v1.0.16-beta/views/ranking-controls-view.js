import { createViewLifetime } from '../lib/view-lifetime.js';

/** Ranking toolbar presentation, mobile mirrors, candidate tray and resize scheduling. */
export function createRankingControlsView({ elements, scalePresentation, activePresentation, subject, getRankingView,
  enterImmersive, documentRef = document, windowRef = window }) {
  const lifetime = createViewLifetime();
  const tray = documentRef.getElementById?.('ranking-candidates');
  const search = documentRef.getElementById?.('ranking-candidate-search');
  const queryHint = documentRef.getElementById?.('ranking-live-query');
  const syncQuery = () => {
    if (!queryHint) return;
    queryHint.hidden = !search?.value.trim();
    const label = queryHint.querySelector?.('span');
    if (label) label.textContent = `筛选：${search?.value ?? ''}`;
  };
  lifetime.listen(search, 'input', syncQuery);
  lifetime.listen(queryHint?.querySelector('button'), 'click', () => {
    search.value = ''; search.dispatchEvent(new windowRef.Event('input', { bubbles: true }));
  });
  const workspace = documentRef.getElementById?.('ranking-view');
  const displayMenu = documentRef.getElementById?.('display-menu');
  const styleSelect = documentRef.getElementById?.('ranking-display-style');
  const densityButtons = [...(documentRef.querySelectorAll?.('[data-display-density]') ?? [])];
  const shapeSelect = documentRef.getElementById?.('ranking-display-shape');
  // One panel outside the toolbar: available while the toolbar is hidden on mobile/live.
  if (displayMenu && workspace) workspace.append(displayMenu);
  let displayOpener = null;
  const closeDisplay = () => {
    if (!displayMenu) return;
    displayMenu.hidden = true;
    documentRef.getElementById?.('display-menu-button')?.setAttribute('aria-expanded', 'false');
    displayOpener?.focus?.({ preventScroll: true });
  };
  for (const id of ['display-menu-button', 'mobile-ranking-display', 'ranking-live-display']) {
    const opener = documentRef.getElementById?.(id);
    lifetime.listen(opener, 'click', event => {
      event.stopPropagation();
      elements.mobileRankingMenu?.close?.();
      if (displayMenu && !displayMenu.hidden) { closeDisplay(); return; }
      displayOpener = id === 'mobile-ranking-display' ? elements.mobileRankingMore : opener;
      if (displayMenu) displayMenu.hidden = false;
      documentRef.getElementById?.('display-menu-button')?.setAttribute('aria-expanded', 'true');
      styleSelect?.focus?.({ preventScroll: true });
    });
  }
  lifetime.listen(documentRef, 'keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && displayMenu && !displayMenu.hidden && !documentRef.querySelector?.('dialog:modal')) {
      event.preventDefault(); closeDisplay();
    }
  });
  lifetime.listen(documentRef.querySelector?.('[data-display-close]'), 'click', closeDisplay);
  lifetime.listen(displayMenu, 'keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeDisplay(); }
  });
  const pinButton = documentRef.getElementById?.('ranking-candidates-pin');
  const trayButtons = [...(documentRef.querySelectorAll?.('[data-candidate-tray]') ?? [])];
  let trayMode = 'collapsed', pinned = false, live = false, beforeLive = null, restoreFrame = null;
  let liveTray = 'row', modeAnchor = null;
  let trayRenderKey = null;
  let layoutFrame = null;
  let appliedScaleKey = null;
  let appliedDisplayKey = null;

  const requestFrame = callback => {
    if (typeof windowRef.requestAnimationFrame === 'function') return windowRef.requestAnimationFrame(callback);
    callback();
    return null;
  };
  const cancelFrame = frame => {
    if (frame !== null && typeof windowRef.cancelAnimationFrame === 'function') windowRef.cancelAnimationFrame(frame);
  };

  function beginLive() {
    if (live) return;
    cancelFrame(restoreFrame);
    return enterImmersive();
  }
  const measureTray = () => {
    const height = trayMode === 'collapsed' && windowRef.matchMedia?.('(max-width: 899px)').matches ? 0 : (tray?.getBoundingClientRect?.().height ?? 0);
    workspace?.style?.setProperty('--candidate-tray-height', `${Math.ceil(height)}px`);
  };
  const scheduleLayout = () => {
    if (layoutFrame !== null) return;
    layoutFrame = requestFrame(() => {
      layoutFrame = null;
      measureTray();
      getRankingView()?.refreshLayout();
    });
  };
  if (tray && typeof windowRef.ResizeObserver === 'function') {
    const observer = new windowRef.ResizeObserver(scheduleLayout);
    observer.observe(tray); lifetime.add(() => observer.disconnect());
  }
  const scaleControls = [
    ['overall', elements.rankingScaleOverall, elements.rankingScaleOverallOutput],
    ['card', elements.rankingScaleCard, elements.rankingScaleCardOutput],
    ['rail', elements.rankingScaleRail, elements.rankingScaleRailOutput],
    ['annotation', elements.rankingScaleAnnotation, elements.rankingScaleAnnotationOutput],
    ['tierName', elements.rankingScaleTierName, elements.rankingScaleTierNameOutput],
    ['tierWidth', documentRef.getElementById?.('ranking-scale-tier-width'), documentRef.getElementById?.('ranking-scale-tier-width-output')]
  ].filter(([,input,output])=>input && output);

  function applyUiScale(uiScale) {
    const normalized = Object.fromEntries(scaleControls.map(([key]) => [key, Number(uiScale[key]) || 100]));
    const scaleKey = JSON.stringify(normalized);
    if (scaleKey === appliedScaleKey) return false;
    appliedScaleKey = scaleKey;
    for (const [key, input, output] of scaleControls) {
      const value = normalized[key];
      const cssKey = key === 'tierName' ? 'tier-name' : key === 'tierWidth' ? 'tier-width' : key;
      input.value = String(value);
      input.style?.setProperty('--range-fill', `${(value - 80) / 80 * 100}%`);
      output.value = `${value}%`;
      output.textContent = `${value}%`;
      documentRef.documentElement.style.setProperty(`--ranking-ui-scale-${cssKey}`, String(value / 100));
    }
    const density = uiScale.overall === 100 && uiScale.rail === 100
      ? ({ 80: 'compact', 100: 'standard', 130: 'spacious' }[uiScale.card] ?? 'custom') : 'custom';
    for (const button of densityButtons) button.setAttribute('aria-pressed', String(button.dataset.displayDensity === density));
    const densityLabel = documentRef.getElementById?.('ranking-density-current');
    if (densityLabel) densityLabel.textContent = { compact: '紧凑', standard: '标准', spacious: '舒展', custom: '自定义' }[density];
    for (const button of documentRef.querySelectorAll?.('[data-scale-reset]') ?? []) button.disabled = uiScale[button.dataset.scaleReset] === 100;
    const mobileScale = documentRef.querySelector?.('[data-ranking-mobile-scale]');
    if (mobileScale) mobileScale.value = String(uiScale.card);
    scheduleLayout();
    return true;
  }

  function applyDisplay() {
    const state = scalePresentation.inspect();
    const display = state.display ?? { style: 'garden', shape: 'square' };
    const displayKey = JSON.stringify({
      display, showCounts: state.showCounts === true, showTitles: state.showTitles !== false, uiScale: state.uiScale
    });
    const modeLabel = documentRef.getElementById?.('ranking-display-mode');
    if (modeLabel) modeLabel.textContent = live ? '直播显示 · 独立记住尺寸与内容' : '普通显示 · 独立记住尺寸与内容';
    const sync = documentRef.getElementById?.('ranking-display-sync');
    if (sync) sync.textContent = live ? '将当前显示同步到普通模式' : '将当前显示同步到直播模式';
    if (displayKey === appliedDisplayKey) {
      // Slider previews update CSS independently of the structural display cache.
      // Returning to an unchanged mode must still restore that mode's scales.
      applyUiScale(state.uiScale);
      return false;
    }
    appliedDisplayKey = displayKey;
    documentRef.documentElement.setAttribute?.('data-ranking-style', display.style);
    documentRef.documentElement.setAttribute?.('data-ranking-shape', display.shape);
    if (styleSelect) styleSelect.value = display.style;
    if (shapeSelect) shapeSelect.value = display.shape;
    const shapeField = documentRef.getElementById?.('ranking-display-shape-field');
    if (shapeField) shapeField.hidden = display.style !== 'classic';
    const tierWidthField = documentRef.getElementById?.('ranking-tier-width-field');
    if (tierWidthField) tierWidthField.hidden = display.style !== 'classic';
    for (const input of [elements.rankingShowCounts, elements.mobileRankingShowCounts]) input.checked = state.showCounts;
    for (const input of [elements.rankingShowTitles, elements.mobileRankingShowTitles]) input.checked = state.showTitles;
    getRankingView()?.setShowCounts?.(state.showCounts);
    getRankingView()?.setShowTitles?.(state.showTitles);
    for (const key of ['Overall', 'Rail']) {
      const input = elements[`rankingScale${key}`];
      input.disabled = display.style === 'classic';
      if (input.dataset) input.dataset.displayUnavailable = String(display.style === 'classic');
      input.title = display.style === 'classic' ? '经典布局使用卡片大小控制尺寸，行高随内容变化' : '';
    }
    applyUiScale(state.uiScale);
    // Style/shape and visibility changes can alter geometry even when the
    // numeric scale profile is unchanged and therefore short-circuited above.
    scheduleLayout();
    return true;
  }
  lifetime.listen(styleSelect, 'change', () => {
    if (scalePresentation.inspect().display?.style !== styleSelect.value) scalePresentation.setDisplayStyle(styleSelect.value);
    applyDisplay();
  });
  lifetime.listen(shapeSelect, 'change', () => {
    if (scalePresentation.inspect().display?.shape !== shapeSelect.value) scalePresentation.setDisplayShape(shapeSelect.value);
    applyDisplay();
  });
  lifetime.listen(documentRef.getElementById?.('ranking-display-sync'), 'click', event => {
    scalePresentation.syncViewMode?.();
    applyDisplay();
    event.currentTarget.textContent = live ? '已同步到普通模式' : '已同步到直播模式';
  });
  for (const button of densityButtons) lifetime.listen(button, 'click', () => {
    const size = { compact: 80, standard: 100, spacious: 130 }[button.dataset.displayDensity];
    const current = scalePresentation.inspect().uiScale;
    if (size && (current.card !== size || current.overall !== 100 || current.rail !== 100)) {
      scalePresentation.setDensity(button.dataset.displayDensity);
    }
    applyDisplay();
  });
  for (const button of documentRef.querySelectorAll?.('[data-scale-reset]') ?? []) lifetime.listen(button, 'click', () => {
    scalePresentation.resetUiScale(button.dataset.scaleReset); applyUiScale(scalePresentation.inspect().uiScale);
  });

  applyDisplay();
  for (const [key, input] of scaleControls) {
    lifetime.listen(input, 'input', () => {
      applyUiScale({ ...scalePresentation.inspect().uiScale, [key]: scalePresentation.setUiScale(key, input.value, { persistChange: false }) });
    });
    lifetime.listen(input, 'change', () => scalePresentation.saveDisplay?.());
    lifetime.listen(input, 'blur', () => scalePresentation.saveDisplay?.());
  }
  lifetime.listen(elements.rankingScaleReset, 'click', () => {
    scalePresentation.resetUiScale();
    applyUiScale(scalePresentation.inspect().uiScale);
  });
  lifetime.listen(windowRef, 'resize', () => {
    setTrayMode(trayMode, { force: true });
    scheduleLayout();
  });

  function setTrayMode(mode, { force = false } = {}) {
    // In live mode collapse only the tools, keeping the candidate strip available.
    if (live && mode === 'collapsed') mode = 'row';
    const nextMode = ['collapsed', 'row', 'expanded'].includes(mode) ? mode : 'row';
    const mobile = Boolean(windowRef.matchMedia?.('(max-width: 899px)').matches);
    const candidateName = subject() === 'company' ? '候选会社' : '候选作品';
    const nextKey = `${nextMode}|${mobile}|${candidateName}`;
    trayMode = nextMode;
    if (!force && nextKey === trayRenderKey) {
      return false;
    }
    trayRenderKey = nextKey;
    const open = trayMode !== 'collapsed';
    documentRef.body.setAttribute?.('data-ranking-tray', trayMode);
    documentRef.body.classList.toggle('is-mobile-ranking-candidates-open', open);
    elements.mobileRankingCandidates.setAttribute('aria-expanded', String(open));
    elements.mobileRankingCandidatesLabel.textContent = open ? '收起候选' : '显示候选';
    const candidateLabel = subject() === 'company' ? '候选会社' : '候选作品';
    elements.mobileRankingCandidates.setAttribute('aria-label', `${open ? '收起' : '显示'}${candidateLabel}`);
    for (const button of trayButtons) button.setAttribute('aria-pressed', String(button.dataset.candidateTray === trayMode));
    // Collapsed candidates cannot remain in the keyboard focus order on mobile.
    if (tray) tray.inert = !open && mobile;
    scheduleLayout();
    return true;
  }
  function setMobileRankingCandidatesOpen(open) { setTrayMode(open ? 'row' : 'collapsed'); }

  function closeMobileRankingCandidates() {
    setMobileRankingCandidatesOpen(false);
  }

  function toggleMobileRankingCandidates() {
    setMobileRankingCandidatesOpen(trayMode === 'collapsed');
  }
  function setPinned(value) {
    const next = value === true;
    if (next === pinned) return false;
    pinned = next;
    workspace?.classList.toggle('is-candidates-pinned', next);
    pinButton?.setAttribute('aria-pressed', String(next));
    if (pinButton) pinButton.textContent = next ? '取消固定候选' : '固定候选区';
    if (next && trayMode === 'collapsed') setTrayMode('row');
    scheduleLayout();
    return true;
  }
  for (const button of trayButtons) lifetime.listen(button, 'click', () => setTrayMode(button.dataset.candidateTray));
  lifetime.listen(pinButton, 'click', () => setPinned(!pinned));
  lifetime.listen(documentRef.getElementById?.('ranking-live-candidates'), 'click', () => {
    setTrayMode(trayMode === 'expanded' ? 'row' : 'expanded');
    if (trayMode === 'expanded') documentRef.getElementById?.('ranking-candidate-search')?.focus();
  });
  lifetime.listen(documentRef.getElementById?.('ranking-live-undo'), 'click', () => elements.undoEdit.click());
  lifetime.listen(documentRef.getElementById?.('ranking-live-redo'), 'click', () => elements.redoEdit.click());
  const syncLiveHistory = () => {
    for (const [id, source] of [['ranking-live-undo', elements.undoEdit], ['ranking-live-redo', elements.redoEdit]]) {
      const button = documentRef.getElementById?.(id);
      if (button) button.disabled = source.disabled;
    }
  };
  if (typeof windowRef.MutationObserver === 'function') {
    const observer = new windowRef.MutationObserver(syncLiveHistory);
    for (const button of [elements.undoEdit, elements.redoEdit]) observer.observe(button, { attributes: true, attributeFilter: ['disabled'] });
    lifetime.add(() => observer.disconnect());
  }
  syncLiveHistory();
  lifetime.listen(documentRef.getElementById?.('mobile-ranking-immersive'), 'click', () => void beginLive());
  function openMobileRankingMenu() {
    const scale = documentRef.querySelector?.('[data-ranking-mobile-scale]');
    if (scale) scale.value = elements.rankingScaleCard.value;
    if (typeof elements.mobileRankingMenu.showModal === 'function') elements.mobileRankingMenu.showModal();
    else elements.mobileRankingMenu.open = true;
  }

  lifetime.listen(documentRef, 'keydown', event => {
    if (!live && event.key === 'Escape' && !event.defaultPrevented && !documentRef.querySelector('dialog:modal')) closeMobileRankingCandidates();
  });
  lifetime.listen(documentRef, 'keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.cancelBubble || !live || trayMode !== 'expanded') return;
    if (documentRef.querySelector('dialog[open], #display-menu:not([hidden]), #ranking-immersive-controls:not([hidden])')) return;
    event.preventDefault(); setTrayMode('row');
    documentRef.getElementById?.('ranking-live-toggle')?.focus?.({preventScroll:true});
  }, true);
  lifetime.listen(elements.rankingCoachmarkDismiss, 'click', () => { elements.rankingCoachmark.hidden = true; });
  lifetime.listen(elements.rankingShowCounts, 'change', () => {
    const value = elements.rankingShowCounts.checked === true;
    const presentation = activePresentation();
    const current = presentation.inspect?.();
    if (!current || current.showCounts !== value) getRankingView().setShowCounts(presentation.setShowCounts(value));
    elements.mobileRankingShowCounts.checked = elements.rankingShowCounts.checked;
  });
  lifetime.listen(elements.rankingShowTitles, 'change', () => {
    const value = elements.rankingShowTitles.checked === true;
    const presentation = activePresentation();
    const current = presentation.inspect?.();
    if (!current || current.showTitles !== value) getRankingView().setShowTitles(presentation.setShowTitles(value));
    elements.mobileRankingShowTitles.checked = elements.rankingShowTitles.checked;
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
  lifetime.listen(mobileScale, 'change', () => scalePresentation.saveDisplay?.());
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
  lifetime.listen(elements.mobileRankingClearBoard, 'click', () => elements.clearBoard.click());
  lifetime.listen(elements.mobileRankingClearCandidates, 'click', () => elements.clearCandidates.click());
  lifetime.listen(elements.mobileRankingClearAnnotations, 'click', () => elements.clearAnnotations.click());
  lifetime.listen(elements.rankingImmersive, 'click', () => void beginLive());
  lifetime.add(() => cancelFrame(layoutFrame));
  lifetime.add(() => cancelFrame(restoreFrame));
  return Object.freeze({
    prepareMode(value) {
      cancelFrame(restoreFrame);
      modeAnchor = getRankingView()?.captureAnchor?.();
      if (value) beforeLive = { trayMode, pinned, scroll: getRankingView()?.captureScroll?.() };
      else liveTray = trayMode;
    },
    scaleInputs: scaleControls.map(([, input]) => input),
    setCandidatesOpen: setMobileRankingCandidatesOpen, closeCandidates: closeMobileRankingCandidates,
    refreshTray: () => setTrayMode(trayMode),
    setImmersive(value) {
      if (value === live) return;
      if (displayMenu) displayMenu.hidden = true;
      documentRef.getElementById?.('display-menu-button')?.setAttribute('aria-expanded', 'false');
      const scroll = beforeLive?.scroll;
      if (value) {
        beforeLive ??= { trayMode, pinned, scroll: getRankingView()?.captureScroll?.() };
        live = true; setTrayMode(liveTray, { force: true });
      } else {
        live = false; setPinned(beforeLive?.pinned ?? false); setTrayMode(beforeLive?.trayMode ?? 'row', { force: true });
        beforeLive = null;
      }
      scalePresentation.setViewMode?.(value ? 'live' : 'normal');
      syncQuery();
      applyDisplay(); scheduleLayout();
      // Focus an available control, never the whole workspace (which gets a
      // browser outline after Escape). Do this now so a delayed layout frame
      // cannot steal focus from the user's next interaction.
      const focusTarget = value
        ? documentRef.getElementById?.('ranking-immersive-exit')
        : windowRef.matchMedia?.('(max-width: 899px)').matches
          ? elements.mobileRankingMore : elements.rankingImmersive;
      if (!workspace?.hidden) focusTarget?.focus?.({ preventScroll: true });
      const anchor = modeAnchor;
      restoreFrame = requestFrame(() => {
        restoreFrame = requestFrame(() => {
          restoreFrame = null;
          if (live === value && !workspace?.hidden) {
            if (anchor) getRankingView()?.restoreAnchor?.(anchor);
            else getRankingView()?.restoreScroll?.(scroll);
            if (modeAnchor === anchor) modeAnchor = null;
          }
        });
      });
    },
    dispose: lifetime.dispose
  });
}

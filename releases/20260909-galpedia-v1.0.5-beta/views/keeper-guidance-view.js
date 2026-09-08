import { createKeeperGuideCard } from '../lib/keeper-guide-card.js';
import { resolveKeeperPortrait } from '../lib/keeper-guide-assets.js';

/** Guide surfaces and browser bindings; no workbench state or preference store. */
export function createKeeperGuidanceView({
  elements, documentRef = document, windowRef = window,
  onDismiss, onSelectWorks, onCompareSelection, onImport
}) {
  const timers = new Set();
  function defer(callback) {
    const id = windowRef.setTimeout(() => { timers.delete(id); callback(); }, 0);
    timers.add(id);
  }
  function focusFallback(target) {
    defer(() => {
      const node = [target, elements.rankingHelpButton, elements.modeRanking, elements.modeSelection, elements.titleSearch]
        .find(candidate => candidate?.isConnected && !candidate.disabled && candidate.getClientRects().length && !candidate.closest('[hidden], [inert]'));
      node?.focus?.({ preventScroll: true });
    });
  }
  function render({ compare, compareMode, compareBarHidden, rankingGuide, portraits, secondaryActionDisabled }) {
    elements.workCompareBar.hidden = compareBarHidden;
    elements.keeperCompareGuide.replaceChildren();
    if (compare && compareMode) {
      elements.keeperCompareGuide.append(createKeeperGuideCard({
        documentRef, guideId: compare.id, domGuideId: 'compare.start',
        title: compare.title, body: compare.summary,
        actionLabel: '在作品卡上加入比较', helpArticleId: 'works.compare', helpLabel: '查看比较说明',
        onAction: onCompareSelection,
        dismissLabel: compare.enhanced ? '隐藏提示' : '',
        onDismiss: compare.enhanced ? () => {
          onDismiss(compare.id, compare.contentVersion);
          focusFallback(elements.compareModeToggle);
        } : undefined,
        enhanced: compare.enhanced,
        portrait: resolveKeeperPortrait(compare, { enabled: portraits && compare.enhanced, variant: 'bust' })
      }));
      elements.keeperCompareGuide.hidden = false;
    } else elements.keeperCompareGuide.hidden = true;

    elements.rankingCoachmark.replaceChildren();
    if (rankingGuide && (rankingGuide.id !== 'tier.firstDrag' || rankingGuide.enhanced)) {
      const firstDrag = rankingGuide.id === 'tier.firstDrag';
      const card = createKeeperGuideCard({
        documentRef, guideId: rankingGuide.id, domGuideId: firstDrag ? 'tier.first-drag' : 'tier.start',
        title: firstDrag ? '' : rankingGuide.title, eyebrow: firstDrag ? '' : '庭守提示', body: rankingGuide.summary,
        actionLabel: firstDrag ? '' : '前往作品库选择',
        helpArticleId: firstDrag ? '' : 'tier.overview', helpLabel: '查看排榜说明',
        onAction: firstDrag ? undefined : onSelectWorks,
        secondaryActionLabel: firstDrag ? '' : '从 Bangumi 导入',
        onSecondaryAction: firstDrag ? undefined : onImport,
        secondaryActionDisabled,
        dismissLabel: rankingGuide.enhanced ? (firstDrag ? '×' : '隐藏提示') : '',
        onDismiss: rankingGuide.enhanced ? () => {
          onDismiss(rankingGuide.id, rankingGuide.contentVersion);
          focusFallback(elements.rankingHelpButton);
        } : undefined,
        enhanced: rankingGuide.enhanced,
        portrait: resolveKeeperPortrait(rankingGuide, { enabled: portraits && rankingGuide.enhanced && !firstDrag })
      });
      if (firstDrag) card.classList.add('keeper-guide-card-compact');
      elements.rankingCoachmark.append(card);
      elements.rankingCoachmark.hidden = false;
      elements.rankingCoachmark.dataset.keeperGuide = firstDrag ? 'tier.first-drag' : 'tier.start';
    } else {
      elements.rankingCoachmark.hidden = true;
      elements.rankingCoachmark.removeAttribute('data-keeper-guide');
    }
  }
  function renderImport(guides, portraits) {
    const activeStep = elements.bangumiPublicImportResults.hidden ? 0 : 1;
    elements.bangumiPublicImportDialog.querySelectorAll('.bangumi-import-steps li').forEach((step, index) => {
      step.classList.toggle('is-active', index === activeStep);
      if (index === activeStep) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    for (const phase of ['input', 'result']) {
      const host = phase === 'input' ? elements.keeperBangumiInput : elements.keeperBangumiResult;
      const note = phase === 'input' ? elements.bangumiInputNote : elements.bangumiResultNote;
      const guide = guides[phase];
      host.replaceChildren(); host.hidden = true; note.hidden = false;
      if (!guide?.showEnhancement) continue;
      host.append(createKeeperGuideCard({
        documentRef, guideId: guide.id, title: guide.title, body: guide.summary,
        portrait: resolveKeeperPortrait(guide, { enabled: portraits }), dismissLabel: '隐藏提示',
        onDismiss: () => {
          onDismiss(guide.id, guide.contentVersion);
          const target = phase === 'input' || elements.bangumiPublicImportAppend.disabled
            ? elements.bangumiPublicUserInput : elements.bangumiPublicImportAppend;
          target.focus({ preventScroll: true });
        }
      }));
      host.hidden = false; note.hidden = true;
    }
  }
  return Object.freeze({
    render, renderImport,
    readSurface() {
      const dialogs = [...documentRef.querySelectorAll('dialog[open]')];
      return {
        live: documentRef.body.classList.contains('is-ranking-immersive'),
        dialogOpen: dialogs.length > 0,
        importDialogOpen: elements.bangumiPublicImportDialog.open,
        otherDialog: dialogs.some(dialog => dialog !== elements.bangumiPublicImportDialog)
      };
    },
    restoreImportFocus() {
      defer(() => focusFallback(documentRef.querySelector('[data-keeper-secondary-action="tier.start"]')));
    },
    connect({ onChange, onDragStart, onDragEnd }) {
      let dragSource = null;
      let dragGeneration = 0;
      const releaseSource = () => {
        dragSource?.removeEventListener('dragend', endDrag, true);
        dragSource = null;
      };
      const endDrag = () => {
        dragGeneration++;
        releaseSource();
        onDragEnd();
      };
      const startDrag = event => {
        releaseSource(); dragGeneration++;
        dragSource = event.target;
        dragSource?.addEventListener('dragend', endDrag, true);
        onDragStart();
      };
      const drop = () => {
        // A successful drop can remove the source card before dragend bubbles.
        // End suppression after drop handlers have committed, not during drag.
        const generation = dragGeneration;
        defer(() => { if (generation === dragGeneration) endDrag(); });
      };
      documentRef.addEventListener('dragstart', startDrag, true);
      documentRef.addEventListener('dragend', endDrag, true);
      documentRef.addEventListener('drop', drop, true);
      const observer = new windowRef.MutationObserver(records => {
        if (records.some(record => (
          record.attributeName === 'class' && record.target === documentRef.body
        ) || (
          record.attributeName === 'open' && record.target?.tagName === 'DIALOG'
        ))) onChange();
      });
      observer.observe(documentRef.body, { subtree: true, attributes: true, attributeFilter: ['open', 'class'] });
      return () => {
        observer.disconnect();
        releaseSource();
        documentRef.removeEventListener('dragstart', startDrag, true);
        documentRef.removeEventListener('dragend', endDrag, true);
        documentRef.removeEventListener('drop', drop, true);
        for (const id of timers) windowRef.clearTimeout(id);
        timers.clear();
      };
    }
  });
}

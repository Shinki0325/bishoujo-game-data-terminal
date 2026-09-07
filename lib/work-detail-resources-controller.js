import { createWorkspaceSession } from './workspace-session.js';
import { resolveDetailViewCountMode } from './detail-view-stats.js';

// Independent detail resource channels. Closing invalidates their UI ownership,
// not the shared credits/identity data services.
export function createWorkCreditsController({
  loader, view, dialog, contentRoot, ensureProjectRuntime, getProjectRuntime,
  loadIdentityCrosswalk, characterAssetBase, characterAssetFallbackBase, logger = console
}) {
  const session = createWorkspaceSession();
  let currentId = null;
  function start(work) {
    currentId = work.workId;
    const request = session.begin('work-credits');
    view.renderLoading();
    const loadCredits = async () => {
      try {
        const [credits] = await Promise.all([
          loader.load(work.workId), ensureProjectRuntime()
        ]);
        if (
          !request.isCurrent()
          || currentId !== work.workId
          || !dialog.open
        ) return;
        dialog.dataset.projectEntitySource = getProjectRuntime()?.adaptWorkDetail(work.workId, work)?.source ?? 'legacy';
        const proofMedia = getProjectRuntime()?.selectedMediaByWorkId.get(work.workId);
        dialog.dataset.mediaClearanceStatus = proofMedia?.availability === 'available' ? 'cleared' : 'legacy-fallback';
        if (credits === null) {
          view.clear();
          contentRoot.dataset.projectEntityPeople = '0';
          contentRoot.dataset.projectEntityCharacters = '0';
        } else {
          const scopedCredits = work.isCrossSourceAdmission === true
            ? { ...credits, cast: credits.cast.map(entry => ({ ...entry, sourceScope: 'admission' })) }
            : credits;
          const initialProjection = getProjectRuntime()?.projectCredits?.(scopedCredits);
          if (initialProjection !== undefined) {
            view.renderWork(initialProjection.credits);
            contentRoot.dataset.projectEntityPeople = String(initialProjection.statistics.confirmedPersonCount);
            contentRoot.dataset.projectEntityCharacters = String(initialProjection.statistics.confirmedCharacterCount);
          } else {
            view.renderWork(scopedCredits);
          }
          const [characterImageMap, projectIdentityCrosswalk] = await Promise.all([
            loader.loadCharacterImages(work.workId).catch(error => {
              logger.warn('work-detail character images unavailable; keeping text credits visible', error);
              return null;
            }),
            loadIdentityCrosswalk()
          ]);
          if (
            !request.isCurrent()
            || currentId !== work.workId
            || !dialog.open
          ) return;
          const personCharacter = getProjectRuntime()?.projectCredits?.(scopedCredits, {
            characterImageMap,
            characterAssetBase: characterAssetBase,
            characterAssetFallbackBase: characterAssetFallbackBase,
            projectIdentityCrosswalk,
          });
          if (personCharacter !== undefined) {
            view.renderWork(personCharacter.credits);
            contentRoot.dataset.projectEntityPeople = String(personCharacter.statistics.confirmedPersonCount);
            contentRoot.dataset.projectEntityCharacters = String(personCharacter.statistics.confirmedCharacterCount);
          } else {
            view.renderWork(credits);
          }
        }
      } catch (error) {
        if (
          !request.isCurrent()
          || currentId !== work.workId
          || !dialog.open
        ) return;
        logger.warn('work-detail credits unavailable; keeping the base details usable', error);
        view.renderError(() => {
          if (currentId !== work.workId || !request.isCurrent()) return;
          view.renderLoading();
          void loadCredits();
        });
      }
    };
    return loadCredits();
  }
  return Object.freeze({ start, suspend() { currentId = null; session.suspend(); } });
}

export function createWorkStatsController({
  row, output, endpointUrl, pageOrigin, isOpen, fetchImpl = globalThis.fetch
}) {
  const session = createWorkspaceSession();
  let currentId = null;
  function load(work) {
    currentId = work.workId;
    const request = session.begin('work-statistics');
    row.hidden = true;
    output.textContent = '加载中…';
    let endpoint;
    try {
      endpoint = new URL(endpointUrl);
    } catch {
      return;
    }
    const viewCountMode = resolveDetailViewCountMode({
      pageOrigin: pageOrigin,
      endpointOrigin: endpoint.origin
    });
    if (viewCountMode === 'local-preview') {
      if (
        !request.isCurrent()
        || currentId !== work.workId
        || !isOpen()
      ) return;
      output.textContent = '本地预览不显示统计';
      row.hidden = false;
      return;
    }
    // Only the public site calls its same-origin endpoint. Other different-
    // origin previews intentionally keep the row hidden without telemetry.
    if (viewCountMode !== 'same-origin') return;
    endpoint.searchParams.set('entityType', 'work');
    endpoint.searchParams.set('entityId', String(work.workId));
    row.hidden = false;
    return fetchImpl(endpoint, { cache: 'default', credentials: 'omit', signal: request.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`public stats rejected: ${response.status}`);
        return response.json();
      })
      .then(result => {
        if (
          !request.isCurrent()
          || currentId !== work.workId
          || !isOpen()
          || result?.entityType !== 'work'
          || result?.entityId !== String(work.workId)
          || !Number.isSafeInteger(result?.views)
          || result.views < 0
        ) return;
        output.textContent = `${result.views.toLocaleString('en-US')} 次`;
      })
      .catch(() => {
        if (!request.isCurrent() || currentId !== work.workId) return;
        row.hidden = true;
      });
  }


  return Object.freeze({ load, suspend() { currentId = null; session.suspend(); } });
}

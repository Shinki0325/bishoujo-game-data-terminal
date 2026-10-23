import { createRankingPreloader, preloadImage } from './ranking-preloader.js';
import { createWorkspaceSession } from './workspace-session.js';

/** Own asynchronous preview preparation and invalidate late work on navigation. */
export function createRankingMediaSession({
  visibleWorkIds, isActive, previewUrlForWork,
  preloader = createRankingPreloader({ load: preloadImage, concurrency: 4 })
}) {
  const session = createWorkspaceSession();
  return Object.freeze({
    cancel() { session.suspend(); preloader.cancel(); },
    async refresh(model) {
      const generation = session.begin('ranking-media');
      const visible = new Set(visibleWorkIds());
      const works = [...model.tiers.flatMap(tier => tier.works), ...model.candidateWorks];
      const entries = await Promise.all(works.map(async work => ({
        url: await previewUrlForWork(work), visible: visible.has(work.workId)
      })));
      if (!generation.isCurrent() || !isActive()) return false;
      preloader.replace(entries); generation.complete(); return true;
    }
  });
}

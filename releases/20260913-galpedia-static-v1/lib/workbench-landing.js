import {createWorkspaceSession} from './workspace-session.js';
import {createViewLifetime} from './view-lifetime.js';
import {createStaticSiteDataClient} from './page-data-client.js';
import {configuredAssetBase} from './runtime-config.js';
import {resolveAssetUrl} from './asset-url.js';
import {createSelectionCard} from '../views/selection-view.js';
import {createSelectionCardPresentation} from './selection-card-presentation.js';
import {
  WORKBENCH_LANDING_SNAPSHOT_KEY,
  captureWorkbenchLandingSnapshot,
  canUseWorkbenchLandingRoute,
  DEFAULT_WORKBENCH_STATE_STORAGE_KEY,
  hasPersistedWorkbenchState,
  readWorkbenchLandingSnapshot
} from './workbench-landing-snapshot.js';

// Default results must never stand in for a saved filter, shared query or detail.
function canShowLandingRoute(locationRef) {
  return canUseWorkbenchLandingRoute(locationRef);
}

function canShowDefaultLanding(locationRef, storage, storageKey) {
  return locationRef?.hash === '#works'
    && canShowLandingRoute(locationRef)
    && !hasPersistedWorkbenchState(storage, storageKey);
}

// Keep the legacy public predicate: a default landing must not stand in for
// an already persisted workspace. The private route gate below is used when
// a state-bound snapshot is available.
export function canShowWorkbenchLanding(locationRef, storage) {
  return canShowDefaultLanding(locationRef, storage, DEFAULT_WORKBENCH_STATE_STORAGE_KEY);
}

export function createWorkbenchLanding({documentRef=document,locationRef=location,storage=localStorage,storageKey=DEFAULT_WORKBENCH_STATE_STORAGE_KEY,isReady,navigate,onVisible}) {
  const session=createWorkspaceSession(),lifetime=createViewLifetime();
  const cardPresentation=createSelectionCardPresentation({
    read:key=>{
      try{return storage?.getItem?.(key)??null;}catch{return null;}
    },
    write:()=>{}
  });
  let preview=null,style=null,held=[],pending=null,previewRoute=null;
  const staticSiteData = createStaticSiteDataClient();
  async function loadStaticLanding() {
    const page = await staticSiteData.getBrowsePage('worksDefault', 1);
    const records = Array.isArray(page.records) ? page.records : [];
    const works = records.map(record => ({
      ...record,
      workId: String(record.workId ?? record.default_edition_id ?? record.id),
      title: record.title ?? record.displayTitle,
      displayTitle: record.displayTitle ?? record.title,
      releaseDate: record.releaseDate ?? record.release_date,
      median: record.median ?? record.score,
      voteCount: record.voteCount ?? record.votes,
      presentationMemberCount: record.presentationMemberCount ?? 1
    }));
    const assetBase = configuredAssetBase({ documentRef });
    const imageUrl = value => !value ? null : /^[a-z][a-z0-9+.-]*:/iu.test(value) ? value : resolveAssetUrl(value, assetBase);
    const coverUrls = new Map(works.map(work => [work.workId, {
      thumbnailUrl: imageUrl(work.coverPath),
      previewUrl: imageUrl(work.previewUrl)
    }]));
    return {works, coverUrls};
  }
  function remove() {
    session.suspend();
    const focusedId=preview?.contains(documentRef.activeElement)?documentRef.activeElement.closest('[data-work-id]')?.dataset.workId:null;
    preview?.remove();style?.remove();preview=null;style=null;previewRoute=null;
    for(const [node,inert] of held)node.inert=inert;
    held=[];delete documentRef.documentElement.dataset.workbenchPreview;
    if(focusedId&&canShowLandingRoute(locationRef)&&documentRef.documentElement.dataset.workbenchReady==='true') {
      const card=[...documentRef.querySelectorAll('#catalog-grid [data-work-id]')].find(node=>node.dataset.workId===focusedId);
      card?.querySelector('[data-control-type="details"]')?.focus({preventScroll:true});
    }
  }
  const suspend=()=>{
    if(!canShowLandingRoute(locationRef) || (previewRoute !== null && previewRoute !== locationRef.hash)) remove();
  };
  const windowRef=documentRef.defaultView;
  lifetime.listen(windowRef,'hashchange',suspend);
  async function show() {
    if(lifetime.disposed||isReady()||preview||!canShowLandingRoute(locationRef))return;
    if(pending)return pending;
    const request=session.begin('first-page');
    pending=(async()=>{
      // A saved workspace gets an early view only from its own state-bound
      // snapshot. It must never fall back to the default first page.
      const snapshot=await readWorkbenchLandingSnapshot({locationRef,storage,storageKey});
      if(snapshot && snapshot.route !== locationRef.hash)return;
      const hasState=hasPersistedWorkbenchState(storage,storageKey);
      if(!snapshot && (hasState || !canShowDefaultLanding(locationRef,storage,storageKey)))return;
      const payload=snapshot ?? await loadStaticLanding();
      if(!payload||!request.isCurrent()||isReady()||!canShowLandingRoute(locationRef))return;
      if(!snapshot && !canShowDefaultLanding(locationRef,storage,storageKey))return;
      const grid=documentRef.querySelector('#catalog-grid');if(!grid)return;
      const display=cardPresentation.inspect();
      preview=documentRef.createElement('section');preview.id='workbench-first-page';
      preview.setAttribute('aria-label',snapshot?'上次作品结果预览':'默认排序的首屏作品');
      const note=documentRef.createElement('p');note.className='workbench-landing-note';note.setAttribute('role','status');
      note.textContent=snapshot
        ? `先恢复上次显示的 ${Math.min(payload.works.length,28)} 部作品 · 完整筛选与排序正在准备，详情可点击后等待打开。`
        : `先展示默认排序前 ${Math.min(payload.works.length,28)} 部作品 · 全库搜索与筛选正在准备，详情可点击后等待打开。`;
      const cards=documentRef.createElement('div');cards.className='catalog-grid';cards.id='workbench-first-page-grid';
      const assetBase=documentRef.querySelector('meta[name="egs-tier-asset-base"]')?.content;
      for(const [index,work] of payload.works.slice(0,28).entries())cards.append(createSelectionCard(documentRef,work,{
        eagerCover:index<12,priorityCover:index===0,
        view:'full',selected:false,selectionEnabled:false,assetBase,
        display,
        coverUrl:payload.coverUrls?.get?.(work.workId)?.thumbnailUrl ?? null,
        previewUrl:payload.coverUrls?.get?.(work.workId)?.previewUrl ?? null,
        mobileSortKey:payload.filterState?.sortKey ?? 'voteCount',
        onToggle:()=>{},onOpenDetails:()=>navigate(`#work/${encodeURIComponent(work.workId)}`)
      }));
      preview.append(note,cards);
      style=documentRef.createElement('style');
      style.textContent='[data-workbench-preview="true"] #catalog-grid,[data-workbench-preview="true"] #catalog-list-state,[data-workbench-preview="true"] #selection-pagination,[data-workbench-preview="true"] #quick-ranking-entry{display:none!important}.workbench-landing-note{margin:12px 18px;color:var(--muted-text,currentColor);font-size:14px}[data-workbench-preview="true"] .catalog-controls,[data-workbench-preview="true"] .catalog-primary-actions{opacity:.55}';
      for(const node of documentRef.querySelectorAll('#selection-view .results-toolbar,#mobile-selection-view')){held.push([node,node.inert]);node.inert=true;}
      documentRef.head.append(style);grid.before(preview);
      documentRef.documentElement.dataset.workbenchPreview='true';
      previewRoute=locationRef.hash;
      request.complete();
      onVisible?.();
    })().catch(error=>{console.warn('early workbench page unavailable; normal loading continues',error);}).finally(()=>{pending=null;});
    return pending;
  }
  return {
    show,
    async capture(works, options={}) {
      return captureWorkbenchLandingSnapshot({works,...options,locationRef,storage,storageKey});
    },
    readSnapshot: () => readWorkbenchLandingSnapshot({locationRef,storage,storageKey}),
    snapshotKey: WORKBENCH_LANDING_SNAPSHOT_KEY,
    remove,
    dispose(){remove();session.dispose();lifetime.dispose();}
  };
}

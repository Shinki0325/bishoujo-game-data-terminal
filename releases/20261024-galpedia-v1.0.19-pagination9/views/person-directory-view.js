import { canonicalRole, directoryRoleFor } from '../lib/credit-role-policy.js';
import { personDirectoryRoles, personInDirectoryRole, orderPersonDirectoryRows, personDirectoryMetric, personDirectoryMetricHint } from '../lib/person-directory-roles.js';
import { CREDIT_ROLE_LABELS } from '../lib/credit-role-labels.js';
import {setManagedWorkThumbnail as setSafeWorkImage} from '../lib/managed-work-thumbnail.js';
import { setListState } from '../lib/list-state.js';
import { resolvePublicCoverUrl } from '../lib/asset-url-core.js';
import { createWorkspaceSession } from '../lib/workspace-session.js';
import { createCharacterImageGroup } from '../lib/character-image-loader.js';
const PAGE_SIZE = 48;
const REPRESENTATIVE_CHARACTER_LIMIT = 3;
const REPRESENTATIVE_LOAD_CONCURRENCY = 6;

import { filterPersonsBySearch } from '../lib/person-search.js';
import { createViewLifetime } from '../lib/view-lifetime.js';
import { personDisplayNameForRole, personDisplayNameVariantCount as personNameVariantCount } from '../lib/person-name-variants.js';
import { syncLocalFeedback } from '../lib/ui-page-heading.js';
import {
  activityAxisLabelPosition,
  activityAxisLabelYears,
  formatPersonActivitySpan,
  normalizePersonActivityBounds,
  resolvePersonActivityBounds
} from '../lib/person-activity-timeline.js';

function node(documentRef, tag, className = '', text = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = String(text);
  return element;
}

const ROLE_LABELS = CREDIT_ROLE_LABELS;
const DIRECTORY_ROLE_ORDER = Object.freeze(['voice-actor', 'scenario', 'artwork', 'music', 'unknown']);
function roleLabel(role) { return ROLE_LABELS[role] ?? role ?? '未分类'; }
function characterRoleLabel(role) {
  return ({ main: '主角', primary: '主角', side: '配角', sub: '配角', appears: '登场', 'メイン': '主角', 'サブ': '配角', '主角': '主角', '配角': '配角', '登场': '登场' })[role] ?? null;
}


function personRoleCounts(person) {
  if (person?.roles && typeof person.roles === 'object') return person.roles;
  const counts = Object.create(null);
  for (const credit of person?.credits ?? []) {
    const role = credit?.creditType === 'character-voiced-by' ? 'voice-actor' : String(credit?.roleCode ?? 'unknown');
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

// Directory tabs are a primary-function view. Keep every credit in the detail
// timeline, but avoid placing a person in several staff tabs because of a
// single secondary source credit.
function directoryRole(person) {
  if (typeof person?.directoryRole === 'string') return person.directoryRole;
  if (typeof person?.primaryRole === 'string' && person.primaryRole) return directoryRoleFor(person.primaryRole);
  const counts = personRoleCounts(person);
  if ((counts['voice-actor'] ?? 0) > 0) return 'voice-actor';
  if (!Object.values(counts).some(value => value > 0)) return 'unknown';
  // Same maximum and tie order, without allocating and sorting per person.
  let best = 'scenario';
  for (let index = 2; index < DIRECTORY_ROLE_ORDER.length; index++) {
    const role = DIRECTORY_ROLE_ORDER[index];
    if (Number(counts[role] ?? 0) > Number(counts[best] ?? 0)) best = role;
  }
  return best;
}

export function createPersonDirectoryView({ root, onSearch, onRoleChange, onSelect, onLoadPerson, onLoadRepresentativeCharacters, onOpenWork, onOpenPerson, onOpenCompany, onPageChange, imageUrlForWork, loadImageForWork, familyForWork = () => null, currentYear = new Date().getFullYear() } = {}) {
  if (!root) throw new TypeError('person directory root is required');
  const documentRef = root.ownerDocument;
  const lifetime = createViewLifetime();
  const compactDirectory = documentRef.defaultView?.matchMedia?.('(max-width:899px)');
  const directoryThumbnailJobs = new Map();
  const directoryThumbnailObserver = typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{
    for(const entry of entries)if(entry.isIntersecting){
      const run=directoryThumbnailJobs.get(entry.target);directoryThumbnailJobs.delete(entry.target);directoryThumbnailObserver.unobserve(entry.target);
      if(entry.target.isConnected)run?.();
    }
  },{rootMargin:'180px 0px'}):null;
  const prepareDirectoryThumbnail=(image,run)=>{
    if(!directoryThumbnailObserver){run();return;}
    directoryThumbnailJobs.set(image,run);directoryThumbnailObserver.observe(image);
  };
  const clearDirectoryThumbnails=()=>{directoryThumbnailObserver?.disconnect();directoryThumbnailJobs.clear();};
  lifetime.add(clearDirectoryThumbnails);
  const workImagePending = new Map();
  const settledWorkImages = new WeakSet();
  const workImageJobs = new WeakMap();
  const observedWorkImages = new Set();

  const hydrateWorkImage = async image => {
    const job = workImageJobs.get(image);
    if (!job || !image.isConnected) return;
    // One work can contain several characters or edition-specific images.
    const id = JSON.stringify([String(job.credit.workId),job.credit.characterId??job.credit.sourceCharacterId??null,job.credit.scope??null,job.credit.imageScopeStatus??null]);
    let pending = workImagePending.get(id);
    if (!pending) {
      pending = Promise.resolve().then(() => loadImageForWork(job.credit)).then(url=>{
        // A missing optional loader or a not-yet-ready source is not a cached
        // image. Let the next view binding try again; keep the supplied fallback.
        if(!url&&workImagePending.get(id)===pending)workImagePending.delete(id);
        settledWorkImages.add(pending);
        for(const [key,value] of workImagePending){if(workImagePending.size<=256)break;if(settledWorkImages.has(value))workImagePending.delete(key);}
        return url;
      }).catch(error => {if(workImagePending.get(id)===pending)workImagePending.delete(id); throw error;});
      workImagePending.set(id, pending);
    }
    try {
      const url = await pending;
      if (!image.isConnected) return;
      if (url) { setSafeWorkImage(image,resolvePublicCoverUrl(url)); }
      else if (job.fallback) setSafeWorkImage(image,job.fallback);
      else image.hidden = true;
    } catch { if (image.isConnected && job.fallback) setSafeWorkImage(image,job.fallback); }
  };
  const workImageObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { workImageObserver.unobserve(entry.target); observedWorkImages.delete(entry.target); void hydrateWorkImage(entry.target); }
  }, {rootMargin:'180px 0px'}) : null;
  lifetime.add(() => workImageObserver?.disconnect());
  function setWorkImage(image, credit, fallback) {
    fallback = resolvePublicCoverUrl(fallback);
    if (typeof loadImageForWork !== 'function') { if (fallback) setSafeWorkImage(image,fallback); return; }
    workImageJobs.set(image, {credit, fallback});
    if (workImageObserver) {
      observedWorkImages.add(image); workImageObserver.observe(image);
      queueMicrotask(() => {
        for (const oldImage of observedWorkImages) if (!oldImage.isConnected) { workImageObserver.unobserve(oldImage); observedWorkImages.delete(oldImage); }
      });
    }
    else Promise.resolve().then(() => hydrateWorkImage(image));
  }
  const search = root.querySelector('#person-directory-search');
  const list = root.querySelector('#person-directory-list');
  const directoryImages = createCharacterImageGroup(documentRef);
  list.before(directoryImages.button);
  lifetime.add(() => directoryImages.dispose());
  const empty = root.querySelector('#person-directory-empty');
  const count = root.querySelector('#person-directory-count');
  const previous = root.querySelector('#person-page-previous');
  const next = root.querySelector('#person-page-next');
  const page = root.querySelector('#person-page-number');
  const total = root.querySelector('#person-page-total');
  const representativeHeading = root.querySelector('.person-directory-list-head > span:first-child');
  const activityHeadingLabel = root.querySelector('#person-directory-activity-heading-label');
  const activityAxis = root.querySelector('#person-directory-activity-axis');
  const dialog = documentRef.querySelector('#person-detail-dialog');
  const detailTitle = documentRef.querySelector('#person-detail-title');
  const detailMeta = documentRef.querySelector('#person-detail-meta');
  const detailPrimaryRole = documentRef.querySelector('#person-detail-primary-role');
  const detailBody = documentRef.querySelector('#person-detail-body');
  const close = documentRef.querySelector('#person-detail-close');
  const roleTabs = [...root.querySelectorAll('[data-person-role]')];
  let model = [];
  let directoryLoaded = false;
  let remotePage = null;
  let roleCountSnapshot = null;
  let populationCount = null;
  const detailSession = createWorkspaceSession();
  let detailInFlight = null;
  let detailDisplayedId = null;
  const detailState = {sectionController:null,timelineReady:Promise.resolve(),restoreTimelineCount:async()=>{}};
  let filtered = [];
  let selectedId = null;
  let pageIndex = 0;
  let roleFilter = 'all';
  let activityBounds = resolvePersonActivityBounds([], currentYear);
  let suppliedActivityBounds = null;
  const representativeCache = new Map();
  const representativePending = new Map();
  let representativeObserver = null;
  let representativeQueue = [];
  let representativeActive = 0;
  let renderToken = 0;

  function representativeRows(value) {
    const rows = Array.isArray(value) ? value : value?.representativeCharacters;
    if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows.filter(row => {
      const key = String(row?.characterId ?? '');
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).slice(0, REPRESENTATIVE_CHARACTER_LIMIT);
  }

  function findPersonRow(personId) {
    return [...list.querySelectorAll('[data-person-id]')]
      .find(row => row.dataset.personId === String(personId)) ?? null;
  }

  function paintRepresentativeFaces(person, faces, rows, state = 'ready') {
    // Precomputed static faces are painted before their row enters the DOM.
    // Async callers retain their render-token and connected-node checks.
    if (!faces) return;
    faces.replaceChildren();
    faces.dataset.representativeState = state;
    for (const character of rows) {
      if (!character?.imageUrl) continue;
      const image = node(documentRef, 'img', 'person-directory-character-image');
      image.alt = ''; image.title = [character.name, characterRoleLabel(character.role), character.title].filter(Boolean).join(' · '); image.referrerPolicy = 'no-referrer';
      image.loading = 'lazy';
      image.dataset.characterId = character.characterId;
      // Safety badges belong to one thumbnail, never the shared three-image strip.
      const frame = node(documentRef, 'span', 'person-directory-character-frame');
      frame.append(image); faces.append(frame);
      prepareDirectoryThumbnail(image,()=>directoryImages.load(image, { url: character.imageUrl }));
    }
    if (!faces.children.length && state === 'ready') {
      faces.append(node(documentRef, 'span', 'person-directory-representative-empty', '—'));
    }
    if (state === 'error') { faces.title = '图片加载失败，角色文字资料仍可用；点击重试'; faces.dataset.representativeState = 'error'; }
    else faces.removeAttribute('title');
    // Loading/error placeholders are view state, never person source data.
  }

  async function requestRepresentativeCharacters(person, faces, token) {
    if (typeof onLoadRepresentativeCharacters !== 'function') return;
    const personId = String(person?.entityId ?? '');
    if (!personId) return;
    const cached = representativeCache.get(personId);
    if (cached) {
      paintRepresentativeFaces(person, faces, cached);
      return;
    }
    paintRepresentativeFaces(person, faces, [], 'loading');
    let pending = representativePending.get(personId);
    if (!pending) {
      pending = Promise.resolve().then(() => onLoadRepresentativeCharacters(personId, person))
        .then(value => {
          if(value == null)throw new Error('代表角色资料尚未就绪');
          const rows = representativeRows(value);
          representativeCache.set(personId, rows);
          while(representativeCache.size>256)representativeCache.delete(representativeCache.keys().next().value);
          representativePending.delete(personId);
          return rows;
        })
        .catch(error => {
          representativePending.delete(personId);
          throw error;
        });
      representativePending.set(personId, pending);
    }
    try {
      const rows = await pending;
      if (token === renderToken && personId === String(person.entityId) && faces.isConnected) paintRepresentativeFaces(person, faces, rows);
    } catch (error) {
      if (token === renderToken && personId === String(person.entityId) && faces.isConnected) paintRepresentativeFaces(person, faces, [], 'error');
      // A failed request is deliberately not cached. The next visible render
      // retries it, while a click on the failed face retries immediately.
    }
  }

  function drainRepresentativeQueue() {
    while (representativeActive < REPRESENTATIVE_LOAD_CONCURRENCY && representativeQueue.length) {
      const job = representativeQueue.shift();
      if (job.token !== renderToken || !job.faces?.isConnected) continue;
      representativeActive += 1;
      void requestRepresentativeCharacters(job.person, job.faces, job.token)
        .finally(() => { representativeActive -= 1; drainRepresentativeQueue(); });
    }
  }

  function enqueueRepresentativeJob(person, faces, row, token) {
    if (!faces || !row || token !== renderToken) return;
    if (representativeQueue.some(job => job.token === token && job.person.entityId === person.entityId)) return;
    representativeQueue.push({ person, faces, row, token });
    drainRepresentativeQueue();
  }

  function loadVisibleRepresentatives(visible, token) {
    if (typeof onLoadRepresentativeCharacters !== 'function') return;
    representativeObserver?.disconnect?.();
    representativeObserver = null;
    representativeQueue = [];
    const jobs = visible.map(person => ({ person, row: findPersonRow(person.entityId), faces: findPersonRow(person.entityId)?.querySelector('.person-directory-faces') }))
      // The pinned directory page already supplies reviewed portraits. Fetch
      // only missing rows, not a second representation of the same person.
      .filter(job => job.faces && !job.person.representativeCharacters?.length && !representativeCache.has(String(job.person.entityId)) && (roleFilter === 'voice-actor' || (roleFilter === 'all' && canonicalRole(job.person.primaryRole || directoryRole(job.person)) === 'voice-actor')));
    if (typeof IntersectionObserver === 'function') {
      representativeObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const job = jobs.find(candidate => candidate.row === entry.target);
          if (job) enqueueRepresentativeJob(job.person, job.faces, job.row, token);
        }
      }, { root: null, rootMargin: '180px 0px' });
      jobs.forEach(job => representativeObserver.observe(job.row));
      return;
    }
    // Test DOMs and older embedded browsers without IntersectionObserver
    // still remain bounded to the current page and global six-request queue.
    jobs.forEach(job => enqueueRepresentativeJob(job.person, job.faces, job.row, token));
  }

  function filteredModel() { return remotePage || roleFilter === 'all' ? model : orderPersonDirectoryRows(model.filter(person => personInDirectoryRole(person, roleFilter)), roleFilter); }
  function isVoiceActor(person) { return Number(person?.roles?.['voice-actor'] ?? person?.roles?.voice ?? 0) > 0; }
  function renderRoleTabCounts() {
    if (roleCountSnapshot === null) {
      roleCountSnapshot = new Map();
      for (const person of model) {
        for (const role of personDirectoryRoles(person)) roleCountSnapshot.set(role, (roleCountSnapshot.get(role) ?? 0) + 1);
      }
    }
    for (const tab of roleTabs) {
      const key = tab.dataset.personRole ?? 'all';
      const label = tab.dataset.baseLabel ?? tab.textContent.replace(/\s*[0-9,]+\s*$/u, '').trim();
      tab.dataset.baseLabel = label;
      const amount = remotePage ? (key === 'all' ? remotePage.searchCount : (remotePage.roleCounts[key] ?? 0)) : key === 'all' ? model.length : (roleCountSnapshot.get(key) ?? 0);
      tab.replaceChildren(node(documentRef, 'span', 'person-directory-tab-label', label), node(documentRef, 'span', 'person-directory-tab-count', ' ' + new Intl.NumberFormat('zh-CN').format(amount)));
    }
  }
  function showDialog() { if (typeof dialog?.showModal === 'function' && !dialog.open) dialog.showModal(); else if (dialog) dialog.open = true; }

  function markCurrentRows() {
    for (const row of list.querySelectorAll('[data-person-id]')) {
      const current = row.dataset.personId === selectedId;
      row.classList.toggle('is-current', current);
      if (current) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    }
  }

  function captureDetailViewState() {
    if (!detailBody) return null;
    const activeElement = documentRef.activeElement;
    const focus = detailBody.contains(activeElement)
      ? activeElement?.id
        ? { type: 'id', value: activeElement.id }
        : activeElement?.dataset?.detailFocusToken
          ? { type: 'token', value: activeElement.dataset.detailFocusToken }
          : null
      : null;
    const activePage = detailBody.querySelector('[data-person-detail-page][aria-selected="true"]')?.dataset.personDetailPage ?? null;
    const timelineSort = detailBody.querySelector('.person-detail-sort');
    const timelineDirection = detailBody.querySelector('.person-detail-sort-direction');
    return {
      activePage,
      identityTimelineStates: [...(detailBody.querySelector('.person-detail-layout')?.identityTimelineStates ?? [])],
      timelineVisible: detailBody.querySelectorAll('.person-edition-group').length,
      representativeMode: detailBody.querySelector('[data-representative-mode][aria-pressed="true"]')?.dataset.representativeMode,
      expandedEditions: [...detailBody.querySelectorAll('.person-edition-others[open]')].map(details => details.parentElement.dataset.editionGroup),
      expandedPeers: [...detailBody.querySelectorAll('.person-peer-expand[aria-expanded="true"]')].map(button => ({token: button.dataset.detailFocusToken, visible: button.parentElement.querySelectorAll('.person-peer-record').length})),
      focus,
      timelineQuery: detailBody.querySelector('.person-timeline-search')?.value ?? '',
      timelineYear: detailBody.querySelector('.person-timeline-year')?.value ?? '',
      timelineSortKey: timelineSort?.value ?? null,
      timelineDirection: timelineDirection?.getAttribute('aria-pressed') === 'true' ? 'asc' : 'desc'
    };
  }

  async function restoreDetailViewState(state) {
    if (!state || !detailBody) return;
    const controller = detailState.sectionController;
    const current = () => controller === detailState.sectionController && !controller?.signal.aborted;
    if (state.representativeMode) [...detailBody.querySelectorAll('[data-representative-mode]')].find(button => button.dataset.representativeMode === state.representativeMode && button.getAttribute('aria-pressed') !== 'true')?.click();
    const savedModes = detailBody.querySelector('.person-detail-layout')?.identityTimelineStates;
    if(savedModes && Array.isArray(state.identityTimelineStates)){ savedModes.clear(); for(const [mode,value] of state.identityTimelineStates) if(['all','characters','vocal','music','scenario','artwork'].includes(mode))savedModes.set(mode,value); }
    const year = detailBody.querySelector('.person-timeline-year');
    if (year && year.value !== state.timelineYear && [...year.options].some(option => option.value === state.timelineYear)) { year.value = state.timelineYear; year.dispatchEvent(new Event('change')); }
    const search = detailBody.querySelector('.person-timeline-search');
    if (search && typeof state.timelineQuery === 'string' && search.value !== state.timelineQuery) {
      search.value = state.timelineQuery;
      search.dispatchEvent(new Event('input'));
    }
    const timelineSort = detailBody.querySelector('.person-detail-sort');
    if (timelineSort && state.timelineSortKey && timelineSort.value !== state.timelineSortKey && [...timelineSort.options].some(option => option.value === state.timelineSortKey)) {
      timelineSort.value = state.timelineSortKey;
      timelineSort.dispatchEvent(new Event('change'));
    }
    const timelineDirection = detailBody.querySelector('.person-detail-sort-direction');
    if (timelineDirection && state.timelineDirection) {
      const isAscending = timelineDirection.getAttribute('aria-pressed') === 'true';
      if ((state.timelineDirection === 'asc') !== isAscending) timelineDirection.click();
    }
    if (state.activePage) {
      [...detailBody.querySelectorAll('[data-person-detail-page]')]
        .find(tab => tab.dataset.personDetailPage === state.activePage && !tab.hidden && tab.getAttribute('aria-selected') !== 'true')
        ?.click();
    }
    await detailState.timelineReady;
    if (!current()) return;
    await detailState.restoreTimelineCount(state.timelineVisible ?? 0);
    if (!current()) return;
    for (const details of detailBody.querySelectorAll('.person-edition-others')) {
      details.open = state.expandedEditions?.includes(details.parentElement.dataset.editionGroup) ?? false;
    }
    for (const saved of state.expandedPeers ?? []) {
      const button = [...detailBody.querySelectorAll('.person-peer-expand')].find(item => item.dataset.detailFocusToken === saved.token);
      if (button) { button.dataset.restoreCount = String(saved.visible); button.click(); }
    }
    if (state.focus) {
      const target = state.focus.type === 'id'
        ? documentRef.getElementById(state.focus.value)
        : [...detailBody.querySelectorAll('[data-detail-focus-token]')]
          .find(element => element.dataset.detailFocusToken === state.focus.value);
      target?.focus?.({ preventScroll: true });
    }
  }

  function invalidateDetailRequest() {
    detailState.sectionController?.abort();
    detailSession.suspend();
    const status = documentRef.querySelector('#person-detail-load-status');
    if (status) setListState({status,state:'ready'});
    detailInFlight = null;
    detailDisplayedId = null;
    dialog?.setAttribute('aria-busy', 'false');
  }

  function loadDetail(person) {
    const personId = person?.entityId;
    if (!personId) return Promise.resolve();
    if (dialog?.open && detailInFlight?.personId === personId && detailInFlight.request.isCurrent()) {
      markCurrentRows();
      return detailInFlight.promise;
    }
    if (dialog?.open && detailDisplayedId === personId && detailInFlight === null) {
      markCurrentRows();
      return Promise.resolve();
    }
    const request = detailSession.begin('person-detail');
    const sourceRoute = documentRef.defaultView.location.href;
    detailDisplayedId = null;
    const status = documentRef.querySelector('#person-detail-load-status');
    const hasSummary = Boolean(person.displayName || person.canonicalName || Array.isArray(person.credits));
    if (hasSummary) { renderDetail(person, { pending: true }); showDialog(); }
    markCurrentRows();
    dialog?.setAttribute('aria-busy', 'true');
    if (status) setListState({status,state:'loading',layout:'text',message:'正在补充人物资料…'});
    const flight = { personId, request, promise: null };
    detailInFlight = flight;
    const promise = (async () => {
      try {
        const [loaded, stats] = await Promise.all([onLoadPerson?.(personId, person, {section:'overview', signal:request.signal, priority:'visible'}) ?? person, person.roleStats ? person.roleStats : import('../lib/person-directory-projection.js').then(m=>m.loadPersonRoleStats(personId)).catch(()=>null),ensureDetailRenderer()]);
        const detail = stats ? {...loaded,roleStats:stats} : loaded;
        if(!request.isCurrent())return;
        await prepareDetailModel(detail);
        if (!request.isCurrent() || selectedId !== personId || hasSummary && !dialog?.open || !hasSummary && documentRef.defaultView.location.href !== sourceRoute) return;
        // Preserve the tab, timeline sort, and focus choice made while detail loads.
        const viewState = hasSummary ? captureDetailViewState() : null;
        renderDetail(detail);
        showDialog();
        if (viewState) await restoreDetailViewState(viewState);
        if (!request.isCurrent() || selectedId !== personId || !dialog?.open) return;
        detailDisplayedId = personId;
        request.complete();
        if (status) setListState({status,state:'ready'});
      } catch (error) {
        if (request.isCurrent() && (hasSummary || documentRef.defaultView.location.href === sourceRoute)) {
          request.fail(error);
          detailDisplayedId = personId;
          if (!hasSummary) { renderDetail(person, { pending: true }); showDialog(); }
          if (status) setListState({status,state:'error',layout:'text',message:'完整资料未能加载。',
            retry:() => { detailDisplayedId = null; void loadDetail(person); }});
        }
      } finally {
        if (request.isCurrent()) dialog?.setAttribute('aria-busy', 'false');
        if (detailInFlight?.request === request) detailInFlight = null;
      }
    })();
    flight.promise = promise;
    return promise;
  }
  function closeDetailFromUser() {
    selectedId = null;
    invalidateDetailRequest();
    if (dialog?.open) dialog.close();
    // Close before notifying main.js so its nested-person restore starts from
    // the same closed state for both the button and intercepted Escape paths.
    onSelect?.(null);
  }
  lifetime.listen(dialog, 'cancel', event => {
    event.preventDefault();
    closeDetailFromUser();
  });
  lifetime.listen(dialog, 'close', () => {
    // A native close event can be queued after a new detail has reopened the
    // same dialog. Do not let that stale event invalidate the new request.
    if (dialog.open) return;
    invalidateDetailRequest();
  });

  let detailRenderer, detailRendererPending, prepareDetailModel;
  const ensureDetailRenderer = () => detailRendererPending ??= import('./person-detail-renderer.js')
    .then(({createPersonDetailRenderer,preparePersonDetailRenderer}) => {prepareDetailModel=preparePersonDetailRenderer;return detailRenderer = createPersonDetailRenderer({
      documentRef,dialog,detailTitle,detailMeta,detailPrimaryRole,detailBody,currentYear,
      familyForWork,imageUrlForWork,loadImageForWork,setWorkImage,onLoadPerson,onOpenWork,onOpenPerson,onOpenCompany,
      node,roleLabel,characterRoleLabel,personRoleCounts,isVoiceActor,getRoleFilter:()=>roleFilter,state:detailState
    });}).catch(error=>{detailRendererPending=null;throw error;});
  let intentTimer=null, intentPending=null, intentId=null;
  const preparePersonIntent=person=>{
    if(intentTimer!==null)clearTimeout(intentTimer);
    intentTimer=setTimeout(()=>{
      intentTimer=null;
      if(intentPending||intentId===person.entityId||!list.isConnected)return;
      const connection=documentRef.defaultView?.navigator?.connection;
      if(connection?.saveData||['slow-2g','2g'].includes(connection?.effectiveType))return;
      intentId=person.entityId;
      intentPending=Promise.all([ensureDetailRenderer(),onLoadPerson?.(person.entityId,person,{section:'overview',priority:'intent',intentOnly:true})??person])
        .then(([,detail])=>detail?prepareDetailModel(detail):null).catch(()=>{intentId=null;}).finally(()=>{intentPending=null;});
    },100);
  };
  lifetime.add(()=>{if(intentTimer!==null)clearTimeout(intentTimer);});
  function renderDetail(person, options={}) {
    if(detailRenderer&&!options.pending)return detailRenderer(person,options);
    // Keep the existing title and loading status responsive while detail code loads.
    detailTitle.textContent=personDisplayNameForRole(person,roleFilter);
    detailMeta.textContent='';detailPrimaryRole.textContent='';detailBody.replaceChildren();
    dialog.dataset.entityId=String(person.entityId);
  }

  function render() {
    // Role selection can precede the first response. An unrequested model is
    // not an empty search result, and must not overwrite restored rows/counts.
    if (!directoryLoaded) { empty.hidden = true; return; }
    clearDirectoryThumbnails();
    const currentRenderToken = ++renderToken;
    const compact = compactDirectory?.matches === true;
    filtered = filteredModel();
    activityBounds = suppliedActivityBounds ?? resolvePersonActivityBounds(model, currentYear);
    if (activityHeadingLabel) activityHeadingLabel.textContent = '作品活动';
    if (activityAxis && !compact) {
      activityAxis.replaceChildren();
      for (const year of activityAxisLabelYears(activityBounds)) {
        const label = node(documentRef, 'span', 'person-directory-activity-axis-label', year);
        label.style.left = `${activityAxisLabelPosition(activityBounds, year) ?? 0}%`;
        activityAxis.append(label);
      }
    }
    const totalPages = remotePage?.pageCount ?? Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); pageIndex = Math.min(pageIndex, totalPages - 1);
    renderRoleTabCounts();
    if (representativeHeading) representativeHeading.textContent = roleFilter === 'voice-actor'
      ? '代表角色'
      : roleFilter === 'all' ? '代表角色/作品' : '代表作品';
    const metricsHeading = root.querySelector('.person-directory-list-head > span:nth-child(3)');
    if (metricsHeading) metricsHeading.textContent = roleFilter === 'voice-actor' ? '角色 / 名义' : roleFilter === 'vocalist' ? '歌曲 / 名义' : '作品 / 名义';
    syncLocalFeedback(count, new Intl.NumberFormat('zh-CN').format(remotePage?.totalCount ?? filtered.length));
    const resultSummary = root.querySelector('#person-result-summary');
    if (resultSummary) resultSummary.hidden = (remotePage?.totalCount ?? filtered.length) === populationCount;
    page.textContent = String(pageIndex + 1); total.textContent = String(totalPages);
    previous.disabled = pageIndex === 0; next.disabled = pageIndex >= totalPages - 1; list.replaceChildren();
    const rowsFragment = documentRef.createDocumentFragment();
    const visible = remotePage ? filtered : filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE); empty.hidden = visible.length !== 0;
    for (const person of visible) {
      const row = node(documentRef, 'button', 'person-directory-row'); row.type = 'button'; row.dataset.personId = person.entityId;
      const displayName = personDisplayNameForRole(person, roleFilter);
      row.setAttribute('aria-label', `查看人物 ${displayName}`);
      const faces = node(documentRef, 'span', 'person-directory-faces');
      const cell = node(documentRef, 'span', 'person-directory-person');
      const nameNode = node(documentRef, 'strong', 'person-directory-name', displayName); nameNode.title = displayName;
      cell.append(nameNode);
      const metricText = person.entityKind === 'source-placeholder' ? '来源未注明姓名' : `${personDirectoryMetric(person, roleFilter)} · 名义 ${personNameVariantCount(person)}`;
      const fillMetrics = host => metricText.split(' · ').forEach((text, index) => { if (index) host.append(documentRef.createTextNode(' · ')); host.append(node(documentRef, 'span', 'person-directory-metric-item', text)); });
      const sub = node(documentRef, 'span', 'person-directory-sub'); fillMetrics(sub); sub.title = personDirectoryMetricHint(roleFilter); cell.append(sub);
      const primaryRole = canonicalRole(person.primaryRole || directoryRole(person));
      const showCharacters = roleFilter === 'voice-actor' || (roleFilter === 'all' && primaryRole === 'voice-actor');
      faces.dataset.representativeType = showCharacters ? 'characters' : 'works';
      row.addEventListener('pointerenter',()=>preparePersonIntent(person));
      row.addEventListener('focus',()=>preparePersonIntent(person));
      row.addEventListener('pointerleave',()=>{if(intentTimer!==null){clearTimeout(intentTimer);intentTimer=null;}});
      if (showCharacters) {
        const cached = representativeCache.get(String(person.entityId));
        if (cached) paintRepresentativeFaces(person, faces, cached);
        else if (Array.isArray(person.representativeCharacters) && person.representativeCharacters.length) {
          paintRepresentativeFaces(person, faces, representativeRows(person.representativeCharacters));
        } else if (typeof onLoadRepresentativeCharacters === 'function') {
          paintRepresentativeFaces(person, faces, [], 'loading');
        }
        faces.addEventListener('click', event => {
          if (faces.dataset.representativeState !== 'error') return;
          event.preventDefault(); event.stopPropagation();
          representativeCache.delete(String(person.entityId));
          enqueueRepresentativeJob(person, faces, row, currentRenderToken);
        });
      } else {
        const scoped=['scenario','artwork','music','vocalist'].includes(roleFilter);
        faces.dataset.representativeScope=roleFilter;
        for (const work of (scoped ? person.representativeWorksByRole?.[roleFilter] ?? [] : person.representativeWorks ?? []).slice(0, 3)) {
          const image = node(documentRef, 'img', 'person-directory-work-image');
          image.alt = ''; image.title = work.title || ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          if (work.imageUrl || loadImageForWork) {
            prepareDirectoryThumbnail(image,()=>setWorkImage(image, work, work.imageUrl));
            image.addEventListener('error', () => { image.remove(); }, { once: true });
            faces.append(image);
          }
        }
      }
      row.append(faces, cell);
      if (!compact) {
      const activity = node(documentRef, 'span', 'person-directory-activity');
      const activityValues = Array.isArray(person.activity) ? person.activity : [];
      activity.style.setProperty('--person-activity-bucket-count', String(Math.max(1, activityValues.length || activityBounds.bucketCount)));
      activity.setAttribute('aria-label', `${formatPersonActivitySpan(person.firstYear, person.lastYear)}；${person.lastYear ? `最后收录于 ${person.lastYear}` : '最后收录年份未知'}`);
      activityValues.forEach((value, index) => {
        const bar = node(documentRef, 'i', Number(value) > 0 ? '' : 'is-empty');
        if (Number(value) > 0) bar.style.height = `${Math.max(8, Number(value))}%`;
        const bucketStart = activityBounds.buckets[index]?.startYear;
        const bucketEnd = activityBounds.buckets[index]?.endYear;
        bar.title = `${bucketStart}–${bucketEnd}`;
        activity.append(bar);
      });
      const metrics = node(documentRef, 'span', 'person-directory-metrics'); fillMetrics(metrics); metrics.title = personDirectoryMetricHint(roleFilter);
      const span = node(documentRef, 'span', 'person-directory-span');
      span.append(
        node(documentRef, 'span', 'person-directory-span-range', formatPersonActivitySpan(person.firstYear, person.lastYear)),
        node(documentRef, 'small', 'person-directory-span-last', person.lastYear ? `最后收录于 ${person.lastYear}` : '年份未知')
      );
      row.append(metrics, node(documentRef, 'span', 'person-directory-role', person.entityKind==='source-placeholder'?'来源署名':roleLabel(roleFilter === 'all' ? primaryRole : roleFilter)), activity, span);
      }
      row.addEventListener('click', () => {
        selectedId = person.entityId;
        if (onSelect?.(person.entityId) !== false) void loadDetail(person);
      }); rowsFragment.append(row);
    }
    list.append(rowsFragment);
    markCurrentRows();
    loadVisibleRepresentatives(visible, currentRenderToken);
  }

  if(compactDirectory)lifetime.listen(compactDirectory,'change',()=>{if(directoryLoaded)render();});
  lifetime.listen(search, 'input', () => { pageIndex = 0; onSearch?.(search.value); });
  lifetime.listen(previous, 'click', () => { if (remotePage) { onPageChange?.(Math.max(1, pageIndex)); return; } pageIndex = Math.max(0, pageIndex - 1); render(); onPageChange?.(pageIndex + 1); });
  lifetime.listen(next, 'click', () => { if (remotePage) { onPageChange?.(pageIndex + 2); return; } pageIndex += 1; render(); onPageChange?.(pageIndex + 1); });
  lifetime.listen(close, 'click', closeDetailFromUser);
  roleTabs.forEach((tab, index) => {
    lifetime.listen(tab, 'click', () => { roleFilter = tab.dataset.personRole ?? 'all'; roleTabs.forEach(item => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.setAttribute('aria-pressed', String(active)); item.tabIndex = active ? 0 : -1; }); pageIndex = 0; if (!remotePage) render(); onRoleChange?.(roleFilter); });
    lifetime.listen(tab, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? roleTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + roleTabs.length) % roleTabs.length;
      roleTabs[targetIndex].click(); roleTabs[targetIndex].focus();
    });
  });

  return Object.freeze({
    captureState:captureDetailViewState,restoreState:restoreDetailViewState,
    suspend() { representativeObserver?.disconnect?.(); representativeObserver = null; representativeQueue = []; invalidateDetailRequest(); },
    dispose() { representativeObserver?.disconnect?.(); representativeObserver = null; representativeQueue = []; detailSession.dispose(); lifetime.dispose(); invalidateDetailRequest(); list.replaceChildren(); },
    render({ persons = [], totalPersonCount = null, selectedPersonId = null, activityAxis: nextActivityAxis = null, remotePage: nextRemotePage = null } = {}) {
      directoryLoaded = true;
      root.dataset.directoryLoaded = 'true';
      remotePage = nextRemotePage;
      if (remotePage) pageIndex = remotePage.pageNumber - 1;
      model = Array.isArray(persons) ? persons : [];
      roleCountSnapshot = null;
      populationCount = totalPersonCount;
      suppliedActivityBounds = normalizePersonActivityBounds(nextActivityAxis);
      selectedId = selectedPersonId;
      render();
      if (selectedId) {
        const person = model.find(item => item.entityId === selectedId);
        if (person) {
          void loadDetail(person);
        }
      }
    },
    setPersons(persons) { model = Array.isArray(persons) ? persons : []; roleCountSnapshot = null; pageIndex = 0; render(); },
    setSelected(personId) {
      selectedId = personId;
      const person = model.find(item => item.entityId === personId);
      if (!person) return;
      void loadDetail(person);
    },
    openPerson(personId, summary = {}) {
      const id = String(personId ?? '').trim();
      if (!id) return false;
      selectedId = id;
      const person = model.find(item => String(item.entityId) === id)
        ?? { ...(summary && typeof summary === 'object' ? summary : {}), entityId: id };
      return loadDetail(person);
    },
    setRoleFilter(role = 'all') { roleFilter = roleTabs.some(tab => tab.dataset.personRole === role) ? role : 'all'; roleTabs.forEach(tab => { const active = tab.dataset.personRole === roleFilter; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.setAttribute('aria-pressed', String(active)); tab.tabIndex = active ? 0 : -1; }); pageIndex = 0; render(); },
    filter(query = '') {
      return filterPersonsBySearch(model, query);
    },
    getPageNumber() { return pageIndex + 1; },
    setPageNumber(value) { const requested = Number(value); if (!Number.isSafeInteger(requested) || requested < 1) return; pageIndex = requested - 1; render(); }
  });
}

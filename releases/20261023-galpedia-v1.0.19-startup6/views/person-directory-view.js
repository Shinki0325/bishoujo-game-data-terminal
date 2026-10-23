import { creditResponsibilityNotes, creditResponsibilityText } from '../lib/credit-responsibility.js';
import { nativeEntryHref } from '../lib/native-entry-route.js';
import { personSongDisplay } from '../lib/person-song-display.js';
import { personCreditInMode, personScopeOverview, groupPersonEditionRows, personCollaborationDetails, representativePersonWorks } from '../lib/person-detail-projection.js';
import { songCategoryLabel } from '../lib/song-category-label.js';
import { canonicalRole, directoryRoleFor } from '../lib/credit-role-policy.js';
import { personDirectoryRoles, personInDirectoryRole, orderPersonDirectoryRows, personDirectoryMetric, personDirectoryMetricHint } from '../lib/person-directory-roles.js';
import { CREDIT_ROLE_LABELS } from '../lib/credit-role-labels.js';
import {setManagedWorkThumbnail as setSafeWorkImage} from '../lib/managed-work-thumbnail.js';
import {companyName} from '../lib/company-ui/__company_v30/company-name.js';
import { setListState } from '../lib/list-state.js';
import { resolvePublicCoverUrl } from '../lib/asset-url-core.js';
import { formatReleaseDate, releaseDateSortCompare, releaseYear } from '../lib/work-release-date.js';
import { createWorkspaceSession } from '../lib/workspace-session.js';
import { createCharacterImageGroup } from '../lib/character-image-loader.js';
const PAGE_SIZE = 48;
const REPRESENTATIVE_CHARACTER_LIMIT = 3;
const REPRESENTATIVE_LOAD_CONCURRENCY = 6;

import { filterPersonsBySearch } from '../lib/person-search.js';
import { createViewLifetime } from '../lib/view-lifetime.js';
import { personDisplayNameForRole, personDisplayNameVariantCount as personNameVariantCount, personDisplayNameVariantLabels as personNameVariantLabels } from '../lib/person-name-variants.js';
import { syncSortDirectionControl } from '../lib/ui-sort-control.js';
import { syncLocalFeedback } from '../lib/ui-page-heading.js';
import {
  activityAxisLabelPosition,
  activityAxisLabelYears,
  extendPersonActivityYears,
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

export { groupPersonTimelineCredits, representativePersonSongs } from '../lib/person-timeline-model.js';
import { groupPersonTimelineCredits, representativePersonSongs } from '../lib/person-timeline-model.js';
import { queryPersonTimeline } from '../lib/person-section-projection.js';

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
  let sectionController = null, timelineReady = Promise.resolve(), restoreTimelineCount = async () => {};
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
      directoryImages.load(image, { url: character.imageUrl });
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
    const controller = sectionController;
    const current = () => controller === sectionController && !controller?.signal.aborted;
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
    await timelineReady;
    if (!current()) return;
    await restoreTimelineCount(state.timelineVisible ?? 0);
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
    sectionController?.abort();
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
        const [loaded, stats] = await Promise.all([onLoadPerson?.(personId, person, {section:'overview', signal:request.signal, priority:'visible'}) ?? person, person.roleStats ? person.roleStats : import('../lib/person-directory-projection.js').then(m=>m.loadPersonRoleStats(personId)).catch(()=>null)]);
        const detail = stats ? {...loaded,roleStats:stats} : loaded;
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

  function renderDetail(person, { pending = false } = {}) {
    sectionController?.abort();
    sectionController = new AbortController();
    const sectionSignal = sectionController.signal;
    timelineReady = Promise.resolve(); restoreTimelineCount = async () => {};
    if(person&&dialog)dialog.dataset.entityId=String(person.entityId);
    if (!person || !detailBody) return;
    if (pending && !Array.isArray(person.credits) && !person.displayName && !person.canonicalName) {
      // No identity summary is available yet. Do not expose fabricated zero
      // counts or treat an empty placeholder's mode as a user's selection.
      detailTitle.textContent = '人物详情';
      if (detailPrimaryRole) detailPrimaryRole.textContent = '';
      detailMeta.textContent = ''; detailMeta.removeAttribute('title');
      detailBody.replaceChildren(); return;
    }
    const sections = person.detailSections?.schema === 'galpedia-person-sections-v1' ? person.detailSections : null;
    const voiceActor = isVoiceActor(person);
    const primaryRole = canonicalRole(person.primaryRole || Object.entries(person.roles ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]);
    const musicRoles = ['vocalist', 'vocal', 'composition', 'lyrics', 'arrangement', 'music', 'songs', 'sound-director'];
    const recordedRoles = new Set(sections?.recordedRoles ?? [...Object.entries(personRoleCounts(person)).filter(([, count]) => count > 0).map(([role]) => canonicalRole(role)), ...(person.credits ?? []).map(credit => canonicalRole(credit.roleCode))]);
    const songRole = musicRoles.includes(primaryRole) ? primaryRole : musicRoles.find(role => recordedRoles.has(role));
    const musicCreator = Boolean(songRole);
    const vocalist = ['vocal','vocalist'].some(r=>recordedRoles.has(r));
    const musicMaker = ['composition','lyrics','arrangement','music','songs','sound-director'].some(r=>recordedRoles.has(r));
    const scenarioWriter=recordedRoles.has('scenario'), artworkArtist=recordedRoles.has('artwork');
    const representativeLabel = musicCreator ? (['vocalist', 'vocal'].includes(songRole) ? '代表歌曲' : '代表曲目') : '代表作品';
    const groupedCredits = sections ? [] : groupPersonTimelineCredits(person.credits ?? [], person.timelineCast ?? []);
    let representativeMode = ['scenario','artwork'].includes(roleFilter) && recordedRoles.has(roleFilter) ? roleFilter : roleFilter === 'voice-actor' && voiceActor ? 'characters' : roleFilter === 'vocalist' && vocalist ? 'vocal' : roleFilter === 'music' && musicMaker ? 'music' : ['scenario','artwork'].includes(primaryRole) ? primaryRole : primaryRole === 'voice-actor' ? 'characters' : ['vocal','vocalist'].includes(primaryRole) ? 'vocal' : musicCreator ? 'music' : 'all';
    const groupsByMode = new Map([['all', groupedCredits]]);
    const scopedGroups = () => {
      if (!groupsByMode.has(representativeMode)) groupsByMode.set(representativeMode,
        groupPersonTimelineCredits((person.credits ?? []).filter(c => personCreditInMode(c, representativeMode)), representativeMode === 'characters' ? person.timelineCast ?? [] : []));
      return groupsByMode.get(representativeMode);
    };
    let updateCollaborators = () => {};
    let updateIdentityScope = () => {};
    let selectTimelineYear = () => {};
    let updateOverviewAvailability = () => {};
    detailTitle.textContent = personDisplayNameForRole(person, roleFilter);
    if (detailPrimaryRole) detailPrimaryRole.textContent = [...new Set([primaryRole, ...(voiceActor ? ['voice-actor'] : []), ...['vocalist','composition','lyrics','arrangement'].filter(role => recordedRoles.has(role))])].filter(role => roleLabel(role) !== '其他').map(roleLabel).join(' · ');
    const allRoleText = detailPrimaryRole?.textContent ?? '';
    detailMeta.textContent = `总收录 ${new Intl.NumberFormat('zh-CN').format(person.workCount ?? 0)} 部作品${person.editionCount > person.workCount ? ` · ${new Intl.NumberFormat('zh-CN').format(person.editionCount)} 个版本` : ''} · ${new Intl.NumberFormat('zh-CN').format(personNameVariantCount(person))} 个名义`;
    if (person.scopeRevision) detailMeta.title = '作品数包含已记录的作品关联；版本数和年份只统计已记录的具体版本。';
    detailBody.replaceChildren();
    if(person.entityKind==='source-placeholder'){
      detailTitle.textContent='作曲者不详';
      if(detailPrimaryRole)detailPrimaryRole.textContent='来源署名';
      detailMeta.textContent='';
      const note=node(documentRef,'p','person-detail-aliases','这条记录表示来源未注明作曲者，并非一位作者的姓名。原署名：不詳。');
      detailBody.append(note);return;
    }
    const layout = node(documentRef, 'div', 'person-detail-layout');
    layout.dataset.page = 'overview';
    const navigation = node(documentRef, 'div', 'person-detail-navigation');
    const identity = node(documentRef, 'aside', 'person-detail-identity');
    if (voiceActor) {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      heading.append(node(documentRef, 'h3', '', '代表角色'));
      const representativeImages = createCharacterImageGroup(documentRef);
      heading.append(representativeImages.button);
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-list');
      const characters = Array.isArray(person.representativeCharacters) ? person.representativeCharacters.slice(0, 6) : [];
      for (const character of characters) {
        const item = node(documentRef, character.workId ? 'button' : 'div', 'person-representative-item');
        if (character.workId) {
          item.type = 'button'; item.dataset.workId = character.workId;
          item.setAttribute('aria-label', `查看${character.name || '角色'}的作品 ${character.title || ''}`);
          item.addEventListener('click', () => onOpenWork?.(character.workId));
        }
        item.dataset.characterId = character.characterId;
        item.title = [character.name || '未命名角色', characterRoleLabel(character.role), character.title].filter(Boolean).join(' · ');
        const image = character.imageUrl ? node(documentRef, 'img', 'person-representative-image') : null;
        if (image) {
          image.alt = ''; image.referrerPolicy = 'no-referrer';
          const frame = node(documentRef, 'span', 'person-representative-image-frame');
          frame.append(image); item.append(frame);
          representativeImages.load(image, { url: character.imageUrl, onState(state) { item.dataset.characterImageState = state; } });
        }
        item.append(node(documentRef, 'strong', '', character.name || '未命名角色'));
        if (character.title) item.append(node(documentRef, 'span', 'person-representative-context', character.title));
        if (character.scopeLabel) item.title += ' · ' + character.scopeLabel;
        list.append(item);
      }
      if (list.children.length) { representative.append(list); identity.append(representative); }
    }
    const workModes=[...(vocalist?['vocal']:[]),...(musicMaker?['music']:[]),...(scenarioWriter?['scenario']:[]),...(artworkArtist?['artwork']:[])];
    if (!workModes.length && !voiceActor) workModes.push('all');
    if (workModes.length) {
     for (const panelMode of workModes) {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative person-detail-representative-works');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      representative.dataset.representativeScope = panelMode;
      heading.append(node(documentRef, 'h3', '', panelMode === 'vocal' ? '代表歌曲' : panelMode === 'music' ? '代表曲目' : panelMode === 'scenario' ? '代表剧本作品' : panelMode === 'artwork' ? '代表原画作品' : representativeLabel));
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-works-list');
      const genericWorks = panelMode === 'all' ? (sections?.representativeWorksByMode?.all ?? representativePersonWorks(groupPersonTimelineCredits(person.credits??[]))) : [];
      const works = ['scenario','artwork'].includes(panelMode) ? (sections?.representativeWorksByMode?.[panelMode] ?? representativePersonWorks(groupPersonTimelineCredits((person.credits??[]).filter(c=>personCreditInMode(c,panelMode))))) : ['vocal','music'].includes(panelMode) ? (sections?.representativeSongsByMode?.[panelMode] ?? representativePersonSongs(person, groupPersonTimelineCredits((person.credits??[]).filter(c=>personCreditInMode(c,panelMode))), panelMode==='vocal'?'vocalist':'music')) : (genericWorks.length ? genericWorks : (person.representativeWorks??[]).slice(0,6));
      for (const work of works) {
        const item = node(documentRef, 'button', 'person-representative-work');
        item.type = 'button';
        item.dataset.workId = work.workId ?? '';
        if (work.workId) item.dataset.detailFocusToken = `representative-work:${work.workId}`;
        item.disabled = !work.workId;
        item.setAttribute('aria-label', work.song ? `${work.song.title} · 打开所属作品 ${work.displayTitle || work.title || ''}` : `打开作品 ${work.title || work.workId || '详情'}`);
        item.title = work.song ? `${work.song.title} · ${work.displayTitle || work.title || ''}` : work.title || '';
        const image = node(documentRef, 'img', 'person-representative-work-image');
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        const coverUrl = resolvePublicCoverUrl(imageUrlForWork?.(work) || work.imageUrl);
        if (coverUrl) {
          setSafeWorkImage(image, coverUrl);
          image.addEventListener('error', () => { image.hidden = true; item.classList.add('is-image-missing'); }, { once: true });
        } else {
          image.hidden = true;
          item.classList.add('is-image-missing');
        }
        const copy = node(documentRef, 'span', 'person-representative-work-copy');
        copy.append(node(documentRef, 'strong', 'person-representative-work-title', work.song?.title || work.title || '未命名作品'));
        if (work.song) {
          item.classList.add('person-representative-song');
          if (work.song.songId) item.dataset.songId = work.song.songId;
          const usage = [...new Set(work.song.categories.map(songCategoryLabel))].join(' / ');
          if (usage) copy.append(node(documentRef, 'span', 'person-representative-song-usage', usage));
          if (panelMode !== 'vocal') copy.append(node(documentRef, 'span', 'person-representative-work-meta', work.song.roleCodes.map(roleLabel).join(' / ')));
          copy.append(node(documentRef, 'span', 'person-representative-work-meta', work.displayTitle || work.title || '所属作品'));
        } else {
        const rating = work.bangumiRating;
        const score = rating?.status === 'mapped-rated' && Number.isFinite(rating.sortScore)
          ? `${rating.sortScore.toFixed(1)} 分` : '暂无评分';
        const votes = Number.isSafeInteger(rating?.sortVoteCount) && rating.sortVoteCount >= 0
          ? `${new Intl.NumberFormat('zh-CN').format(rating.sortVoteCount)} 票` : '';
        const scoreNode = node(documentRef, 'span', 'person-representative-work-meta',
          `Bangumi ${score}${votes ? ` · ${votes}` : ''}`);
        copy.append(scoreNode);
        }
        item.append(image, copy);
        item.addEventListener('click', () => work.workId && onOpenWork?.(work.workId));
        list.append(item);
      }
      if (list.children.length) { representative.append(list); identity.append(representative); }
     }
    }

    if (voiceActor || musicCreator || scenarioWriter || artworkArtist) {
      const tabs = node(documentRef, 'nav', 'person-representative-tabs');
      tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '查看身份');
      const panels = [...identity.querySelectorAll('.person-detail-representative')];
      const modes = ['all', ...(voiceActor ? ['characters'] : []), ...(vocalist ? ['vocal'] : []), ...(musicMaker ? ['music'] : []), ...(scenarioWriter ? ['scenario'] : []), ...(artworkArtist ? ['artwork'] : [])];
      const buttons = modes.map(mode => {
        const button = node(documentRef, 'button', '', {all:'全部', characters:'声优', vocal:'歌手', music:'音乐制作',scenario:'剧本',artwork:'原画'}[mode]);
        button.type = 'button'; button.dataset.representativeMode = mode;
        button.dataset.detailFocusToken = `representative-mode:${mode}`;
        tabs.append(button); return button;
      });
      const select = index => {
        representativeMode = modes[index];
        detailTitle.textContent = personDisplayNameForRole(person, representativeMode === 'characters' ? 'voice-actor' : representativeMode === 'vocal' ? 'vocalist' : ['music','scenario','artwork'].includes(representativeMode) ? representativeMode : 'all');
        buttons.forEach((button, i) => {
          button.setAttribute('aria-pressed', String(i === index));
        });
        panels.forEach(panel => {
          const songs = panel.classList.contains('person-detail-representative-works');
          panel.hidden = representativeMode !== 'all' && (songs ? representativeMode !== panel.dataset.representativeScope : representativeMode !== 'characters');
        });
        updateIdentityScope();
      };
      buttons.forEach((button, index) => {
        button.addEventListener('click', () => select(index));
        button.addEventListener('keydown', event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
          select(next); buttons[next].focus();
        });
      });
      select(Math.max(0, modes.indexOf(representativeMode)));
      if (modes.length > 2 || [...recordedRoles].some(role => !personCreditInMode({roleCode:role}, modes[1]))) navigation.append(tabs);
    }

    identity.append(node(documentRef, 'h3', 'person-detail-section-title', '名义'));
    const aliases = node(documentRef, 'div', 'person-detail-aliases');
    for (const variant of personNameVariantLabels(person)) aliases.append(node(documentRef, 'span', 'person-alias-chip', variant));
    if (!aliases.children.length) aliases.append(node(documentRef, 'span', 'person-detail-muted', '暂无其他名义'));
    identity.append(aliases);

    const content = node(documentRef, 'section', 'person-detail-content');
    const pageTabs = node(documentRef, 'nav', 'person-detail-page-tabs');
    pageTabs.id = 'person-detail-page-tabs';
    pageTabs.setAttribute('aria-label', '人物详情分页');
    pageTabs.setAttribute('role', 'tablist');
    const overviewButton = node(documentRef, 'button', 'person-detail-page-tab is-active', '概览');
    overviewButton.type = 'button'; overviewButton.id = 'person-detail-tab-overview'; overviewButton.dataset.personDetailPage = 'overview'; overviewButton.dataset.detailFocusToken = 'tab:overview'; overviewButton.setAttribute('role', 'tab'); overviewButton.setAttribute('aria-selected', 'true'); overviewButton.setAttribute('aria-pressed', 'true'); overviewButton.setAttribute('aria-controls', 'person-detail-panel-overview'); overviewButton.tabIndex = 0;
    const timelineButton = node(documentRef, 'button', 'person-detail-page-tab', '作品年表');
    timelineButton.type = 'button'; timelineButton.id = 'person-detail-tab-timeline'; timelineButton.dataset.personDetailPage = 'timeline'; timelineButton.dataset.detailFocusToken = 'tab:timeline'; timelineButton.setAttribute('role', 'tab'); timelineButton.setAttribute('aria-selected', 'false'); timelineButton.setAttribute('aria-pressed', 'false'); timelineButton.setAttribute('aria-controls', 'person-detail-panel-timeline'); timelineButton.tabIndex = -1;
    pageTabs.append(overviewButton, timelineButton); navigation.append(pageTabs);

    const overviewPage = node(documentRef, 'div', 'person-detail-page person-detail-overview-page');
    overviewPage.id = 'person-detail-panel-overview'; overviewPage.setAttribute('role', 'tabpanel'); overviewPage.setAttribute('aria-labelledby', overviewButton.id); overviewPage.tabIndex = 0;
    const duties = node(documentRef,'section','person-detail-music-duties'); overviewPage.append(duties);
    const activity = node(documentRef, 'section', 'person-detail-block person-detail-activity-block');
    const activityHeading = node(documentRef, 'div', 'person-detail-block-heading');
    activityHeading.append(node(documentRef, 'h3', '', voiceActor && !musicCreator ? '出演频率' : '作品活动'), node(documentRef, 'span', 'person-detail-muted', '作品数 · 按最早已知发行年'));
    activity.append(activityHeading);
    const chart = node(documentRef, 'div', 'person-frequency-chart');
    const bars = node(documentRef, 'div', 'person-frequency');
    const axis = node(documentRef, 'div', 'person-frequency-axis');
    const frequencyNote = node(documentRef, 'div', 'person-frequency-note');
    const updateActivity = summary => {
    bars.replaceChildren(); axis.replaceChildren(); frequencyNote.replaceChildren();
    activityHeading.querySelector('h3').textContent = representativeMode === 'characters' ? '配音活动' : representativeMode === 'vocal' ? '演唱活动' : representativeMode === 'music' ? '音乐制作活动' : representativeMode === 'scenario' ? '剧本活动' : representativeMode === 'artwork' ? '原画活动' : '作品活动';
    const activityYears = extendPersonActivityYears(summary, currentYear);
    activity.hidden = !activityYears.some(item => item.count > 0);
    // Keep the temporal resolution useful on a wide detail panel without
    // forcing every individual year label into the axis.
    const viewport = documentRef.defaultView?.innerWidth ?? 1440;
    const labelCount = Math.min(activityYears.length, viewport <= 760 ? Math.max(3, Math.floor((viewport - 60) / 50)) : 14);
    const labelIndexes = new Set(Array.from({length:labelCount}, (_, i) => Math.round(i * (activityYears.length - 1) / Math.max(1, labelCount - 1))));
    activityYears.forEach((item, index) => {
      const column = node(documentRef, 'button', 'person-frequency-column');
      column.type = 'button'; column.disabled = item.count <= 0;
      column.setAttribute('aria-label', `查看 ${item.year} 年的 ${item.count} 部作品`);
      column.dataset.detailFocusToken = `year:${item.year}`;
      const bar = node(documentRef, 'i', 'person-frequency-bar');
      const percent = Number(item.percent) || 0;
      bar.classList.toggle('is-empty', percent <= 0);
      if (percent > 0) bar.style.height = `${Math.max(4, percent)}%`;
      bar.title = `${item.year} · ${item.count} 部作品`;
      bar.dataset.count = String(item.count);
      column.title = bar.title;
      column.addEventListener('click', () => selectTimelineYear(String(item.year)));
      column.append(bar); bars.append(column);
      const labelText = labelIndexes.has(index) ? item.year : '';
      const label = node(documentRef, 'span', `person-frequency-year${labelText ? '' : ' is-empty'}`, labelText);
      label.style.left = `${index * 100 / Math.max(1, activityYears.length - 1)}%`;
      label.title = `${item.year} · ${item.count} 部作品`;
      axis.append(label);
    });
    if (!activityYears.length) bars.append(node(documentRef, 'span', 'person-detail-muted', '暂无年份数据'));
    frequencyNote.append(
      node(documentRef, 'span', 'person-detail-muted', formatPersonActivitySpan(summary.firstYear, summary.lastYear)),
      node(documentRef, 'span', 'person-detail-muted', `已收录 ${summary.workCount ?? 0} 部作品`)
    );
    };
    chart.append(bars, axis); activity.append(chart, frequencyNote);

    const companyBlock = node(documentRef, 'section', 'person-detail-block person-detail-company-block');
    const companyHeading = node(documentRef, 'div', 'person-detail-block-heading');
    companyHeading.append(node(documentRef, 'h3', '', '最多合作会社')); companyBlock.append(companyHeading);
    const companyList = node(documentRef, 'div', 'person-company-list');
    const updateCompanies = summary => {
    companyList.replaceChildren();
    const coCompanies = summary.coCompanies;
    companyBlock.hidden = !coCompanies.length;
    for (const company of coCompanies.slice(0, 5)) {
      const row = node(documentRef, 'button', 'person-company-row'); row.type = 'button'; row.dataset.companyId = company.companyId; row.dataset.detailFocusToken = `company:${company.companyId}`;
      row.append(node(documentRef, 'span', 'person-company-name', companyName(company.companyId,company.name)), node(documentRef, 'strong', '', company.count), node(documentRef, 'span', 'person-detail-muted', '部作品'));
      row.addEventListener('click', () => onOpenCompany?.(company.companyId)); companyList.append(row);
    }
    if (!companyList.children.length) companyList.append(node(documentRef, 'span', 'person-detail-muted', person.collaborationScopeStatus === 'unresolved' ? '合作会社待按版本重算' : '暂无合作会社'));
    };
    companyBlock.append(companyList);

    const coBlock = node(documentRef, 'section', 'person-detail-block person-detail-co-block');
    updateCollaborators = () => {
    coBlock.replaceChildren(); coBlock.dataset.collaborationMode = representativeMode;
    const modes = representativeMode === 'all' ? [...(voiceActor ? ['characters'] : []), ...(vocalist ? ['vocal'] : []), ...(musicMaker ? ['music'] : []), ...(scenarioWriter ? ['scenario'] : []), ...(artworkArtist ? ['artwork'] : [])] : [representativeMode];
    if (!modes.length) modes.push('all');
    for (const mode of modes) {
    const coHeading = node(documentRef, 'div', 'person-detail-block-heading');
    const coTitle = node(documentRef, 'h3');
    coHeading.append(coTitle);
    coBlock.append(coHeading);
    const coList = node(documentRef, 'div', 'person-co-list');
    const staffPeers = ['scenario','artwork'].includes(mode);
    const songPeers = ['songs','vocal','music'].includes(mode), workPeers = mode === 'music'||staffPeers;
    coTitle.textContent = staffPeers ? `${mode==='scenario'?'剧本':'原画'}合作` : workPeers ? '音乐制作合作' : songPeers ? '演唱合作' : voiceActor ? '共演声优' : '最多合作人物';
    coHeading.title = staffPeers ? '仅按本人以当前职责参与、且双方同版本有制作署名的作品统计；包含剧本、原画、企划等制作协作，跨版本去重。' : workPeers ? '以明确的同曲同版本署名确认合作，按作品去重排序；同作多首BGM和多个版本只计一次。' : songPeers ? '按已收录的同曲、同版本署名统计；相同歌曲跨版本只计一次。'+(person.songCollaborationMode==='vocal'?'列出与演唱合作的作词、作曲、编曲者。':'') : '按已收录的配音关系统计共同出演作品。';
    coList.replaceChildren();
    const legacyPeers = typeof person.getCoActors === 'function' ? person.getCoActors() : (person.coActors ?? []);
    const legacyIsSong = person.collaborationScopeStatus === 'recorded-song-relations';
    const coActors = staffPeers ? person[mode+'CoActors']??[] : mode === 'vocal' ? person.vocalCoActors ?? [] : workPeers ? person.musicCoActors ?? [] : songPeers ? person.songCoActors ?? (legacyIsSong ? legacyPeers : []) : person.voiceCoActors ?? (!legacyIsSong ? legacyPeers : []);
    if (!coActors.length) { coHeading.remove(); continue; }
    for (const actor of coActors.slice(0, 5)) {
      const row = node(documentRef, 'div', 'person-co-row'); row.dataset.personId = actor.personId;
      const name=node(documentRef, 'button', 'person-co-name', actor.name);
      name.type = 'button'; name.dataset.detailFocusToken = `person:${actor.personId}`;
      name.setAttribute('aria-label', `查看人物 ${actor.name}`);
      if(songPeers||staffPeers){
        name.classList.add('person-co-song-person');
        const duties=node(documentRef,'span','person-co-song-duties',(staffPeers?['scenario','artwork','director','planning','original-story','character-design']:['vocalist','lyrics','composition','arrangement']).filter(role=>actor.roles?.[role]).map(roleLabel).join(' · '));
        duties.title=Object.entries(actor.roles??{}).map(([role,count])=>`${roleLabel(role)}：${count} ${workPeers?'部作品':'首'}`).join('；');name.append(duties);
      }
      name.addEventListener('click', () => onOpenPerson?.(actor.personId));
      const toggle = node(documentRef, 'button', 'person-peer-expand'); toggle.type = 'button';
      toggle.dataset.detailFocusToken = `peer:${mode}:${actor.personId}`;
      toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', `查看与${actor.name}合作的${songPeers && !workPeers ? '歌曲' : '作品'}`);
      toggle.append(node(documentRef, 'strong', '', actor.count), node(documentRef, 'span', '', songPeers && !workPeers ? '首歌' : '部作品'), node(documentRef, 'span', 'person-peer-chevron', '›'));
      const detail = node(documentRef, 'div', 'person-peer-detail'); detail.hidden = true;
      detail.id = `person-peer-${mode}-${actor.personId}`; toggle.setAttribute('aria-controls', detail.id);
      let loaded = false, pending = false;
      const loadDetail = async () => {
        if (loaded || pending) return;
        pending = true; detail.replaceChildren(node(documentRef, 'span', 'person-detail-muted', '正在读取合作记录…'));
        detail.setAttribute('aria-busy', 'true');
        try {
          const [peer, own] = await Promise.all([
            onLoadPerson?.(actor.personId, actor, {signal: sectionSignal}),
            sections ? onLoadPerson?.(person.entityId, person, {signal: sectionSignal}) : person
          ]);
          if (!peer?.credits) throw Error('人物署名未加载');
          if (!detail.isConnected) return;
          const entries = personCollaborationDetails(own.credits, peer.credits, { songs: songPeers, vocalOnly: mode === 'vocal', musicOnly:mode==='music', workUnit:workPeers, staffMode:staffPeers?mode:null });
          detail.replaceChildren();
          const list = node(documentRef, 'div', 'person-peer-records'); detail.append(list);
          let count = 0;
          const more = node(documentRef, 'button', 'person-peer-more', '显示更多'); more.type = 'button';
          const append = () => {
            const end = Math.min(entries.length, count + 8);
            for (; count < end; count++) {
              const entry = entries[count], item = node(documentRef, 'div', 'person-peer-record');
              item.append(node(documentRef, 'strong', '', entry.title || (songPeers && !workPeers ? '歌曲' : '作品')));
              if (songPeers||staffPeers) item.append(node(documentRef, 'span', 'person-detail-muted', entry.roles.map(roleLabel).join(' / ')));
              for (const work of entry.works) {
                const target = work.workId || work.sourceWorkId || work.nativeWorkId;
                const member = work.workId ? familyForWork(work.workId)?.members?.find(m => String(m.workId) === String(work.workId)) : null;
                const label = [songPeers ? work.title : '', work.workId ? formatReleaseDate(work.releaseDate) : '作品记录', member?.platform].filter(Boolean).join(' · ');
                const link = node(documentRef, target ? 'button' : 'span', 'person-peer-work', label);
                if (target) { link.type = 'button'; link.dataset.detailFocusToken = toggle.dataset.detailFocusToken; link.addEventListener('click', () => work.nativeWorkId && !work.workId && !work.sourceWorkId ? documentRef.defaultView.location.hash = nativeEntryHref(work.nativeWorkId) : onOpenWork?.(target)); }
                item.append(link);
              }
              list.append(item);
            }
            more.hidden = count >= entries.length;
          };
          more.addEventListener('click', append); detail.append(more); append();
          while (count < Math.min(entries.length, Number(toggle.dataset.restoreCount) || 0)) append();
          if (!entries.length) detail.append(node(documentRef, 'span', 'person-detail-muted', '暂未取得可展开的合作记录'));
          detail.dataset.recordCount = String(entries.length); loaded = true;
        } catch {
          if (!detail.isConnected) return;
          const retry = node(documentRef, 'button', 'person-peer-more', '明细未能加载，点击重试'); retry.type = 'button'; retry.addEventListener('click', loadDetail); detail.replaceChildren(retry);
        } finally { pending = false; detail.removeAttribute('aria-busy'); }
      };
      toggle.addEventListener('click', () => { detail.hidden = !detail.hidden; toggle.setAttribute('aria-expanded', String(!detail.hidden)); if (!detail.hidden) void loadDetail(); });
      row.append(name, toggle, detail); coList.append(row);
    }
    if (!coList.children.length) coList.append(node(documentRef, 'span', 'person-detail-muted', songPeers ? '暂无已收录的歌曲合作署名' : person.collaborationScopeStatus === 'unresolved' ? '合作关系待按版本重算' : '暂无共演关系'));
    coBlock.append(coList);
    }
    coBlock.hidden = !coBlock.querySelector('.person-co-list');
    };
    const relationSummary = node(documentRef, 'div', 'person-detail-relation-summary');
    relationSummary.append(companyBlock, coBlock);
    overviewPage.append(activity, relationSummary); content.append(overviewPage);

    const timelinePage = node(documentRef, 'div', 'person-detail-page person-detail-timeline-page');
    timelinePage.id = 'person-detail-panel-timeline'; timelinePage.setAttribute('role', 'tabpanel'); timelinePage.setAttribute('aria-labelledby', timelineButton.id); timelinePage.tabIndex = 0;
    timelinePage.hidden = true;
    const worksBlock = node(documentRef, 'section', 'person-detail-block person-detail-works-block');
    const worksHeading = node(documentRef, 'div', 'person-detail-block-heading');
    worksHeading.classList.add('person-timeline-toolbar');
    const timelineTools = node(documentRef, 'div', 'person-detail-sort-tools gp-sort-control');
    const timelineYear = node(documentRef, 'select', 'person-timeline-year');
    timelineYear.setAttribute('aria-label', '按年份筛选年表');
    timelineYear.dataset.detailFocusToken = 'timeline-year';
    const updateYearOptions = () => {
      const selected = timelineYear.value;
      const years = sections?.years[representativeMode] ?? [...new Set(scopedGroups().map(c => releaseYear(c.releaseDate)).filter(Boolean))].sort((a,b) => b-a);
      timelineYear.hidden = !years.length;
      timelineYear.replaceChildren();
      for (const value of ['', ...years.map(String)]) {
        const option = node(documentRef, 'option', '', value ? `${value} 年` : '全部年份');
        option.value = value; timelineYear.append(option);
      }
      timelineYear.value = years.map(String).includes(selected) ? selected : '';
    };
    const timelineSort = node(documentRef, 'select', 'person-detail-sort');
    timelineSort.dataset.detailFocusToken = 'timeline-sort';
    timelineSort.setAttribute('aria-label', '作品年表排序');
    for (const [value, label] of [
      ['releaseDate', '发售日期'],
      ['bangumiVoteCount', 'Bangumi 评分人数'],
      ['bangumiScore', 'Bangumi 评分']
    ]) {
      const option = node(documentRef, 'option', '', label);
      option.value = value;
      timelineSort.append(option);
    }
    const timelineDirection = node(documentRef, 'button', 'person-detail-sort-direction');
    timelineDirection.type = 'button';
    timelineDirection.dataset.ui = 'utility';
    timelineDirection.dataset.detailFocusToken = 'timeline-direction';
    const timelineSortState = { key: 'releaseDate', direction: 'desc' };
    const timelineStates = new Map(); layout.identityTimelineStates = timelineStates; let activeTimelineMode = representativeMode;
    const updateTimelineControls = () => {
      timelineSort.value = timelineSortState.key;
      syncSortDirectionControl({
        button: timelineDirection,
        icon: timelineDirection,
        direction: timelineSortState.direction,
        labelPrefix: '作品年表排序',
        documentRef
      });
    };
    timelineTools.append(timelineYear, timelineSort, timelineDirection);
    const searchBar = node(documentRef, 'div', 'person-timeline-searchbar');
    const timelineSearch = node(documentRef, 'input', 'person-timeline-search');
    timelineSearch.type = 'search'; timelineSearch.placeholder = '查找作品、角色、歌曲或职责';
    timelineSearch.setAttribute('aria-label', '在人物作品年表中查找');
    timelineSearch.dataset.detailFocusToken = 'timeline-search';
    const searchStatus = node(documentRef, 'span', 'person-timeline-search-status');
    searchStatus.setAttribute('role', 'status');
    searchBar.append(timelineSearch);
    worksHeading.append(searchBar, timelineTools);
    worksBlock.append(worksHeading, searchStatus);
    const workList = node(documentRef, 'div', 'person-detail-works');
    const workForCredit = credit => credit.work ?? credit;
    const TIMELINE_BATCH_SIZE = 48;
    let timelineCredits = [];
    let timelineRenderedCount = 0;
    const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
    const searchText = new Map();
    const searchableText = c => {
      if (!searchText.has(c)) searchText.set(c, normalizeSearch([
        c.title, c.displayTitle, c.releaseDate, ...c.roleCodes.map(roleLabel), familyForWork(c.workId)?.members?.find(m => String(m.workId) === String(c.workId))?.platform,
        ...c.characters.map(x => x.name), ...c.songs.flatMap(x => [x.title, ...x.categories.map(songCategoryLabel), ...x.roleCodes.map(roleLabel)]),
        ...creditResponsibilityNotes(c.sourceCredits), ...c.sourceCredits.map(creditResponsibilityText), ...c.sourceCredits.map(credit => credit.creditedName)
      ].filter(Boolean).join(' ')));
      return searchText.get(c);
    };
    const sortedCredits = () => scopedGroups().filter(c => {
      if (timelineYear.value && String(releaseYear(c.releaseDate)) !== timelineYear.value) return false;
      const query = normalizeSearch(timelineSearch.value);
      return !query || query.split(' ').every(term => searchableText(c).includes(term));
    }).sort((a, b) => {
      if (person.scopeRevision && Boolean(a.workId||a.nativeReleaseIdentity) !== Boolean(b.workId||b.nativeReleaseIdentity)) return a.workId||a.nativeReleaseIdentity ? -1 : 1;
      const aw = workForCredit(a); const bw = workForCredit(b);
      const key = timelineSortState.key;
      const av = key === 'releaseDate' ? (a.releaseDate ?? aw.releaseDate ?? '') : aw[key];
      const bv = key === 'releaseDate' ? (b.releaseDate ?? bw.releaseDate ?? '') : bw[key];
      if (key === 'releaseDate') return releaseDateSortCompare(av, bv, { direction: timelineSortState.direction }) || String(a.workId ?? '').localeCompare(String(b.workId ?? ''), 'en');
      const aMissing = av === null || av === undefined || av === '';
      const bMissing = bv === null || bv === undefined || bv === '';
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      let result = typeof av === 'number' && typeof bv === 'number' ? bv - av : String(bv ?? '').localeCompare(String(av ?? ''), 'zh-Hans');
      if (timelineSortState.direction === 'asc') result *= -1;
      return result || String(a.workId ?? '').localeCompare(String(b.workId ?? ''), 'en') || String(a.displayTitle ?? a.title ?? '').localeCompare(String(b.displayTitle ?? b.title ?? ''), 'zh-Hans');
    });
    const appendTimelineDOM = () => {
      const start = timelineRenderedCount;
      const end = Math.min(timelineCredits.length, start + TIMELINE_BATCH_SIZE);
      for (let index = start; index < end; index += 1) {
        const editionGroup = timelineCredits[index];
        const container = node(documentRef, 'div', 'person-edition-group');
        container.dataset.editionGroup = editionGroup.rows.map(row => String(row.workId || row.sourceWorkIdentity || '')).sort().join('|');
        const distinctEditionTitles = new Set(editionGroup.rows.map(row => row.editionTitle || row.title).filter(Boolean)).size > 1;
        let others = null;
        for (const [editionIndex, credit] of editionGroup.rows.entries()) {
      const targetWorkId=credit.workId||credit.sourceWorkId||credit.nativeWorkId;
      const row = node(documentRef, 'button', 'person-work-row'); row.type = 'button'; if (person.scopeRevision) row.classList.add('has-edition-scope'); row.dataset.workId = credit.workId ?? ''; row.dataset.detailFocusToken = credit.workId ? `timeline-work:${credit.workId}` : `timeline-work:missing:${index}`; row.disabled = !targetWorkId;
      row.setAttribute('aria-setsize', String(timelineCredits.length));
      row.setAttribute('aria-posinset', String(index + 1));
      row.setAttribute('aria-label', `打开作品 ${credit.displayTitle ?? credit.title ?? '未命名作品'}`);
      const thumb = node(documentRef, 'span', 'person-work-thumb');
      const imageSource = typeof imageUrlForWork === 'function' ? imageUrlForWork(credit) : null;
      const thumbnailUrl = typeof imageSource === 'string' ? imageSource : imageSource?.thumbnailUrl;
      if (thumbnailUrl || loadImageForWork) {
        const image = node(documentRef, 'img');
        setWorkImage(image, credit, thumbnailUrl);
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { image.hidden = true; thumb.textContent = '▧'; }, { once: true });
        thumb.append(image);
      } else {
        thumb.textContent = '▧';
      }
      const copy = node(documentRef, 'span', 'person-work-copy');
      copy.append(node(documentRef, 'strong', 'person-work-title', credit.displayTitle ?? credit.title ?? '未命名作品'));
      const editionTitle = credit.editionTitle || credit.title;
      const editionText = [credit.editionPlatform, distinctEditionTitles && editionTitle !== credit.displayTitle ? editionTitle : ''].filter(Boolean).join(' · ');
      if (editionText) copy.append(node(documentRef, 'span', 'person-work-edition', editionText));
      for (const character of credit.characters) {
        const characterRole = characterRoleLabel(character.role);
        const roleClass = ['主角'].includes(characterRole) ? 'is-main' : ['配角'].includes(characterRole) ? 'is-side' : 'is-appears';
        const characterLine = node(documentRef, 'span', 'person-work-character');
        characterLine.append(node(documentRef, 'span', '', `饰演：${character.name}`));
        if (characterRole) characterLine.append(node(documentRef, 'span', `person-character-role ${roleClass}`, characterRole));
        if(character.appearanceContext)characterLine.append(node(documentRef,'span','person-character-role',character.appearanceContext));
        copy.append(characterLine);
      }
      if(credit.voiceCreditNotes?.length)copy.append(node(documentRef,'span','person-work-character','配音署名：'+credit.voiceCreditNotes.join('；')));
      const songDisplay=personSongDisplay(credit.songs,credit.sourceCredits);
      for (const song of songDisplay.songs) {
        const line = node(documentRef, 'span', 'person-work-song');
        if(song.songId)line.dataset.songId = song.songId;
        if(song.displayNotes.length)line.title=[...new Set(song.displayNotes)].join('；');
        const usage = [...new Set(song.categories.map(songCategoryLabel))].join(' / ');
        const roles = song.roleCodes.map(roleLabel).join(' / ');
        if (usage) line.append(node(documentRef, 'span', 'person-song-usage', usage));
        line.append(node(documentRef, 'span', 'person-song-title', song.title));
        if (roles) line.append(node(documentRef, 'span', 'person-song-duty', roles));
        for(const detail of song.displayDetails??[])if(detail!==roles)line.append(node(documentRef,'span','person-song-duty',detail));
        copy.append(line);
      }
      const notesByRole = new Map();
      for(const note of songDisplay.notes){const label=roleLabel(note.roleCode);if(!notesByRole.has(label))notesByRole.set(label,[]);notesByRole.get(label).push(note.text);}
      for (const [label, noteRows] of notesByRole) {
        const detail = node(documentRef, 'span', 'person-credit-scope-notes', label + '：' + noteRows.join('；'));
        detail.style.display = 'block'; detail.style.whiteSpace = 'normal'; detail.style.overflowWrap = 'anywhere';
        copy.append(detail);
      }
      const specificSongRole = credit.roleCodes.some(role => ['vocalist', 'vocal', 'lyrics', 'composition', 'arrangement'].includes(role));
      const shownSongRoles = new Set(songDisplay.songs.flatMap(song => song.roleCodes.map(canonicalRole)));
      const labels = [...new Set(credit.roleCodes.filter(role => (role !== 'songs' || !specificSongRole) && !shownSongRoles.has(canonicalRole(role))).map(roleLabel))];
      const meta = node(documentRef, 'span', 'person-work-meta');
      meta.append(node(documentRef,'span','person-work-date',credit.scope?.status && credit.scope.status !== 'confirmed' && !credit.nativeReleaseIdentity ? '作品记录' : formatReleaseDate(credit.releaseDate)), node(documentRef,'span','person-work-duties',labels.join(' / ')));
      meta.title = [meta.querySelector('.person-work-date').textContent, labels.join(' / ')].filter(Boolean).join(' · ');
      const sourceNotes = [...new Set(credit.sourceCredits.map(item => item.sourceRoleDetailName).filter(Boolean))];
      if (sourceNotes.length) meta.title += `\n来源记载：${sourceNotes.join('；')}`;
      row.append(thumb, copy, meta); row.addEventListener('click', () => {if(credit.nativeWorkId&&!credit.workId&&!credit.sourceWorkId)documentRef.defaultView.location.hash=nativeEntryHref(credit.nativeWorkId);else if(targetWorkId)onOpenWork?.(targetWorkId);});
      if (editionIndex === 0) container.append(row);
      else {
        if (!others) {
          others = node(documentRef, 'details', 'person-edition-others');
          const summary = node(documentRef, 'summary', '', `另有 ${editionGroup.rows.length - 1} 个版本`);
          summary.dataset.detailFocusToken = `editions:${editionGroup.rows[0].workId}`;
          others.append(summary); container.append(others);
        }
        others.append(row);
      }
      }
      workList.append(container);
      }
      timelineRenderedCount = end;
      if (!timelineRenderedCount) workList.append(node(documentRef, 'span', 'person-detail-muted', timelineSearch.value.trim() || timelineYear.value ? '没有找到匹配的作品记录' : '暂无作品记录'));
    };
    let timelineDirty = true, timelineTicket = 0, timelineIndex, batchPending = null;
    const reportTimelineError = error => {
      if (sectionSignal.aborted || !layout.isConnected) return;
      searchStatus.replaceChildren();
      const retry = node(documentRef, 'button', 'person-peer-more', '年表未能加载，点击重试');
      retry.type = 'button'; retry.addEventListener('click', renderTimeline); searchStatus.append(retry);
    };
    const appendTimelineBatch = () => {
      if (batchPending) return batchPending;
      const ticket = timelineTicket, groups = timelineCredits;
      const start = timelineRenderedCount, end = Math.min(groups.length, start + TIMELINE_BATCH_SIZE);
      const pending = (async () => {
        if (sections && start < end) {
          const selected = groups.slice(start, end);
          const ids = selected.flatMap(g => g.ids);
          const rows = await onLoadPerson(person.entityId, person, {section:'records', ids, index:timelineIndex, signal:sectionSignal});
          if (ticket !== timelineTicket || sectionSignal.aborted) return;
          let offset = 0;
          for (const group of selected) { group.rows = rows.slice(offset, offset + group.ids.length); offset += group.ids.length; }
        }
        if (ticket === timelineTicket && !sectionSignal.aborted) appendTimelineDOM();
      })();
      batchPending = pending;
      pending.catch(error => { if (ticket === timelineTicket) reportTimelineError(error); }).finally(() => { if (batchPending === pending) batchPending = null; });
      return pending;
    };
    restoreTimelineCount = async count => {
      if (layout.dataset.page !== 'timeline') return;
      while (!sectionSignal.aborted && timelineRenderedCount < Math.min(count, timelineCredits.length)) {
        const before = timelineRenderedCount;
        try { await appendTimelineBatch(); } catch { break; }
        if (timelineRenderedCount === before) break;
      }
    };
    const renderTimeline = () => {
      timelineDirty = true;
      const ticket = ++timelineTicket; batchPending = null;
      updateTimelineControls();
      if (layout.dataset.page !== 'timeline') return;
      timelineDirty = false;
      workList.setAttribute('aria-busy','true');
      timelineCredits = []; timelineRenderedCount = 0; workList.replaceChildren();
      const query = {mode:representativeMode, year:timelineYear.value, search:timelineSearch.value, ...timelineSortState};
      timelineReady = (async () => {
        let totalRecords, totalWorks;
        if (sections) {
          searchStatus.textContent = '正在读取作品年表…';
          const index = await onLoadPerson(person.entityId, person, {section:'index', signal:sectionSignal});
          if (ticket !== timelineTicket || sectionSignal.aborted) return;
          timelineIndex = index;
          const result = queryPersonTimeline(index, query);
          timelineCredits = result.groups; totalRecords = result.totalRecords; totalWorks = result.totalWorks;
        } else {
          const matches = sortedCredits();
          timelineCredits = groupPersonEditionRows(matches, familyForWork); totalRecords = matches.length; totalWorks = new Set(matches.map(r=>r.presentationWorkId||r.sourceWorkIdentity||r.workId||r.nativeReleaseIdentity)).size;
        }
        searchStatus.textContent = query.search.trim() || query.year ? `${query.year ? query.year + ' 年 · ' : ''}${totalWorks} 部作品` : '';
        await appendTimelineBatch();
      })().catch(error => { if (ticket === timelineTicket) reportTimelineError(error); }).finally(() => {
        if (ticket === timelineTicket) workList.setAttribute('aria-busy','false');
      });
      return timelineReady;
    };
    workList.addEventListener('scroll', () => {
      if (timelineRenderedCount >= timelineCredits.length) return;
      if (workList.scrollTop + workList.clientHeight < workList.scrollHeight - 180) return;
      appendTimelineBatch();
    }, { passive: true });
    // On narrow screens the dialog's layout, rather than the work list, owns
    // the scroll. Keep the same progressive loading behavior there so mobile
    // users can still reach every relation without paying the full DOM cost up
    // front.
    layout.addEventListener('scroll', () => {
      if (timelineRenderedCount >= timelineCredits.length) return;
      if (layout.scrollTop + layout.clientHeight < layout.scrollHeight - 260) return;
      appendTimelineBatch();
    }, { passive: true });
    timelineSort.addEventListener('change', () => { timelineSortState.key = timelineSort.value; renderTimeline(); });
    timelineSearch.addEventListener('input', () => { renderTimeline(); workList.scrollTop = 0; });
    timelineYear.addEventListener('change', () => { renderTimeline(); workList.scrollTop = 0; });
    selectTimelineYear = year => {
      timelineYear.value = year;
      timelineSearch.value = '';
      renderTimeline(); workList.scrollTop = 0; timelineButton.click(); timelineYear.focus();
    };
    timelineDirection.addEventListener('click', () => { timelineSortState.direction = timelineSortState.direction === 'asc' ? 'desc' : 'asc'; renderTimeline(); });
    updateIdentityScope = () => {
      if(activeTimelineMode !== representativeMode){
        timelineStates.set(activeTimelineMode,{...timelineSortState,year:timelineYear.value,search:timelineSearch.value});
        const saved=timelineStates.get(representativeMode)??{key:'releaseDate',direction:'desc',year:'',search:''};
        Object.assign(timelineSortState,{key:saved.key,direction:saved.direction});timelineSearch.value=saved.search;
        updateYearOptions();timelineYear.value=saved.year;activeTimelineMode=representativeMode;
      }
      const stats=person.roleStats??{},nameCount=personNameVariantCount(person);
      const metricRole={characters:'voice-actor',vocal:'vocalist',music:'music',scenario:'scenario',artwork:'artwork'}[representativeMode];
      detailMeta.textContent=(metricRole?personDirectoryMetric(person,metricRole):`总收录 ${person.workCount??0} 部作品`)+` · ${nameCount} 个名义`;
      detailMeta.title=metricRole?personDirectoryMetricHint(metricRole):'按已核定作品身份去重；各版本的原始署名保留在年表中。';
      if(detailPrimaryRole)detailPrimaryRole.textContent=representativeMode==='all'?allRoleText:{characters:'声优',vocal:'演唱',music:'音乐制作',scenario:'剧本',artwork:'原画'}[representativeMode];
      duties.replaceChildren();duties.hidden=representativeMode!=='music';
      if(!duties.hidden){
        duties.append(node(documentRef,'h3','','制作职责'));
        const labels=[['compositionWorks','作曲'],['lyricsWorks','作词'],['arrangementWorks','编曲'],['genericMusicWorks','未细分职责']];
        const line=node(documentRef,'div','person-detail-duty-counts');
        for(const [key,label]of labels)if(stats[key]>0)line.append(node(documentRef,'span','',`${label} ${stats[key]} 部`));
        duties.append(line,node(documentRef,'p','person-detail-muted','同一作品可以兼任多项职责，分项不相加。'));
      }
      const summary = sections?.overviews[representativeMode] ?? personScopeOverview(scopedGroups());
      updateYearOptions(); updateActivity(summary); updateCompanies(summary); updateCollaborators(); renderTimeline();
      workList.scrollTop = 0;
      updateOverviewAvailability();
    };
    updateIdentityScope();
    worksBlock.append(workList); timelinePage.append(worksBlock); content.append(timelinePage);
    const pageButtons = [overviewButton, timelineButton];
    for (const button of pageButtons) button.addEventListener('click', () => {
      const showOverview = button.dataset.personDetailPage === 'overview';
      layout.dataset.page = showOverview ? 'overview' : 'timeline';
      overviewPage.hidden = !showOverview; timelinePage.hidden = showOverview;
      if (!showOverview && timelineDirty) renderTimeline();
      pageButtons.forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.setAttribute('aria-pressed', String(active)); item.tabIndex = active ? 0 : -1; });
      layout.scrollTop = 0;
    });
    pageButtons.forEach((button, index) => button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? pageButtons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + pageButtons.length) % pageButtons.length;
      pageButtons[targetIndex].click();
      pageButtons[targetIndex].focus();
    }));
    const sourceWorksHeading = node(documentRef, 'h3', '', '参与作品');
    sourceWorksHeading.hidden = true; worksHeading.prepend(sourceWorksHeading);
    updateOverviewAvailability = () => {
      const hasOverview = !activity.hidden || !companyBlock.hidden || !coBlock.hidden;
      // A directory summary may not contain credits yet. Keep its initial tab
      // until the full record loads so state restoration cannot make a normal
      // person's first visit inherit a temporary empty-summary fallback.
      const timelineOnly = (sections?.groupCount ?? groupedCredits.length) > 0 && !hasOverview;
      overviewButton.hidden = timelineOnly;
      pageTabs.hidden = timelineOnly;
      sourceWorksHeading.hidden = !timelineOnly;
      navigation.hidden = [...navigation.children].every(child => child.hidden);
      if (timelineOnly) timelineButton.click();
    };
    updateOverviewAvailability();
    layout.append(navigation, identity, content); detailBody.append(layout);
  }

  function render() {
    // Role selection can precede the first response. An unrequested model is
    // not an empty search result, and must not overwrite restored rows/counts.
    if (!directoryLoaded) { empty.hidden = true; return; }
    const currentRenderToken = ++renderToken;
    filtered = filteredModel();
    activityBounds = suppliedActivityBounds ?? resolvePersonActivityBounds(model, currentYear);
    if (activityHeadingLabel) activityHeadingLabel.textContent = '作品活动';
    if (activityAxis) {
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
            setWorkImage(image, work, work.imageUrl);
            image.addEventListener('error', () => { image.remove(); }, { once: true });
            faces.append(image);
          }
        }
      }
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
      row.append(faces, cell, metrics, node(documentRef, 'span', 'person-directory-role', person.entityKind==='source-placeholder'?'来源署名':roleLabel(roleFilter === 'all' ? primaryRole : roleFilter)), activity, span);
      row.addEventListener('click', () => {
        selectedId = person.entityId;
        if (onSelect?.(person.entityId) !== false) void loadDetail(person);
      }); list.append(row);
    }
    markCurrentRows();
    loadVisibleRepresentatives(visible, currentRenderToken);
  }

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

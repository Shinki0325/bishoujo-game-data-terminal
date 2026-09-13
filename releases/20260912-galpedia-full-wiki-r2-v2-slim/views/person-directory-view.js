import { formatReleaseDate, releaseDateSortCompare } from '../lib/work-release-date.js';
import { createWorkspaceSession } from '../lib/workspace-session.js';
import { createCharacterImageGroup } from '../lib/character-image-loader.js';
const PAGE_SIZE = 48;
const REPRESENTATIVE_CHARACTER_LIMIT = 3;
const REPRESENTATIVE_LOAD_CONCURRENCY = 6;

import { filterPersonsBySearch } from '../lib/person-search.js';
import { createViewLifetime } from '../lib/view-lifetime.js';
import { personDisplayNameVariantCount as personNameVariantCount, personDisplayNameVariantLabels as personNameVariantLabels } from '../lib/person-name-variants.js';
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

const ROLE_LABELS = Object.freeze({ 'voice-actor': '声优', voice: '声优', scenario: '剧本', artwork: '原画', music: '音乐', vocalist: '演唱', vocal: '演唱', songs: '歌曲', lyrics: '作词', composition: '作曲', arrangement: '编曲', unknown: '其他' });
const DIRECTORY_ROLE_ORDER = Object.freeze(['voice-actor', 'scenario', 'artwork', 'music', 'unknown']);
function roleLabel(role) { return ROLE_LABELS[role] ?? role ?? '未分类'; }
function characterRoleLabel(role) {
  return ({ main: '主角', primary: '主角', side: '配角', sub: '配角', appears: '登场', 'メイン': '主角', 'サブ': '配角', '主角': '主角', '配角': '配角', '登场': '登场' })[role] ?? null;
}

export function groupPersonTimelineCredits(credits = [], acceptedCast = []) {
  const castByPresentation = new Map();
  for (const character of acceptedCast) {
    const rows = castByPresentation.get(character.presentationWorkId) ?? [];
    rows.push(character); castByPresentation.set(character.presentationWorkId, rows);
  }
  const works = new Map();
  for (const [index, credit] of credits.entries()) {
    // Edition IDs, not titles or family IDs, define a timeline entry.
    const key = credit.workId ? String(credit.workId) : `missing:${index}`;
    let group = works.get(key);
    if (!group) {
      group = { ...credit, sourceCredits: [], roleCodes: [], characters: [] };
      works.set(key, group);
    }
    group.sourceCredits.push(credit);
    const role = credit.creditType === 'character-voiced-by' ? 'voice-actor' : credit.roleCode ?? 'unknown';
    if (!group.roleCodes.includes(role)) group.roleCodes.push(role);
    if (role !== 'voice-actor' || !credit.characterName) continue;
    const identity = credit.characterId
      ? `${String(credit.characterId).startsWith('char_') ? 'canonical' : credit.source ?? 'source'}:${credit.characterId}`
      : `name:${String(credit.characterName).normalize('NFKC').replace(/\s+/gu, '')}`;
    if (!group.characters.some(item => item.identity === identity)) group.characters.push({
      identity, identified: Boolean(credit.characterId), name: credit.characterName, role: credit.characterRole
    });
  }
  return [...works.values()].map(group => {
    // The selected work roster already confirms this person's cast. It can
    // resolve work-level voice credits without guessing from their note text.
    const confirmed = new Map();
    if (group.roleCodes.includes('voice-actor')) for (const credit of group.sourceCredits) {
      for (const character of castByPresentation.get(credit.presentationWorkId) ?? []) {
        confirmed.set(character.characterId, {identity:`canonical:${character.characterId}`, identified:true, name:character.name, role:character.role});
      }
    }
    if (confirmed.size) group.characters = [...confirmed.values()];
    // A work-level cast note is supplementary when actual character entities
    // are known; it must not create a second role next to its resolved name.
    if (group.characters.some(character => character.identified)) group.characters = group.characters.filter(character => character.identified);
    return group;
  });
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
  if (typeof person?.primaryRole === 'string' && person.primaryRole) return person.primaryRole;
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

export function createPersonDirectoryView({ root, onSearch, onRoleChange, onSelect, onLoadPerson, onLoadRepresentativeCharacters, onOpenWork, onOpenPerson, onOpenCompany, onPageChange, imageUrlForWork, loadImageForWork, currentYear = new Date().getFullYear() } = {}) {
  if (!root) throw new TypeError('person directory root is required');
  const documentRef = root.ownerDocument;
  const lifetime = createViewLifetime();
  const workImagePending = new Map();
  const workImageJobs = new WeakMap();
  const observedWorkImages = new Set();
  const hydrateWorkImage = async image => {
    const job = workImageJobs.get(image);
    if (!job || !image.isConnected) return;
    const id = String(job.credit.workId);
    let pending = workImagePending.get(id);
    if (!pending) {
      pending = Promise.resolve().then(() => loadImageForWork(job.credit)).catch(error => {workImagePending.delete(id); throw error;});
      workImagePending.set(id, pending);
    }
    try {
      const url = await pending;
      if (!image.isConnected) return;
      if (url) { image.src = url; image.hidden = false; image.parentElement?.classList.remove('is-image-missing'); }
      else if (job.fallback) image.src = job.fallback;
      else image.hidden = true;
    } catch { if (image.isConnected && job.fallback) image.src = job.fallback; }
  };
  const workImageObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { workImageObserver.unobserve(entry.target); observedWorkImages.delete(entry.target); void hydrateWorkImage(entry.target); }
  }, {rootMargin:'180px 0px'}) : null;
  lifetime.add(() => workImageObserver?.disconnect());
  function setWorkImage(image, credit, fallback) {
    if (typeof loadImageForWork !== 'function') { if (fallback) image.src = fallback; return; }
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
  let remotePage = null;
  let roleCountSnapshot = null;
  let populationCount = null;
  const detailSession = createWorkspaceSession();
  let detailInFlight = null;
  let detailDisplayedId = null;
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
      image.dataset.characterId = character.characterId;
      directoryImages.load(image, { url: character.imageUrl });
      faces.append(image);
    }
    if (!faces.children.length && state === 'ready') {
      faces.append(node(documentRef, 'span', 'person-directory-representative-empty', '—'));
    }
    if (state === 'error') { faces.title = '图片加载失败，角色文字资料仍可用；点击重试'; faces.dataset.representativeState = 'error'; }
    else faces.removeAttribute('title');
    if (person) person.representativeCharacters = rows;
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
          const rows = representativeRows(value);
          representativeCache.set(personId, rows);
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
      .filter(job => job.faces && (roleFilter === 'voice-actor' || (roleFilter === 'all' && isVoiceActor(job.person))));
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

  function filteredModel() { return remotePage || roleFilter === 'all' ? model : model.filter(person => directoryRole(person) === roleFilter); }
  function isVoiceActor(person) { return Number(person?.roles?.['voice-actor'] ?? person?.roles?.voice ?? 0) > 0; }
  function renderRoleTabCounts() {
    if (roleCountSnapshot === null) {
      roleCountSnapshot = new Map();
      for (const person of model) {
        const role = directoryRole(person);
        roleCountSnapshot.set(role, (roleCountSnapshot.get(role) ?? 0) + 1);
      }
    }
    for (const tab of roleTabs) {
      const key = tab.dataset.personRole ?? 'all';
      const label = tab.dataset.baseLabel ?? tab.textContent.replace(/\s*[0-9,]+\s*$/u, '').trim();
      tab.dataset.baseLabel = label;
      const amount = remotePage ? (key === 'all' ? remotePage.searchCount : (remotePage.roleCounts[key] ?? 0)) : key === 'all' ? model.length : (roleCountSnapshot.get(key) ?? 0);
      tab.textContent = `${label} ${new Intl.NumberFormat('zh-CN').format(amount)}`;
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
      focus,
      timelineSortKey: timelineSort?.value ?? null,
      timelineDirection: timelineDirection?.getAttribute('aria-pressed') === 'true' ? 'asc' : 'desc'
    };
  }

  function restoreDetailViewState(state) {
    if (!state || !detailBody) return;
    const timelineSort = detailBody.querySelector('.person-detail-sort');
    if (timelineSort && state.timelineSortKey && [...timelineSort.options].some(option => option.value === state.timelineSortKey)) {
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
        .find(tab => tab.dataset.personDetailPage === state.activePage)
        ?.click();
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
    detailSession.suspend();
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
    detailDisplayedId = null;
    const status = documentRef.querySelector('#person-detail-load-status');
    renderDetail(person);
    showDialog();
    markCurrentRows();
    dialog?.setAttribute('aria-busy', 'true');
    if (status) { status.hidden = false; syncLocalFeedback(status, '正在补充人物资料…'); }
    const flight = { personId, request, promise: null };
    detailInFlight = flight;
    const promise = (async () => {
      try {
        const detail = await onLoadPerson?.(personId, person) ?? person;
        if (!request.isCurrent() || selectedId !== personId || !dialog?.open) return;
        // Preserve the tab, timeline sort, and focus choice made while detail loads.
        const viewState = captureDetailViewState();
        renderDetail(detail);
        restoreDetailViewState(viewState);
        detailDisplayedId = personId;
        request.complete();
        if (status) status.hidden = true;
      } catch (error) {
        if (request.isCurrent()) {
          request.fail(error);
          detailDisplayedId = personId;
          if (status) syncLocalFeedback(status, '完整资料暂时未能加载，先显示已收录摘要。');
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

  function renderDetail(person) {
    if (!person || !detailBody) return;
    const voiceActor = isVoiceActor(person);
    const primaryRole = Object.entries(person.roles ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    detailTitle.textContent = person.displayName || person.canonicalName || '未命名人物';
    if (detailPrimaryRole) detailPrimaryRole.textContent = roleLabel(primaryRole);
    detailMeta.textContent = `作品 ${new Intl.NumberFormat('zh-CN').format(person.workCount ?? 0)}${person.editionCount > person.workCount ? ` · 版本 ${new Intl.NumberFormat('zh-CN').format(person.editionCount)}` : ''} · 名义 ${new Intl.NumberFormat('zh-CN').format(personNameVariantCount(person))}`;
    detailBody.replaceChildren();
    const layout = node(documentRef, 'div', 'person-detail-layout');
    const identity = node(documentRef, 'aside', 'person-detail-identity');
    if (voiceActor) {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      heading.append(node(documentRef, 'h3', '', '代表角色'));
      const representativeImages = createCharacterImageGroup(documentRef);
      heading.append(representativeImages.button);
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-list');
      const characters = Array.isArray(person.representativeCharacters) ? person.representativeCharacters : [];
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
          representativeImages.load(image, { url: character.imageUrl, onState(state) { item.dataset.characterImageState = state; } });
          item.append(image);
        }
        item.append(node(documentRef, 'strong', '', character.name || '未命名角色'));
        if (character.title) item.append(node(documentRef, 'span', 'person-representative-context', character.title));
        list.append(item);
      }
      if (!list.children.length) list.append(node(documentRef, 'span', 'person-detail-muted', '暂无已确认代表角色'));
      representative.append(list); identity.append(representative);
    } else {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative person-detail-representative-works');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      heading.append(node(documentRef, 'h3', '', '代表作品'));
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-works-list');
      const works = Array.isArray(person.representativeWorks) ? person.representativeWorks : [];
      for (const work of works) {
        const item = node(documentRef, 'button', 'person-representative-work');
        item.type = 'button';
        item.dataset.workId = work.workId ?? '';
        if (work.workId) item.dataset.detailFocusToken = `representative-work:${work.workId}`;
        item.disabled = !work.workId;
        item.setAttribute('aria-label', `打开作品 ${work.title || work.workId || '详情'}`);
        item.title = work.title || '';
        const image = node(documentRef, 'img', 'person-representative-work-image');
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        if (work.imageUrl || loadImageForWork) {
          setWorkImage(image, work, work.imageUrl);
          image.addEventListener('error', () => { image.hidden = true; item.classList.add('is-image-missing'); }, { once: true });
        } else {
          image.hidden = true;
          item.classList.add('is-image-missing');
        }
        const copy = node(documentRef, 'span', 'person-representative-work-copy');
        copy.append(node(documentRef, 'strong', 'person-representative-work-title', work.title || '未命名作品'));
        const egsScore = Number.isFinite(work.median) ? `EGS ${Number(work.median).toLocaleString('zh-CN')} 分` : 'EGS 暂无评分';
        const egsVotes = Number.isSafeInteger(work.voteCount) ? `EGS ${new Intl.NumberFormat('zh-CN').format(work.voteCount)} 票` : 'EGS 暂无评分人数';
        const bangumiVotes = Number.isSafeInteger(work.bangumiVoteCount) ? `Bangumi ${new Intl.NumberFormat('zh-CN').format(work.bangumiVoteCount)} 票` : 'Bangumi 暂无评分人数';
        const scoreMeta = `${bangumiVotes} · ${egsScore} · ${egsVotes}`;
        const scoreNode = node(documentRef, 'span', 'person-representative-work-meta', scoreMeta); scoreNode.title = scoreMeta;
        copy.append(scoreNode);
        item.append(image, copy);
        item.addEventListener('click', () => work.workId && onOpenWork?.(work.workId));
        list.append(item);
      }
      if (!list.children.length) list.append(node(documentRef, 'span', 'person-detail-muted', '暂无可解析代表作品'));
      representative.append(list); identity.append(representative);
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
    const overviewButton = node(documentRef, 'button', 'person-detail-page-tab is-active', '共演关系');
    overviewButton.type = 'button'; overviewButton.id = 'person-detail-tab-overview'; overviewButton.dataset.personDetailPage = 'overview'; overviewButton.dataset.detailFocusToken = 'tab:overview'; overviewButton.setAttribute('role', 'tab'); overviewButton.setAttribute('aria-selected', 'true'); overviewButton.setAttribute('aria-pressed', 'true'); overviewButton.setAttribute('aria-controls', 'person-detail-panel-overview'); overviewButton.tabIndex = 0;
    const timelineButton = node(documentRef, 'button', 'person-detail-page-tab', '作品年表');
    timelineButton.type = 'button'; timelineButton.id = 'person-detail-tab-timeline'; timelineButton.dataset.personDetailPage = 'timeline'; timelineButton.dataset.detailFocusToken = 'tab:timeline'; timelineButton.setAttribute('role', 'tab'); timelineButton.setAttribute('aria-selected', 'false'); timelineButton.setAttribute('aria-pressed', 'false'); timelineButton.setAttribute('aria-controls', 'person-detail-panel-timeline'); timelineButton.tabIndex = -1;
    pageTabs.append(overviewButton, timelineButton); content.append(pageTabs);

    const overviewPage = node(documentRef, 'div', 'person-detail-page person-detail-overview-page');
    overviewPage.id = 'person-detail-panel-overview'; overviewPage.setAttribute('role', 'tabpanel'); overviewPage.setAttribute('aria-labelledby', overviewButton.id); overviewPage.tabIndex = 0;
    const activity = node(documentRef, 'section', 'person-detail-block person-detail-activity-block');
    const activityHeading = node(documentRef, 'div', 'person-detail-block-heading');
    activityHeading.append(node(documentRef, 'h3', '', voiceActor ? '出演频率' : '作品活动'), node(documentRef, 'span', 'person-detail-muted', '每年作品数'));
    activity.append(activityHeading);
    const chart = node(documentRef, 'div', 'person-frequency-chart');
    const bars = node(documentRef, 'div', 'person-frequency');
    const axis = node(documentRef, 'div', 'person-frequency-axis');
    const activityYears = extendPersonActivityYears(person, currentYear);
    // Keep the temporal resolution useful on a wide detail panel without
    // forcing every individual year label into the axis.
    const labelStep = Math.max(1, Math.ceil(activityYears.length / 14));
    activityYears.forEach((item, index) => {
      const bar = node(documentRef, 'i', 'person-frequency-bar');
      const percent = Number(item.percent) || 0;
      bar.classList.toggle('is-empty', percent <= 0);
      if (percent > 0) bar.style.height = `${Math.max(4, percent)}%`;
      bar.title = `${item.year} · ${item.count} 部`;
      bar.dataset.count = String(item.count);
      bars.append(bar);
      const labelText = (index % labelStep === 0 || index === activityYears.length - 1) ? item.year : '';
      const label = node(documentRef, 'span', `person-frequency-year${labelText ? '' : ' is-empty'}`, labelText);
      label.title = `${item.year} · ${item.count} 部`;
      axis.append(label);
    });
    if (!activityYears.length) bars.append(node(documentRef, 'span', 'person-detail-muted', '暂无年份数据'));
    chart.append(bars, axis); activity.append(chart);
    const yearsActive = person.firstYear && person.lastYear ? person.lastYear - person.firstYear + 1 : 0;
    const frequencyNote = node(documentRef, 'div', 'person-frequency-note');
    frequencyNote.append(
      node(documentRef, 'span', 'person-detail-muted', formatPersonActivitySpan(person.firstYear, person.lastYear)),
      node(documentRef, 'span', 'person-detail-muted', person.lastYear ? `最后收录于 ${person.lastYear}` : '最后收录年份未知'),
      node(documentRef, 'span', 'person-detail-muted', yearsActive ? `年均 ${(person.workCount / yearsActive).toFixed(1)} 部` : '年均未知')
    );
    activity.append(frequencyNote);

    const companyBlock = node(documentRef, 'section', 'person-detail-block person-detail-company-block');
    const companyHeading = node(documentRef, 'div', 'person-detail-block-heading');
    companyHeading.append(node(documentRef, 'h3', '', '最多合作会社')); companyBlock.append(companyHeading);
    const companyList = node(documentRef, 'div', 'person-company-list');
    const coCompanies = typeof person.getCoCompanies === 'function' ? person.getCoCompanies() : (person.coCompanies ?? []);
    for (const company of coCompanies.slice(0, 5)) {
      const row = node(documentRef, 'button', 'person-company-row'); row.type = 'button'; row.dataset.companyId = company.companyId; row.dataset.detailFocusToken = `company:${company.companyId}`;
      row.append(node(documentRef, 'span', 'person-company-name', company.name), node(documentRef, 'strong', '', company.count), node(documentRef, 'span', 'person-detail-muted', '部作品'));
      row.addEventListener('click', () => onOpenCompany?.(company.companyId)); companyList.append(row);
    }
    if (!companyList.children.length) companyList.append(node(documentRef, 'span', 'person-detail-muted', '暂无合作会社'));
    companyBlock.append(companyList);

    const coBlock = node(documentRef, 'section', 'person-detail-block person-detail-co-block');
    const coHeading = node(documentRef, 'div', 'person-detail-block-heading');
    coHeading.append(node(documentRef, 'h3', '', '最多合作人物')); coBlock.append(coHeading);
    const coList = node(documentRef, 'div', 'person-co-list');
    const coActors = typeof person.getCoActors === 'function' ? person.getCoActors() : (person.coActors ?? []);
    for (const actor of coActors.slice(0, 5)) {
      const row = node(documentRef, 'button', 'person-co-row'); row.type = 'button'; row.dataset.personId = actor.personId; row.dataset.detailFocusToken = `person:${actor.personId}`;
      row.append(node(documentRef, 'span', 'person-co-name', actor.name), node(documentRef, 'strong', '', actor.count), node(documentRef, 'span', 'person-detail-muted', '共同作品'));
      row.addEventListener('click', () => onOpenPerson?.(actor.personId)); coList.append(row);
    }
    if (!coList.children.length) coList.append(node(documentRef, 'span', 'person-detail-muted', '暂无共演关系'));
    coBlock.append(coList);
    const relationSummary = node(documentRef, 'div', 'person-detail-relation-summary');
    relationSummary.append(companyBlock, coBlock);
    overviewPage.append(activity, relationSummary); content.append(overviewPage);

    const timelinePage = node(documentRef, 'div', 'person-detail-page person-detail-timeline-page');
    timelinePage.id = 'person-detail-panel-timeline'; timelinePage.setAttribute('role', 'tabpanel'); timelinePage.setAttribute('aria-labelledby', timelineButton.id); timelinePage.tabIndex = 0;
    timelinePage.hidden = true;
    const worksBlock = node(documentRef, 'section', 'person-detail-block person-detail-works-block');
    const worksHeading = node(documentRef, 'div', 'person-detail-block-heading');
    worksHeading.append(node(documentRef, 'h3', '', '作品年表'));
    const timelineTools = node(documentRef, 'div', 'person-detail-sort-tools gp-sort-control');
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
    timelineTools.append(timelineSort, timelineDirection);
    worksHeading.append(timelineTools);
    worksBlock.append(worksHeading);
    const workList = node(documentRef, 'div', 'person-detail-works');
    const workForCredit = credit => credit.work ?? credit;
    const TIMELINE_BATCH_SIZE = 48;
    let timelineCredits = [];
    let timelineRenderedCount = 0;
    const sortedCredits = () => groupPersonTimelineCredits(person.credits ?? [], person.timelineCast ?? []).sort((a, b) => {
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
    const appendTimelineBatch = () => {
      const start = timelineRenderedCount;
      const end = Math.min(timelineCredits.length, start + TIMELINE_BATCH_SIZE);
      for (let index = start; index < end; index += 1) {
        const credit = timelineCredits[index];
      const row = node(documentRef, 'button', 'person-work-row'); row.type = 'button'; row.dataset.workId = credit.workId ?? ''; row.dataset.detailFocusToken = credit.workId ? `timeline-work:${credit.workId}` : `timeline-work:missing:${index}`; row.disabled = !credit.workId;
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
      for (const character of credit.characters) {
        const characterRole = characterRoleLabel(character.role);
        const roleClass = ['主角'].includes(characterRole) ? 'is-main' : ['配角'].includes(characterRole) ? 'is-side' : 'is-appears';
        const characterLine = node(documentRef, 'span', 'person-work-character');
        characterLine.append(node(documentRef, 'span', '', `饰演：${character.name}`));
        if (characterRole) characterLine.append(node(documentRef, 'span', `person-character-role ${roleClass}`, characterRole));
        copy.append(characterLine);
      }
      const specificSongRole = credit.roleCodes.some(role => ['vocalist', 'vocal', 'lyrics', 'composition', 'arrangement'].includes(role));
      const labels = [...new Set(credit.roleCodes.filter(role => role !== 'songs' || !specificSongRole).map(roleLabel))];
      const meta = node(documentRef, 'span', 'person-work-meta', `${labels.join(' / ')} · ${formatReleaseDate(credit.releaseDate)}`);
      meta.title = meta.textContent;
      const sourceNotes = [...new Set(credit.sourceCredits.map(item => item.sourceRoleDetailName).filter(Boolean))];
      if (sourceNotes.length) meta.title += `\n来源记载：${sourceNotes.join('；')}`;
      row.append(thumb, copy, meta); row.addEventListener('click', () => credit.workId && onOpenWork?.(credit.workId)); workList.append(row);
      }
      timelineRenderedCount = end;
      if (!timelineRenderedCount) workList.append(node(documentRef, 'span', 'person-detail-muted', '暂无可解析作品关系'));
    };
    const renderTimeline = () => {
      updateTimelineControls();
      timelineCredits = sortedCredits();
      timelineRenderedCount = 0;
      workList.replaceChildren();
      appendTimelineBatch();
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
    timelineDirection.addEventListener('click', () => { timelineSortState.direction = timelineSortState.direction === 'asc' ? 'desc' : 'asc'; renderTimeline(); });
    renderTimeline();
    worksBlock.append(workList); timelinePage.append(worksBlock); content.append(timelinePage);
    const pageButtons = [overviewButton, timelineButton];
    for (const button of pageButtons) button.addEventListener('click', () => {
      const showOverview = button.dataset.personDetailPage === 'overview';
      overviewPage.hidden = !showOverview; timelinePage.hidden = showOverview;
      pageButtons.forEach(item => { const active = item === button; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.setAttribute('aria-pressed', String(active)); item.tabIndex = active ? 0 : -1; });
    });
    pageButtons.forEach((button, index) => button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? pageButtons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + pageButtons.length) % pageButtons.length;
      pageButtons[targetIndex].click();
      pageButtons[targetIndex].focus();
    }));
    layout.append(identity, content); detailBody.append(layout);
  }

  function render() {
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
    syncLocalFeedback(count, new Intl.NumberFormat('zh-CN').format(remotePage?.totalCount ?? filtered.length));
    const resultSummary = root.querySelector('#person-result-summary');
    if (resultSummary) resultSummary.hidden = (remotePage?.totalCount ?? filtered.length) === populationCount;
    page.textContent = String(pageIndex + 1); total.textContent = String(totalPages);
    previous.disabled = pageIndex === 0; next.disabled = pageIndex >= totalPages - 1; list.replaceChildren();
    const visible = remotePage ? filtered : filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE); empty.hidden = visible.length !== 0;
    for (const person of visible) {
      const row = node(documentRef, 'button', 'person-directory-row'); row.type = 'button'; row.dataset.personId = person.entityId;
      const displayName = person.displayName || person.canonicalName || '未命名人物';
      row.setAttribute('aria-label', `查看人物 ${displayName}`);
      const faces = node(documentRef, 'span', 'person-directory-faces');
      const cell = node(documentRef, 'span', 'person-directory-person');
      const nameNode = node(documentRef, 'strong', 'person-directory-name', displayName); nameNode.title = displayName;
      cell.append(nameNode);
      const sub = node(documentRef, 'span', 'person-directory-sub'); sub.append(node(documentRef, 'span', '', `作品 ${person.workCount} · 名义 ${personNameVariantCount(person)}`)); cell.append(sub);
      const primaryRole = directoryRole(person);
      const showCharacters = roleFilter === 'voice-actor' || (roleFilter === 'all' && isVoiceActor(person));
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
        for (const work of (person.representativeWorks ?? []).slice(0, 3)) {
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
      const metrics = node(documentRef, 'span', 'person-directory-metrics', `作品 ${person.workCount} · 名义 ${personNameVariantCount(person)}`);
      const span = node(documentRef, 'span', 'person-directory-span');
      span.append(
        node(documentRef, 'span', 'person-directory-span-range', formatPersonActivitySpan(person.firstYear, person.lastYear)),
        node(documentRef, 'small', 'person-directory-span-last', person.lastYear ? `最后收录于 ${person.lastYear}` : '年份未知')
      );
      row.append(faces, cell, metrics, node(documentRef, 'span', 'person-directory-role', roleLabel(primaryRole)), activity, span);
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
    suspend() { representativeObserver?.disconnect?.(); representativeObserver = null; representativeQueue = []; invalidateDetailRequest(); },
    dispose() { representativeObserver?.disconnect?.(); representativeObserver = null; representativeQueue = []; detailSession.dispose(); lifetime.dispose(); invalidateDetailRequest(); list.replaceChildren(); },
    render({ persons = [], totalPersonCount = null, selectedPersonId = null, activityAxis: nextActivityAxis = null, remotePage: nextRemotePage = null } = {}) {
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
      void loadDetail(person);
      return true;
    },
    setRoleFilter(role = 'all') { roleFilter = roleTabs.some(tab => tab.dataset.personRole === role) ? role : 'all'; roleTabs.forEach(tab => { const active = tab.dataset.personRole === roleFilter; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.setAttribute('aria-pressed', String(active)); tab.tabIndex = active ? 0 : -1; }); pageIndex = 0; render(); },
    filter(query = '') {
      return filterPersonsBySearch(model, query);
    },
    getPageNumber() { return pageIndex + 1; },
    setPageNumber(value) { const requested = Number(value); if (!Number.isSafeInteger(requested) || requested < 1) return; pageIndex = requested - 1; render(); }
  });
}

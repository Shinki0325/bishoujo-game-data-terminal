const PAGE_SIZE = 48;

import { createActionIcon } from '../lib/action-icons.js';
import { filterPersonsBySearch } from '../lib/person-search.js';
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

const ROLE_LABELS = Object.freeze({ 'voice-actor': '声优', voice: '声优', scenario: '剧本', artwork: '原画', music: '音乐', unknown: '其他' });
const DIRECTORY_ROLE_ORDER = Object.freeze(['voice-actor', 'scenario', 'artwork', 'music', 'unknown']);
function roleLabel(role) { return ROLE_LABELS[role] ?? role ?? '未分类'; }
function characterRoleLabel(role) {
  return ({ main: '主角', primary: '主角', side: '配角', sub: '配角', appears: '登场', 'メイン': '主角', 'サブ': '配角' })[role] ?? null;
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
  return DIRECTORY_ROLE_ORDER
    .filter(role => role !== 'voice-actor')
    .sort((left, right) => (counts[right] ?? 0) - (counts[left] ?? 0) || DIRECTORY_ROLE_ORDER.indexOf(left) - DIRECTORY_ROLE_ORDER.indexOf(right))[0] ?? 'unknown';
}

function personNameVariantCount(person) {
  if (Number.isSafeInteger(person?.nameVariantCount)) return person.nameVariantCount;
  const variants = Array.isArray(person?.nameVariants) ? person.nameVariants : [];
  if (variants.length > 0) return variants.length;
  return Array.isArray(person?.aliases) ? person.aliases.filter(Boolean).length : 0;
}

export function createPersonDirectoryView({ root, onSearch, onRoleChange, onSelect, onLoadPerson, onOpenWork, onOpenPerson, onOpenCompany, imageUrlForWork, currentYear = new Date().getFullYear() } = {}) {
  if (!root) throw new TypeError('person directory root is required');
  const documentRef = root.ownerDocument;
  const search = root.querySelector('#person-directory-search');
  const list = root.querySelector('#person-directory-list');
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
  let filtered = [];
  let selectedId = null;
  let pageIndex = 0;
  let roleFilter = 'all';
  let activityBounds = resolvePersonActivityBounds([], currentYear);
  let suppliedActivityBounds = null;

  function filteredModel() { return roleFilter === 'all' ? model : model.filter(person => directoryRole(person) === roleFilter); }
  function isVoiceActor(person) { return Number(person?.roles?.['voice-actor'] ?? person?.roles?.voice ?? 0) > 0; }
  function renderRoleTabCounts() {
    for (const tab of roleTabs) {
      const key = tab.dataset.personRole ?? 'all';
      const label = tab.dataset.baseLabel ?? tab.textContent.replace(/\s*[0-9,]+\s*$/u, '').trim();
      tab.dataset.baseLabel = label;
      const amount = key === 'all' ? model.length : model.filter(person => directoryRole(person) === key).length;
      tab.textContent = `${label} ${new Intl.NumberFormat('zh-CN').format(amount)}`;
    }
  }
  function showDialog() { if (typeof dialog?.showModal === 'function' && !dialog.open) dialog.showModal(); else if (dialog) dialog.open = true; }

  function renderDetail(person) {
    if (!person || !detailBody) return;
    const voiceActor = isVoiceActor(person);
    const primaryRole = Object.entries(person.roles ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    detailTitle.textContent = person.displayName || person.canonicalName || '未命名人物';
    if (detailPrimaryRole) detailPrimaryRole.textContent = roleLabel(primaryRole);
    detailMeta.textContent = `作品 ${new Intl.NumberFormat('zh-CN').format(person.workCount ?? 0)} · 名义 ${new Intl.NumberFormat('zh-CN').format(personNameVariantCount(person))}`;
    detailBody.replaceChildren();
    const layout = node(documentRef, 'div', 'person-detail-layout');
    const identity = node(documentRef, 'aside', 'person-detail-identity');
    if (voiceActor) {
      const representative = node(documentRef, 'section', 'person-detail-block person-detail-representative');
      const heading = node(documentRef, 'div', 'person-detail-block-heading');
      heading.append(node(documentRef, 'h3', '', '代表角色'));
      representative.append(heading);
      const list = node(documentRef, 'div', 'person-representative-list');
      const characters = Array.isArray(person.representativeCharacters) ? person.representativeCharacters : [];
      for (const character of characters) {
        const item = node(documentRef, 'div', 'person-representative-item');
        item.title = character.name || '未命名角色';
        const image = character.imageUrl ? node(documentRef, 'img', 'person-representative-image') : null;
        if (image) { image.src = character.imageUrl; image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => { image.hidden = true; }, { once: true }); item.append(image); }
        const role = characterRoleLabel(character.role);
        item.append(node(documentRef, 'strong', '', character.name || '未命名角色'), node(documentRef, 'span', 'person-character-role', role || '登场'));
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
        item.disabled = !work.workId;
        item.setAttribute('aria-label', `打开作品 ${work.title || work.workId || '详情'}`);
        item.title = work.title || '';
        const image = node(documentRef, 'img', 'person-representative-work-image');
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        if (work.imageUrl) {
          image.src = work.imageUrl;
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
    for (const variant of (person.nameVariants?.length ? person.nameVariants : person.aliases ?? [])) aliases.append(node(documentRef, 'span', 'person-alias-chip', variant.name ?? variant));
    if (!aliases.children.length) aliases.append(node(documentRef, 'span', 'person-detail-muted', '暂无其他名义'));
    identity.append(aliases);

    const content = node(documentRef, 'section', 'person-detail-content');
    const pageTabs = node(documentRef, 'nav', 'person-detail-page-tabs');
    pageTabs.id = 'person-detail-page-tabs';
    pageTabs.setAttribute('aria-label', '人物详情分页');
    const overviewButton = node(documentRef, 'button', 'person-detail-page-tab is-active', '共演关系');
    overviewButton.type = 'button'; overviewButton.id = 'person-detail-tab-overview'; overviewButton.dataset.personDetailPage = 'overview'; overviewButton.setAttribute('role', 'tab'); overviewButton.setAttribute('aria-selected', 'true'); overviewButton.setAttribute('aria-pressed', 'true'); overviewButton.setAttribute('aria-controls', 'person-detail-panel-overview'); overviewButton.tabIndex = 0;
    const timelineButton = node(documentRef, 'button', 'person-detail-page-tab', '作品年表');
    timelineButton.type = 'button'; timelineButton.id = 'person-detail-tab-timeline'; timelineButton.dataset.personDetailPage = 'timeline'; timelineButton.setAttribute('role', 'tab'); timelineButton.setAttribute('aria-selected', 'false'); timelineButton.setAttribute('aria-pressed', 'false'); timelineButton.setAttribute('aria-controls', 'person-detail-panel-timeline'); timelineButton.tabIndex = -1;
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
      const row = node(documentRef, 'button', 'person-company-row'); row.type = 'button'; row.dataset.companyId = company.companyId;
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
      const row = node(documentRef, 'button', 'person-co-row'); row.type = 'button'; row.dataset.personId = actor.personId;
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
    const timelineTools = node(documentRef, 'div', 'person-detail-sort-tools');
    const timelineSort = node(documentRef, 'select', 'person-detail-sort');
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
    const timelineSortState = { key: 'releaseDate', direction: 'desc' };
    const updateTimelineControls = () => {
      timelineSort.value = timelineSortState.key;
      const ascending = timelineSortState.direction === 'asc';
      timelineDirection.setAttribute('aria-pressed', String(ascending));
      timelineDirection.setAttribute('aria-label', `作品年表排序：${ascending ? '升序' : '降序'}，点击切换`);
      timelineDirection.title = `作品年表排序：${ascending ? '升序' : '降序'}，点击切换`;
      timelineDirection.replaceChildren(createActionIcon(documentRef, ascending ? 'arrow-up-a-z' : 'arrow-down-a-z'));
    };
    timelineTools.append(timelineSort, timelineDirection);
    worksHeading.append(timelineTools);
    worksBlock.append(worksHeading);
    const workList = node(documentRef, 'div', 'person-detail-works');
    const workForCredit = credit => credit.work ?? credit;
    const TIMELINE_BATCH_SIZE = 48;
    let timelineCredits = [];
    let timelineRenderedCount = 0;
    const sortedCredits = () => [...(person.credits ?? [])].sort((a, b) => {
      const aw = workForCredit(a); const bw = workForCredit(b);
      const key = timelineSortState.key;
      const av = key === 'releaseDate' ? (a.releaseDate ?? aw.releaseDate ?? '') : aw[key];
      const bv = key === 'releaseDate' ? (b.releaseDate ?? bw.releaseDate ?? '') : bw[key];
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
      const row = node(documentRef, 'button', 'person-work-row'); row.type = 'button'; row.dataset.workId = credit.workId ?? ''; row.disabled = !credit.workId;
      row.setAttribute('aria-setsize', String(timelineCredits.length));
      row.setAttribute('aria-posinset', String(index + 1));
      row.setAttribute('aria-label', `打开作品 ${credit.displayTitle ?? credit.title ?? '未命名作品'}`);
      const thumb = node(documentRef, 'span', 'person-work-thumb');
      const imageSource = typeof imageUrlForWork === 'function' ? imageUrlForWork(credit) : null;
      const thumbnailUrl = typeof imageSource === 'string' ? imageSource : imageSource?.thumbnailUrl;
      if (thumbnailUrl) {
        const image = node(documentRef, 'img');
        image.src = thumbnailUrl;
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => { image.hidden = true; thumb.textContent = '▧'; }, { once: true });
        thumb.append(image);
      } else {
        thumb.textContent = '▧';
      }
      const copy = node(documentRef, 'span', 'person-work-copy');
      const characterRole = credit.creditType === 'character-voiced-by' ? characterRoleLabel(credit.characterRole) : null;
      copy.append(node(documentRef, 'strong', 'person-work-title', credit.displayTitle ?? credit.title ?? '未命名作品'));
      if (credit.creditType === 'character-voiced-by') {
        const roleClass = ['主角'].includes(characterRole) ? 'is-main' : ['配角'].includes(characterRole) ? 'is-side' : 'is-appears';
        const characterLine = node(documentRef, 'span', 'person-work-character');
        characterLine.append(node(documentRef, 'span', '', `饰演：${credit.characterName || '角色待解析'} `), node(documentRef, 'span', `person-character-role ${roleClass}`, characterRole || '登场'));
        copy.append(characterLine);
      }
      const meta = node(documentRef, 'span', 'person-work-meta', `${roleLabel(credit.creditType === 'character-voiced-by' ? 'voice-actor' : credit.roleCode)} · ${credit.releaseDate ?? '日期未知'}`);
      meta.title = meta.textContent;
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
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); pageIndex = Math.min(pageIndex, totalPages - 1);
    renderRoleTabCounts();
    if (representativeHeading) representativeHeading.textContent = roleFilter === 'voice-actor'
      ? '代表角色'
      : roleFilter === 'all' ? '代表角色/作品' : '代表作品';
    count.textContent = new Intl.NumberFormat('zh-CN').format(filtered.length); page.textContent = String(pageIndex + 1); total.textContent = String(totalPages);
    previous.disabled = pageIndex === 0; next.disabled = pageIndex >= totalPages - 1; list.replaceChildren();
    const visible = filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE); empty.hidden = visible.length !== 0;
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
        for (const character of (person.representativeCharacters ?? []).slice(0, 3)) {
          if (!character.imageUrl) continue;
          const image = node(documentRef, 'img', 'person-directory-character-image');
          image.src = character.imageUrl; image.alt = ''; image.title = character.name || ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          image.addEventListener('error', () => { image.remove(); }, { once: true });
          faces.append(image);
        }
      } else {
        for (const work of (person.representativeWorks ?? []).slice(0, 3)) {
          const image = node(documentRef, 'img', 'person-directory-work-image');
          image.alt = ''; image.title = work.title || ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
          if (work.imageUrl) {
            image.src = work.imageUrl;
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
      row.addEventListener('click', async () => {
        selectedId = person.entityId;
        onSelect?.(person.entityId);
        showDialog();
        let detail = person;
        try { detail = await onLoadPerson?.(person.entityId, person) ?? person; } catch { /* keep the summary visible */ }
        if (selectedId !== person.entityId) return;
        renderDetail(detail);
      }); list.append(row);
    }
  }

  search?.addEventListener('input', () => { pageIndex = 0; onSearch?.(search.value); });
  previous?.addEventListener('click', () => { pageIndex = Math.max(0, pageIndex - 1); render(); });
  next?.addEventListener('click', () => { pageIndex += 1; render(); });
  close?.addEventListener('click', () => onSelect?.(null));
  roleTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => { roleFilter = tab.dataset.personRole ?? 'all'; roleTabs.forEach(item => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); item.setAttribute('aria-pressed', String(active)); item.tabIndex = active ? 0 : -1; }); pageIndex = 0; render(); onRoleChange?.(roleFilter); });
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const targetIndex = event.key === 'Home' ? 0 : event.key === 'End' ? roleTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + roleTabs.length) % roleTabs.length;
      roleTabs[targetIndex].click(); roleTabs[targetIndex].focus();
    });
  });

  return Object.freeze({
    render({ persons = [], selectedPersonId = null, activityAxis: nextActivityAxis = null } = {}) {
      model = Array.isArray(persons) ? persons : [];
      suppliedActivityBounds = normalizePersonActivityBounds(nextActivityAxis);
      selectedId = selectedPersonId;
      render();
      if (selectedId) {
        const person = model.find(item => item.entityId === selectedId);
        if (person) {
          showDialog();
          Promise.resolve(onLoadPerson?.(person.entityId, person)).catch(() => null).then(detail => {
            if (selectedId === person.entityId) renderDetail(detail ?? person);
          });
        }
      }
    },
    setPersons(persons) { model = Array.isArray(persons) ? persons : []; pageIndex = 0; render(); },
    setSelected(personId) {
      selectedId = personId;
      const person = model.find(item => item.entityId === personId);
      if (!person) return;
      showDialog();
      Promise.resolve(onLoadPerson?.(person.entityId, person)).catch(() => null).then(detail => {
        if (selectedId === person.entityId) renderDetail(detail ?? person);
      });
    },
    setRoleFilter(role = 'all') { roleFilter = roleTabs.some(tab => tab.dataset.personRole === role) ? role : 'all'; roleTabs.forEach(tab => { const active = tab.dataset.personRole === roleFilter; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); tab.setAttribute('aria-pressed', String(active)); tab.tabIndex = active ? 0 : -1; }); pageIndex = 0; render(); },
    filter(query = '') {
      return filterPersonsBySearch(model, query);
    },
    getPageNumber() { return pageIndex + 1; }
  });
}

const PAGE_SIZE = 48;

function node(documentRef, tag, className = '', text = '') {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = String(text);
  return element;
}

const ROLE_LABELS = Object.freeze({ 'voice-actor': '声优', scenario: '剧本', artwork: '原画', music: '音乐' });
function roleLabel(role) { return ROLE_LABELS[role] ?? role ?? '未分类'; }
function personInitial(person) { const name = String(person?.canonicalName ?? '').trim(); return name ? name.slice(0, 1) : '?'; }

export function createPersonDirectoryView({ root, onSearch, onSelect, onOpenWork, onOpenPerson, imageUrlForWork } = {}) {
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
  const dialog = documentRef.querySelector('#person-detail-dialog');
  const detailTitle = documentRef.querySelector('#person-detail-title');
  const detailMeta = documentRef.querySelector('#person-detail-meta');
  const detailBody = documentRef.querySelector('#person-detail-body');
  const close = documentRef.querySelector('#person-detail-close');
  const roleTabs = [...root.querySelectorAll('[data-person-role]')];
  let model = [];
  let filtered = [];
  let selectedId = null;
  let pageIndex = 0;
  let roleFilter = 'all';

  function filteredModel() { return roleFilter === 'all' ? model : model.filter(person => Number(person.roles?.[roleFilter] ?? 0) > 0); }
  function showDialog() { if (typeof dialog?.showModal === 'function' && !dialog.open) dialog.showModal(); else if (dialog) dialog.open = true; }

  function renderDetail(person) {
    if (!person || !detailBody) return;
    detailTitle.textContent = person.canonicalName || '未命名人物';
    detailMeta.textContent = `${person.sourceRefs?.map(ref => `${ref.source}:${ref.id}`).join(' · ') || '来源 ID 未投影'} · source-only / review`;
    detailBody.replaceChildren();
    const layout = node(documentRef, 'div', 'person-detail-layout');
    const identity = node(documentRef, 'aside', 'person-detail-identity');
    identity.append(node(documentRef, 'div', 'person-detail-avatar', personInitial(person)));
    const roles = node(documentRef, 'div', 'person-detail-role-chips');
    for (const [role, value] of Object.entries(person.roles ?? {})) roles.append(node(documentRef, 'span', 'person-role-chip', `${roleLabel(role)} · ${value}`));
    identity.append(roles, node(documentRef, 'h3', 'person-detail-section-title', '名义'));
    const aliases = node(documentRef, 'div', 'person-detail-aliases');
    for (const variant of (person.nameVariants?.length ? person.nameVariants : person.aliases ?? [])) aliases.append(node(documentRef, 'span', `person-alias-chip${variant.isMain ? ' is-main' : ''}`, variant.name ?? variant));
    identity.append(aliases);

    const content = node(documentRef, 'section', 'person-detail-content');
    const stats = node(documentRef, 'div', 'person-detail-stats');
    for (const [label, value] of [['作品关系', person.workCount], ['名义数量', person.nameVariants?.length ?? person.aliases?.length ?? 0], ['活动跨度', person.spanLabel ?? '日期未知']]) {
      const stat = node(documentRef, 'div', 'person-detail-stat');
      stat.append(node(documentRef, 'span', 'person-detail-stat-label', label), node(documentRef, 'strong', 'person-detail-stat-value', value)); stats.append(stat);
    }
    content.append(stats);

    const activity = node(documentRef, 'section', 'person-detail-block');
    const activityHeading = node(documentRef, 'div', 'person-detail-block-heading');
    activityHeading.append(node(documentRef, 'h3', '', '出演频率'), node(documentRef, 'span', 'person-detail-muted', person.spanLabel ?? '日期未知'));
    activity.append(activityHeading);
    const bars = node(documentRef, 'div', 'person-frequency');
    for (const value of person.activity ?? []) { const bar = node(documentRef, 'i', 'person-frequency-bar'); bar.style.height = `${Math.max(8, Number(value) || 0)}%`; bars.append(bar); }
    activity.append(bars); content.append(activity);

    const coBlock = node(documentRef, 'section', 'person-detail-block');
    const coHeading = node(documentRef, 'div', 'person-detail-block-heading');
    coHeading.append(node(documentRef, 'h3', '', '共演关系'), node(documentRef, 'span', 'person-detail-muted', `${person.coActors?.length ?? 0} 位`)); coBlock.append(coHeading);
    const coList = node(documentRef, 'div', 'person-co-list');
    for (const actor of (person.coActors ?? []).slice(0, 8)) {
      const row = node(documentRef, 'button', 'person-co-row'); row.type = 'button'; row.dataset.personId = actor.personId;
      row.append(node(documentRef, 'span', 'person-co-name', actor.name), node(documentRef, 'strong', '', actor.count), node(documentRef, 'span', 'person-detail-muted', '共同作品'));
      row.addEventListener('click', () => onOpenPerson?.(actor.personId)); coList.append(row);
    }
    if (!coList.children.length) coList.append(node(documentRef, 'span', 'person-detail-muted', '暂无共演关系'));
    coBlock.append(coList); content.append(coBlock);

    const worksBlock = node(documentRef, 'section', 'person-detail-block person-detail-works-block');
    const worksHeading = node(documentRef, 'div', 'person-detail-block-heading');
    worksHeading.append(node(documentRef, 'h3', '', '作品关系'), node(documentRef, 'span', 'person-detail-muted', '按日期倒序')); worksBlock.append(worksHeading);
    const workList = node(documentRef, 'div', 'person-detail-works');
    for (const credit of (person.credits ?? []).slice(0, 18)) {
      const row = node(documentRef, 'button', 'person-work-row'); row.type = 'button'; row.dataset.workId = credit.workId ?? ''; row.disabled = !credit.workId;
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
      copy.append(node(documentRef, 'strong', 'person-work-title', credit.displayTitle ?? credit.title ?? '未命名作品'), node(documentRef, 'span', 'person-work-meta', `${roleLabel(credit.roleCode)} · ${credit.releaseDate ?? '日期未知'}`));
      row.append(thumb, copy); row.addEventListener('click', () => credit.workId && onOpenWork?.(credit.workId)); workList.append(row);
    }
    if (!workList.children.length) workList.append(node(documentRef, 'span', 'person-detail-muted', '暂无可解析作品关系'));
    worksBlock.append(workList); content.append(worksBlock); layout.append(identity, content); detailBody.append(layout);
  }

  function render() {
    filtered = filteredModel();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); pageIndex = Math.min(pageIndex, totalPages - 1);
    count.textContent = new Intl.NumberFormat('zh-CN').format(filtered.length); page.textContent = String(pageIndex + 1); total.textContent = String(totalPages);
    previous.disabled = pageIndex === 0; next.disabled = pageIndex >= totalPages - 1; list.replaceChildren();
    const visible = filtered.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE); empty.hidden = visible.length !== 0;
    for (const person of visible) {
      const row = node(documentRef, 'button', 'person-directory-row'); row.type = 'button'; row.dataset.personId = person.entityId;
      const faces = node(documentRef, 'span', 'person-directory-faces'); faces.append(node(documentRef, 'span', 'person-directory-avatar', personInitial(person)));
      const cell = node(documentRef, 'span', 'person-directory-person'); cell.append(node(documentRef, 'strong', 'person-directory-name', person.canonicalName || '未命名人物'));
      const sub = node(documentRef, 'span', 'person-directory-sub'); sub.append(node(documentRef, 'span', 'person-id-box', person.sourceRefs?.map(ref => `${ref.source}:${ref.id}`).join(' · ') || '来源 ID 未投影'), node(documentRef, 'span', 'person-directory-counts', `作品 ${person.workCount} · 名义 ${person.nameVariants?.length ?? person.aliases?.length ?? 0}`)); cell.append(sub);
      const primaryRole = Object.entries(person.roles ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
      const activity = node(documentRef, 'span', 'person-directory-activity'); for (const value of person.activity ?? []) { const bar = node(documentRef, 'i'); bar.style.height = `${Math.max(8, Number(value) || 0)}%`; activity.append(bar); }
      row.append(faces, cell, node(documentRef, 'span', 'person-directory-role', roleLabel(primaryRole)), activity, node(documentRef, 'span', 'person-directory-span', person.spanLabel ?? '日期未知'));
      row.addEventListener('click', () => { selectedId = person.entityId; renderDetail(person); onSelect?.(person.entityId); showDialog(); }); list.append(row);
    }
  }

  search?.addEventListener('input', () => { pageIndex = 0; onSearch?.(search.value); });
  previous?.addEventListener('click', () => { pageIndex = Math.max(0, pageIndex - 1); render(); });
  next?.addEventListener('click', () => { pageIndex += 1; render(); });
  close?.addEventListener('click', () => onSelect?.(null));
  roleTabs.forEach(tab => tab.addEventListener('click', () => { roleFilter = tab.dataset.personRole ?? 'all'; roleTabs.forEach(item => { item.classList.toggle('is-active', item === tab); item.setAttribute('aria-selected', String(item === tab)); }); pageIndex = 0; render(); }));

  return Object.freeze({
    render({ persons = [], selectedPersonId = null } = {}) { model = Array.isArray(persons) ? persons : []; selectedId = selectedPersonId; render(); if (selectedId) { const person = model.find(item => item.entityId === selectedId); if (person) { renderDetail(person); showDialog(); } } },
    setPersons(persons) { model = Array.isArray(persons) ? persons : []; pageIndex = 0; render(); },
    setSelected(personId) { selectedId = personId; const person = model.find(item => item.entityId === personId); if (person) { renderDetail(person); showDialog(); } },
    filter(query = '') { const needle = String(query).trim().toLocaleLowerCase(); return model.filter(person => [person.canonicalName, ...(person.aliases ?? []), ...(person.nameVariants ?? []).map(item => item.name)].join(' ').toLocaleLowerCase().includes(needle)); },
    getPageNumber() { return pageIndex + 1; }
  });
}

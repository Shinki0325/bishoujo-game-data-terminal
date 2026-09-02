const PAGE_SIZE = 48;

function el(documentRef, tag, className, text = '') {
  const node = documentRef.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = String(text);
  return node;
}

export function createPersonDirectoryView({ root, onSearch, onSelect, onOpenWork } = {}) {
  if (!root) throw new TypeError('person directory root is required');
  const documentRef = root.ownerDocument;
  const search = root.querySelector('#person-directory-search');
  const list = root.querySelector('#person-directory-list');
  const detail = root.querySelector('#person-directory-detail');
  const detailTitle = root.querySelector('#person-detail-title');
  const detailMeta = root.querySelector('#person-detail-meta');
  const detailCredits = root.querySelector('#person-detail-credits');
  const empty = root.querySelector('#person-directory-empty');
  const count = root.querySelector('#person-directory-count');
  const previous = root.querySelector('#person-page-previous');
  const next = root.querySelector('#person-page-next');
  const page = root.querySelector('#person-page-number');
  const total = root.querySelector('#person-page-total');
  const close = root.querySelector('#person-detail-close');
  let model = [];
  let selectedId = null;
  let pageIndex = 0;
  search?.addEventListener('input', () => onSearch?.(search.value));
  previous?.addEventListener('click', () => { pageIndex = Math.max(0, pageIndex - 1); render(); });
  next?.addEventListener('click', () => { pageIndex += 1; render(); });
  close?.addEventListener('click', () => onSelect?.(null));

  function renderCard(person) {
    const card = el(documentRef, 'article', 'person-directory-card');
    card.dataset.personId = person.entityId;
    const button = el(documentRef, 'button', 'person-directory-card-button');
    button.type = 'button';
    button.setAttribute('aria-label', `打开人物 ${person.canonicalName}`);
    button.append(
      el(documentRef, 'strong', 'person-directory-card-name', person.canonicalName || '未命名人物'),
      el(documentRef, 'span', 'person-directory-card-meta', `${person.credits.length} 条作品关系 · ${person.confidence} · source-only`)
    );
    button.addEventListener('click', () => onSelect?.(person.entityId));
    card.append(button);
    return card;
  }

  function render() {
    const totalPages = Math.max(1, Math.ceil(model.length / PAGE_SIZE));
    pageIndex = Math.min(pageIndex, totalPages - 1);
    count.textContent = new Intl.NumberFormat('zh-CN').format(model.length);
    total.textContent = String(totalPages);
    page.textContent = String(pageIndex + 1);
    previous.disabled = pageIndex === 0;
    next.disabled = pageIndex >= totalPages - 1;
    list.replaceChildren();
    const visible = model.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
    empty.hidden = visible.length !== 0;
    visible.forEach(person => list.append(renderCard(person)));
    const selected = model.find(person => person.entityId === selectedId) ?? null;
    detail.hidden = selected === null;
    if (!selected) return;
    detailTitle.textContent = selected.canonicalName || '未命名人物';
    detailMeta.textContent = `${selected.credits.length} 条作品关系 · ${selected.status} · ${selected.visibility} · ${selected.confidence}`;
    detailCredits.replaceChildren();
    if (selected.aliases.length) detailCredits.append(el(documentRef, 'p', 'person-detail-aliases', `别名：${selected.aliases.join('、')}`));
    for (const credit of selected.credits) {
      const row = el(documentRef, 'button', 'person-detail-credit');
      row.type = 'button';
      row.disabled = !credit.workId;
      row.append(el(documentRef, 'strong', 'person-detail-credit-title', credit.title), el(documentRef, 'span', 'person-detail-credit-meta', `${credit.roleCode} · ${credit.status} · ${credit.workId ? `作品 #${credit.workId}` : '未解析作品'}`));
      row.addEventListener('click', () => credit.workId && onOpenWork?.(credit.workId));
      detailCredits.append(row);
    }
  }

  return Object.freeze({
    render({ persons = [], selectedPersonId = null } = {}) {
      model = Array.isArray(persons) ? persons : [];
      selectedId = selectedPersonId;
      render();
    },
    setSelected(personId) { selectedId = personId; render(); },
    resetPage() { pageIndex = 0; render(); }
  });
}


import { formatReleaseDate, releaseDateSortCompare, releaseStatusLabel } from '../lib/work-release-date.js';

function node(doc, tag, className, text) {
  const element = doc.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createWorkVersionView({ elements, documentRef: doc, familyForWork, onSelectWork }) {
  const toggle = elements.detailsVersionToggle, shelf = elements.detailsVersionShelf;
  const list = elements.detailsVersionList, current = elements.detailsVersionCurrent;
  const bar = node(doc, 'div', 'details-version-bar');
  const heading = toggle.closest('.dialog-heading');
  heading.after(bar);
  bar.append(current, toggle);
  bar.after(shelf);
  shelf.setAttribute('aria-label', '切换作品版本');
  toggle.setAttribute('aria-controls', shelf.id);
  const tools = node(doc, 'div', 'details-version-tools');
  const search = node(doc, 'input', 'details-version-search');
  search.type = 'search'; search.placeholder = '搜索版本名称、平台或年份';
  search.setAttribute('aria-label', '搜索版本');
  const reset = node(doc, 'button', 'details-version-reset', '查看作品库默认版本');
  reset.type = 'button';
  const hint = node(doc, 'p', 'details-version-hint', '选择后查看该版本资料；“作品库默认”指总览的默认入口。');
  const status = node(doc, 'p', 'details-version-status');
  status.setAttribute('role', 'status'); status.hidden = true;
  tools.append(search, reset); shelf.prepend(tools, hint); shelf.append(status);
  let work = null, family = null, expanded = false, pending = null, error = '';
  function setExpanded(value, {focus = false} = {}) {
    expanded = value; shelf.hidden = !expanded;
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = `${expanded ? '收起版本' : '切换版本'} · ${family?.members.length ?? 0}`;
    if (!value) search.value = '';
    if (focus) toggle.focus({preventScroll:true});
    if (value) drawList();
  }
  function drawList() {
    const query = search.value.normalize('NFKC').trim().toLocaleLowerCase();
    const groups = new Map();
    const members = [...family.members].sort((a, b) => releaseDateSortCompare(a.releaseDate, b.releaseDate) || a.platform.localeCompare(b.platform) || a.workId.localeCompare(b.workId));
    for (const member of members) {
      if (query && !`${member.title} ${member.platform} ${member.releaseDate} ${formatReleaseDate(member.releaseDate)} ${releaseStatusLabel(member.releaseDate)}`.normalize('NFKC').toLocaleLowerCase().includes(query)) continue;
      const key = member.title.normalize('NFKC').trim().toLocaleLowerCase();
      if (!groups.has(key)) groups.set(key, {title:member.title, members:[]});
      groups.get(key).members.push(member);
    }
    list.replaceChildren(); list.setAttribute('aria-busy', String(Boolean(pending)));
    for (const group of groups.values()) {
      const section = node(doc, 'section', 'details-version-group');
      section.append(node(doc, 'h3', '', group.title));
      for (const member of group.members) {
        const active = String(member.workId) === String(work.workId);
        const row = node(doc, 'button', 'details-version-row'); row.type = 'button';
        row.dataset.workId = member.workId; row.disabled = Boolean(pending);
        row.setAttribute('aria-current', String(active));
        row.setAttribute('aria-label', `${member.title}，${member.platform}，${formatReleaseDate(member.releaseDate)}${active ? '，正在查看' : ''}`);
        row.append(node(doc, 'span', 'details-version-platform', member.platform), node(doc, 'span', 'details-version-date', formatReleaseDate(member.releaseDate)));
        const badges = node(doc, 'span', 'details-version-badges');
        if (member.default) badges.append(node(doc, 'span', 'details-version-default', '作品库默认'));
        badges.append(node(doc, 'span', 'details-version-action', pending === member.workId ? '正在切换…' : active ? '正在查看' : '查看此版本'));
        row.append(badges); row.addEventListener('click', () => { void choose(member.workId); });
        section.append(row);
      }
      list.append(section);
    }
    if (!groups.size) list.append(node(doc, 'p', 'details-version-empty', '没有匹配的版本，请换个关键词。'));
    reset.hidden = String(work.workId) === String(family.defaultWorkId);
    reset.disabled = Boolean(pending);
    status.hidden = !pending && !error;
    status.textContent = pending ? '正在加载所选版本…' : error;
  }
  async function choose(id) {
    if (pending || String(id) === String(work.workId)) return;
    const previous = work.workId; pending = id; error = ''; drawList();
    try { await onSelectWork(id); } catch { /* Keep the current edition available for retry. */ }
    if (work.workId === previous && pending === id) {
      pending = null; error = '版本未能切换，请重试。'; drawList();
    }
  }
  toggle.addEventListener('click', () => setExpanded(!expanded));
  search.addEventListener('input', drawList);
  reset.addEventListener('click', () => { void choose(family.defaultWorkId); });
  heading.closest('dialog').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault(); event.stopPropagation(); setExpanded(false, {focus:true});
  });
  function render(next, {keepExpanded = true} = {}) {
    const changed = work && String(work.workId) !== String(next.workId);
    const selected = pending && String(pending) === String(next.workId);
    work = next; family = familyForWork(next.workId);
    bar.hidden = family === null; shelf.hidden = true;
    if (!family) { pending = null; expanded = false; list.replaceChildren(); return; }
    if (changed || !keepExpanded) { expanded = false; search.value = ''; pending = null; error = ''; }
    const member = family.members.find(row => String(row.workId) === String(next.workId));
    current.replaceChildren(node(doc, 'span', '', '当前版本'), node(doc, 'strong', '', `${member?.platform ?? ''} · ${formatReleaseDate(member?.releaseDate)}`));
    if (member?.default) current.append(node(doc, 'span', 'details-version-default', '作品库默认'));
    toggle.hidden = false; search.hidden = family.members.length <= 8;
    setExpanded(expanded, {focus:Boolean(selected)});
    if (changed) {
      list.replaceChildren();
      const content = heading.closest('dialog').querySelector('.details-scroll');
      if (content) content.scrollTop = 0;
    }
  }
  return Object.freeze({render});
}

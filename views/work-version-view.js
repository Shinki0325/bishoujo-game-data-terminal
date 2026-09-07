import { createActionIcon } from '../lib/action-icons.js';

export function createWorkVersionView({ elements, documentRef, familyForWork, onSelectWork }) {
  let detailsVersionShelfExpanded = false;
  function render(work, { keepExpanded = true } = {}) {
    if (!keepExpanded) detailsVersionShelfExpanded = false;
    const family = familyForWork(work.workId);
    elements.detailsVersionToggle.hidden = family === null;
    elements.detailsVersionShelf.hidden = family === null || !detailsVersionShelfExpanded;
    elements.detailsVersionList.replaceChildren();
    if (family === null) return;
    elements.detailsVersionToggle.replaceChildren(
      createActionIcon(documentRef, 'layers-2'),
      documentRef.createTextNode(`${family.members.length} 个版本`),
      documentRef.createTextNode(detailsVersionShelfExpanded ? '⌃' : '⌄')
    );
    elements.detailsVersionToggle.setAttribute('aria-expanded', String(detailsVersionShelfExpanded));
    elements.detailsVersionToggle.onclick = () => {
      detailsVersionShelfExpanded = !detailsVersionShelfExpanded;
      render(work);
    };
    elements.detailsVersionCurrent.replaceChildren(
      documentRef.createTextNode('当前版本：'),
      Object.assign(documentRef.createElement('strong'), { textContent: family.members.find(member => member.workId === work.workId)?.label ?? work.title })
    );
    const rows = family.members.map(member => {
      const row = documentRef.createElement('button');
      row.type = 'button';
      row.className = 'details-version-row';
      row.setAttribute('aria-current', String(member.workId === work.workId));
      const radio = documentRef.createElement('span');
      radio.className = 'details-version-radio';
      const copy = documentRef.createElement('span');
      copy.className = 'details-version-copy';
      const label = documentRef.createElement('strong');
      label.textContent = member.label;
      const title = documentRef.createElement('small');
      title.textContent = member.title;
      copy.append(label, title);
      const note = documentRef.createElement('span');
      note.className = 'details-version-default';
      note.textContent = member.default ? '默认' : '';
      row.append(radio, copy, note);
      row.addEventListener('click', () => {
        onSelectWork(member.workId);
      });
      return row;
    });
    elements.detailsVersionList.replaceChildren(...rows);
  }

  return Object.freeze({ render });
}


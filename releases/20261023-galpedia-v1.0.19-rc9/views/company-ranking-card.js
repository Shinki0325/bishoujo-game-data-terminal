export function createCompanyRankingCard(documentRef, companyItem, callbacks) {
  const card = documentRef.createElement('article');
  card.className = 'ranking-card is-company-card';
  card.dataset.workId = companyItem.workId;
  card.draggable = true;
  card.tabIndex = 0;
  card.setAttribute('aria-label', companyItem.title);
  const cover = documentRef.createElement('button');
  cover.type = 'button';
  cover.className = 'ranking-card-cover';
  cover.setAttribute('aria-label', `打开会社 ${companyItem.title}`);
  cover.title = `打开会社 ${companyItem.title}`;
  const image = documentRef.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.draggable = false;
  image.src = companyItem.companyImageUrl ?? '';
  image.addEventListener('error', () => {
    image.hidden = true;
    card.classList.add('is-image-missing');
  }, { once: true });
  cover.append(image);
  const title = documentRef.createElement('span');
  title.className = 'ranking-card-title';
  title.dataset.field = 'title';
  title.textContent = companyItem.title;
  const handle = documentRef.createElement('button');
  handle.type = 'button';
  handle.className = 'ranking-drag-handle';
  handle.setAttribute('aria-label', `整理 ${companyItem.title}`);
  handle.setAttribute('title', `整理 ${companyItem.title}`);
  handle.textContent = '::';
  handle.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
  });
  card.append(cover, title, handle);
  cover.addEventListener('click', event => {
    if (!callbacks.isCardActivationEnabled?.(companyItem)
      || callbacks.shouldSuppressMediaClick?.(companyItem)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    callbacks.onOpenDetails(companyItem);
  });
  const desktopDetails = documentRef.defaultView?.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches ?? true;
  card.addEventListener('contextmenu', event => {
    event.preventDefault();
    if (!desktopDetails || event.pointerType === 'touch') return;
    callbacks.onContextMenu(companyItem, card, event);
  });
  card.addEventListener('dragstart', event => {
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData?.('text/plain', companyItem.workId);
    }
    callbacks.onDragStart(companyItem, card, event);
  });
  card.addEventListener('dragend', event => callbacks.onDragEnd(companyItem, card, event));
  return card;
}

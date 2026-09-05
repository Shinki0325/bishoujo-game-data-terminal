import { createActionIcon } from './action-icons.js';

function assertElement(value, name) {
  if (!value || typeof value.append !== 'function' || typeof value.replaceChildren !== 'function') {
    throw new TypeError(`${name} must be a DOM element`);
  }
}

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function labelFor(documentRef, text) {
  const label = documentRef.createElement('span');
  label.className = 'action-label';
  label.textContent = text;
  return label;
}

function actionButton(documentRef, { className, icon, label, onClick }) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = className;
  button.append(createActionIcon(documentRef, icon));
  if (label !== '') button.append(labelFor(documentRef, label));
  button.addEventListener('click', event => {
    event.stopPropagation();
    onClick();
  });
  return button;
}

export function createMediaPreviewActions({
  documentRef,
  actions,
  viewport,
  confirm,
  onEdit,
  onReplace,
  onRestore
}) {
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new TypeError('documentRef must provide createElement');
  }
  assertElement(actions, 'actions');
  if (!viewport || !Number.isFinite(Number(viewport.width)) || !Number.isFinite(Number(viewport.height))) {
    throw new TypeError('viewport must provide finite width and height');
  }
  assertFunction(onEdit, 'onEdit');
  assertFunction(onReplace, 'onReplace');
  assertFunction(onRestore, 'onRestore');
  assertFunction(confirm, 'confirm');

  let moreButton = null;
  let menu = null;

  function closeMenu() {
    if (!moreButton || !menu) return;
    menu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
  }

  function clear() {
    closeMenu();
    actions.replaceChildren();
    moreButton = null;
    menu = null;
  }

  function menuRect(node) {
    return node?.getBoundingClientRect?.() ?? { left: 0, right: 44, top: 44, width: 160, height: 44 };
  }

  function positionMenu() {
    if (!moreButton || !menu) return;
    const anchor = menuRect(moreButton);
    const measured = menuRect(menu);
    const width = Math.max(1, Number(measured.width) || 160);
    const height = Math.max(1, Number(measured.height) || 44);
    const viewportWidth = Number(viewport.width);
    const viewportHeight = Number(viewport.height);
    const left = Math.min(
      Math.max(8, anchor.right - width),
      Math.max(8, viewportWidth - width - 8)
    );
    const above = anchor.top - height - 6;
    const top = above >= 8
      ? above
      : Math.min(Math.max(8, anchor.bottom + 6), Math.max(8, viewportHeight - height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function toggleMenu() {
    if (!moreButton || !menu) return;
    const opening = menu.hidden;
    closeMenu();
    if (!opening) return;
    menu.hidden = false;
    moreButton.setAttribute('aria-expanded', 'true');
    positionMenu();
  }

  function handleDocumentClick(event) {
    if (!moreButton || !menu || menu.hidden) return;
    if (moreButton.contains(event.target) || menu.contains(event.target)) return;
    closeMenu();
  }

  function handleDocumentKeydown(event) {
    if (event.key === 'Escape') closeMenu();
  }

  documentRef.addEventListener?.('click', handleDocumentClick);
  documentRef.addEventListener?.('keydown', handleDocumentKeydown);

  function render({
    work,
    immersive = false,
    editable = false,
    replaceable = false,
    restorable = false
  } = {}) {
    if (!work || typeof work.workId !== 'string') throw new TypeError('work must provide workId');
    clear();
    if (immersive) return;
    if (editable) {
      actions.append(actionButton(documentRef, {
        className: 'media-preview-action action-primary',
        icon: 'sticker',
        label: '编辑贴纸',
        onClick: () => onEdit(work)
      }));
    }
    if (replaceable) {
      actions.append(actionButton(documentRef, {
        className: 'media-preview-action action-secondary',
        icon: 'image-up',
        label: '替换图片',
        onClick: () => onReplace(work)
      }));
    }
    if (!restorable) return;

    moreButton = actionButton(documentRef, {
      className: 'media-preview-more-button action-neutral icon-button',
      icon: 'ellipsis',
      label: '',
      onClick: toggleMenu
    });
    moreButton.setAttribute('aria-label', '更多图片操作');
    moreButton.setAttribute('title', '更多图片操作');
    moreButton.setAttribute('aria-controls', 'media-preview-more-menu');
    moreButton.setAttribute('aria-expanded', 'false');

    menu = documentRef.createElement('div');
    menu.id = 'media-preview-more-menu';
    menu.className = 'action-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    const restore = actionButton(documentRef, {
      className: 'action-danger',
      icon: 'rotate-ccw',
      label: '恢复原图',
      onClick: () => {
        closeMenu();
        if (!confirm('恢复原图会删除当前图片的本地替换和贴纸编辑，是否继续？')) return;
        onRestore(work);
      }
    });
    restore.setAttribute('role', 'menuitem');
    menu.append(restore);
    actions.append(moreButton, menu);
  }

  return Object.freeze({ render, closeMenu, clear });
}

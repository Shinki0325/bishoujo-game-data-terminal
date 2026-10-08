import { createActionIcon } from './action-icons.js';
import { createPopoverController } from './ui-popover.js';

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
  button.setAttribute('data-ui', className.includes('action-danger') ? 'danger'
    : className.includes('action-primary') ? 'primary'
    : className.includes('action-secondary') ? 'secondary' : 'utility');
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
  windowRef = null,
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
  let popoverController = null;
  const popoverWindow = windowRef ?? documentRef.defaultView ?? (typeof window === 'undefined' ? {
    innerWidth: Number(viewport.width),
    innerHeight: Number(viewport.height),
    addEventListener() {},
    removeEventListener() {}
  } : window);

  function closeMenu() {
    if (popoverController) {
      popoverController.closeAll();
      return;
    }
    if (!moreButton || !menu) return;
    menu.hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
  }

  function clear() {
    closeMenu();
    popoverController?.destroy();
    popoverController = null;
    actions.replaceChildren();
    moreButton = null;
    menu = null;
  }

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
      onClick: () => {}
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
    popoverController = createPopoverController({
      items: [{ button: moreButton, menu, kind: 'actions' }],
      documentRef,
      windowRef: popoverWindow
    });
  }

  function destroy() {
    clear();
  }

  return Object.freeze({ render, closeMenu, clear, destroy });
}

const STATES = new Set(['loading', 'ready', 'empty', 'error', 'info']);
const pending = new WeakMap();
const retryTimers = new WeakMap();

function cancelControl(status, action, layout) {
  const button = status.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'toolbar-button toolbar-button-neutral list-state-cancel';
  button.textContent = layout === 'panel' ? '先看原来的作品' : '取消';
  button.setAttribute('aria-label', '取消这次更新，继续看原来的作品');
  button.addEventListener('click', () => {
    const cancel = pending.get(status)?.cancel ?? action;
    if (typeof cancel === 'function') cancel();
  });
  return button;
}

// Updating a stage preserves both the reveal delay and the running dial.
// Ready results never wait for an animation to finish.
export function setListState({ status, state, message = '', retry = null, retryAt = 0, cancel = null, slowLabel = '', detail = '', layout = 'inline' }) {
  if (!status || typeof status.classList?.toggle !== 'function') throw new TypeError('status must be an element');
  if (!STATES.has(state)) throw new RangeError('unknown list state');
  clearTimeout(retryTimers.get(status));
  retryTimers.delete(status);
  const current = pending.get(status);
  if (state === 'loading' && current?.layout === layout && current.host.parentNode === status) {
    current.ticket.update(message);
    current.cancel = cancel;
    current.slowLabel = slowLabel;
    if (current.detail) current.detail.textContent = current.slow && slowLabel ? slowLabel : detail;
    if (typeof cancel === 'function' && !current.cancelButton) {
      current.cancelButton = cancelControl(status, cancel, layout);
      current.host.append(current.cancelButton);
    }
    if (current.cancelButton) current.cancelButton.hidden = typeof cancel !== 'function';
    return status;
  }
  if (current) {
    clearTimeout(current.slowTimer);
    current.ticket.cancel();
    current.controller.dispose();
    pending.delete(status);
  }
  status.dataset.state = state;
  status.dataset.layout = layout;
  status.hidden = state === 'ready';
  status.textContent = '';
  if (state === 'ready') return status;
  const documentRef = status.ownerDocument;
  const dial = documentRef.defaultView?.GalpediaDial;
  if (state === 'loading' && dial) {
    const panel = layout === 'panel';
    const host = documentRef.createElement('span');
    host.className = panel ? 'gp-loading-view--panel' : 'gp-loading-view--inline';
    status.append(host);
    const controller = dial.createLoadingController({ host, variant: panel ? 'standard' : 'inline', size: panel ? 104 : 20, theme: 'inherit', stacked: panel, delay: 160, slowAfter: panel ? 0 : 8000, slowLabel });
    const item = { host, controller, ticket: controller.begin(message), layout, cancel, slowLabel, slow: false };
    if (panel) {
      const eyebrow = documentRef.createElement('span');
      eyebrow.className = 'keeper-guide-card-eyebrow list-state-eyebrow';
      eyebrow.textContent = '庭守提示';
      host.insertBefore(eyebrow, host.querySelector('.gp-loading-view__label'));
      item.detail = documentRef.createElement('span');
      item.detail.className = 'list-state-detail';
      item.detail.textContent = detail;
      host.append(item.detail);
      item.slowTimer = setTimeout(() => {
        if (pending.get(status) !== item) return;
        item.slow = true;
        if (item.slowLabel) item.detail.textContent = item.slowLabel;
      }, 8000);
    }
    if (typeof cancel === 'function') {
      item.cancelButton = cancelControl(status, cancel, layout);
      host.append(item.cancelButton);
    }
    pending.set(status, item);
    return status;
  }
  const text = documentRef.createElement('span');
  if (layout === 'panel') {
    const eyebrow = documentRef.createElement('span');
    eyebrow.className = 'keeper-guide-card-eyebrow list-state-eyebrow';
    eyebrow.textContent = '庭守提示';
    status.append(eyebrow);
  }
  text.className = 'list-state-message';
  text.textContent = message;
  status.append(text);
  if (detail) {
    const description = documentRef.createElement('span');
    description.className = 'list-state-detail';
    description.textContent = detail;
    status.append(description);
  }
  if ((state === 'loading' || state === 'error') && typeof cancel === 'function') status.append(cancelControl(status, cancel, layout));
  if (state === 'error' && typeof retry === 'function') {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-button toolbar-button-neutral list-state-retry';
    const retryLabel = layout === 'panel' ? '再试一次' : '重试';
    button.textContent = retryLabel;
    button.addEventListener('click', retry);
    status.append(button);
    const wait = Number(retryAt) - Date.now();
    if (wait > 0) {
      button.disabled = true; button.textContent = layout === 'panel' ? '请稍等片刻' : '稍后重试';
      retryTimers.set(status, setTimeout(() => {
        retryTimers.delete(status);
        button.disabled = false; button.textContent = retryLabel;
      }, Math.min(wait, 2147483647)));
    }
  }
  return status;
}

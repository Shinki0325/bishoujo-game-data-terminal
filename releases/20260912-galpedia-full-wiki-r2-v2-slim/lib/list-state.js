const STATES = new Set(['loading', 'ready', 'empty', 'error', 'info']);
const pending = new WeakMap();
const retryTimers = new WeakMap();

// One regional owner reuses the brand dial. Updating its label does not restart
// the reveal delay; settling never holds up a ready result for animation.
export function setListState({ status, state, message = '', retry = null, retryAt = 0 }) {
  if (!status || typeof status.classList?.toggle !== 'function') throw new TypeError('status must be an element');
  if (!STATES.has(state)) throw new RangeError('unknown list state');
  clearTimeout(retryTimers.get(status));
  retryTimers.delete(status);
  const current = pending.get(status);
  if (state === 'loading' && current && current.host.parentNode === status) {
    current.ticket.update(message);
    return status;
  }
  if (current) {
    current.ticket.cancel();
    current.controller.dispose();
    pending.delete(status);
  }
  status.dataset.state = state;
  status.hidden = state === 'ready';
  status.textContent = '';
  if (state === 'ready') return status;
  const documentRef = status.ownerDocument;
  const dial = documentRef.defaultView?.GalpediaDial;
  if (state === 'loading' && dial) {
    const host = documentRef.createElement('span');
    host.className = 'gp-loading-view--inline';
    status.append(host);
    const controller = dial.createLoadingController({ host, variant: 'inline', size: 20, theme: 'inherit', delay: 160, slowAfter: 8000 });
    pending.set(status, { host, controller, ticket: controller.begin(message) });
    return status;
  }
  const text = documentRef.createElement('span');
  text.className = 'list-state-message';
  text.textContent = message;
  status.append(text);
  if (state === 'error' && typeof retry === 'function') {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'toolbar-button toolbar-button-neutral list-state-retry';
    button.textContent = '重试';
    button.addEventListener('click', retry);
    status.append(button);
    const wait = Number(retryAt) - Date.now();
    if (wait > 0) {
      button.disabled = true; button.textContent = '稍后重试';
      retryTimers.set(status, setTimeout(() => {
        retryTimers.delete(status);
        button.disabled = false; button.textContent = '重试';
      }, Math.min(wait, 2147483647)));
    }
  }
  return status;
}

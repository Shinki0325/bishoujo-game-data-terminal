const STATES = new Set(['loading', 'ready', 'empty', 'error']);

export function setListState({ status, state, message = '', retry = null }) {
  if (!status || typeof status.classList?.toggle !== 'function') throw new TypeError('status must be an element');
  if (!STATES.has(state)) throw new RangeError('unknown list state');
  status.dataset.state = state;
  status.hidden = state === 'ready';
  status.textContent = '';
  const documentRef = status.ownerDocument;
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
  }
  return status;
}

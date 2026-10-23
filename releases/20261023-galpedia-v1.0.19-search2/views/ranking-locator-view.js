import {
  RANKING_LOCATOR_DEFAULT_LIMIT,
  buildRankingLocatorEntries,
  searchRankingLocator
} from '../lib/ranking-locator.js';

function assertFunction(value, name) {
  if (typeof value !== 'function') throw new TypeError(`${name} must be a function`);
}

function boolLive(value) {
  return value === true || value === 'live' || value === '直播';
}

function resolveMode(model, options) {
  if (boolLive(options?.mode) || options?.isLive === true) return 'live';
  if (options?.mode === 'ordinary' || options?.mode === 'normal' || options?.isLive === false) return 'ordinary';
  if (boolLive(model?.mode) || boolLive(model?.rankingMode) || model?.isLive === true || model?.live === true) return 'live';
  return 'ordinary';
}

function resolveSubject(model, options) {
  const value = options?.subject ?? options?.rankingSubject ?? model?.subject ?? model?.rankingSubject;
  return value === 'company' || value === '会社' ? 'company' : 'work';
}

function createElement(documentRef, tag, className, content = null) {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (content !== null) element.textContent = content;
  return element;
}

function appendTextLine(documentRef, parent, tag, className, content) {
  const node = createElement(documentRef, tag, className, content);
  parent.append(node);
  return node;
}

/**
 * A small local dialog for finding an item in the full current board.
 * `onLocate` owns the actual scroll/focus positioning in the ranking host.
 */
export function createRankingLocatorView({ documentRef, getModel, onLocate }) {
  if (documentRef === null || typeof documentRef?.createElement !== 'function') {
    throw new TypeError('documentRef must provide createElement');
  }
  assertFunction(getModel, 'getModel');
  assertFunction(onLocate, 'onLocate');

  const host = documentRef.body ?? documentRef.documentElement;
  if (!host || typeof host.append !== 'function') throw new TypeError('documentRef must provide a document host');

  const dialog = createElement(documentRef, 'dialog', 'ranking-locator-dialog');
  dialog.id = 'ranking-locator-dialog';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-hidden', 'true');

  const panel = createElement(documentRef, 'section', 'ranking-locator-panel');
  panel.tabIndex = -1;
  const heading = appendTextLine(documentRef, panel, 'h2', 'ranking-locator-heading', '全榜查找');
  heading.id = `ranking-locator-heading-${Math.random().toString(36).slice(2)}`;
  dialog.setAttribute('aria-labelledby', heading.id);

  const context = createElement(documentRef, 'p', 'ranking-locator-context');
  const form = createElement(documentRef, 'form', 'ranking-locator-form');
  form.noValidate = true;
  const label = createElement(documentRef, 'label', 'ranking-locator-label', '名称或别名');
  const input = createElement(documentRef, 'input', 'ranking-locator-input');
  input.type = 'search';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.placeholder = '输入作品/会社名称或别名';
  input.setAttribute('aria-label', '输入作品或会社名称、别名');
  const clearButton = createElement(documentRef, 'button', 'ranking-locator-clear', '清空');
  clearButton.type = 'button';
  clearButton.setAttribute('aria-label', '清空查找关键词');
  label.append(input);
  form.append(label, clearButton);
  const closeButton = createElement(documentRef, 'button', 'ranking-locator-close', '×');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '关闭全榜查找');
  const resultStatus = createElement(documentRef, 'p', 'ranking-locator-status');
  resultStatus.setAttribute('role', 'status');
  resultStatus.setAttribute('aria-live', 'polite');
  const resultList = createElement(documentRef, 'div', 'ranking-locator-results');
  resultList.setAttribute('role', 'listbox');
  resultList.setAttribute('aria-label', '全榜查找结果');
  const hint = createElement(documentRef, 'p', 'ranking-locator-hint', '↑↓ 选择，Enter 定位，Esc 关闭');
  panel.append(closeButton, context, form, resultStatus, resultList, hint);
  dialog.append(panel);
  host.append(dialog);

  let disposed = false;
  let openState = false;
  let entries = [];
  let activeIndex = -1;
  let previousFocus = null;
  let currentLimit = RANKING_LOCATOR_DEFAULT_LIMIT;

  function setActive(index, { focus = false } = {}) {
    const buttons = [...resultList.querySelectorAll?.('.ranking-locator-result') ?? []];
    if (!buttons.length) {
      activeIndex = -1;
      return;
    }
    activeIndex = Math.max(0, Math.min(buttons.length - 1, index));
    buttons.forEach((button, buttonIndex) => {
      const selected = buttonIndex === activeIndex;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('is-active', selected);
    });
    if (focus) buttons[activeIndex]?.focus?.();
  }

  function choose(entry) {
    if (!entry || disposed) return;
    // Restore the opener before the host focuses the located card. Otherwise
    // close() can steal focus back after the board's locate callback runs.
    close();
    onLocate(entry.workId);
  }

  function renderResults(query = '') {
    const model = getModel();
    const searched = searchRankingLocator(model, query, { limit: currentLimit });
    activeIndex = -1;
    resultList.replaceChildren();
    if (searched.results.length === 0) {
      appendTextLine(documentRef, resultList, 'p', 'ranking-locator-empty', query.trim() ? '没有找到匹配项' : '当前榜单没有可定位的条目');
    } else {
      searched.results.forEach((entry, index) => {
        const button = createElement(documentRef, 'button', 'ranking-locator-result');
        button.type = 'button';
        button.dataset.workId = entry.workId;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-posinset', String(index + 1));
        button.setAttribute('aria-setsize', String(searched.total));
        const copy = createElement(documentRef, 'span', 'ranking-locator-result-copy');
        appendTextLine(documentRef, copy, 'strong', 'ranking-locator-result-title', entry.title);
        const alias = entry.aliases.length > 0
          ? `别名：${entry.aliases.slice(0, 2).join('、')}`
          : '';
        appendTextLine(documentRef, copy, 'small', 'ranking-locator-result-meta', `${entry.locationLabel}${alias ? ` · ${alias}` : ''}`);
        button.append(copy);
        button.addEventListener('click', () => choose(entry));
        button.addEventListener('mouseenter', () => setActive(index));
        button.addEventListener('keydown', event => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(activeIndex + 1, { focus: true });
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(activeIndex - 1, { focus: true });
          } else if (event.key === 'Enter') {
            event.preventDefault();
            choose(entry);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        });
        resultList.append(button);
      });
    }
    if (!query.trim()) {
      resultStatus.textContent = entries.length > currentLimit
        ? `全榜 ${entries.length} 项，仅显示前 ${currentLimit} 项，输入名称或别名开始筛选`
        : `全榜 ${entries.length} 项，输入名称或别名开始筛选`;
    } else if (searched.total === 0) {
      resultStatus.textContent = '没有匹配结果';
    } else if (searched.limited) {
      resultStatus.textContent = `匹配 ${searched.total} 项，仅显示前 ${searched.results.length} 项，请继续输入关键词`;
    } else {
      resultStatus.textContent = `匹配 ${searched.total} 项`;
    }
  }

  function close() {
    if (!openState) return;
    openState = false;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.hidden = true;
    dialog.setAttribute('aria-hidden', 'true');
    dialog.removeAttribute('data-ranking-locator-open');
    input.value = '';
    resultList.replaceChildren();
    resultStatus.textContent = '';
    activeIndex = -1;
    const focusTarget = previousFocus;
    previousFocus = null;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try { focusTarget.focus(); } catch { /* focus target may have been removed */ }
    }
  }

  function open(options = {}) {
    if (disposed) return;
    const model = getModel();
    entries = buildRankingLocatorEntries(model);
    currentLimit = options.limit ?? RANKING_LOCATOR_DEFAULT_LIMIT;
    const mode = resolveMode(model, options);
    const subject = resolveSubject(model, options);
    context.textContent = `${mode === 'live' ? '直播' : '普通'} · ${subject === 'company' ? '会社' : '作品'} · 已排与候选均可定位`;
    if (!openState) previousFocus = documentRef.activeElement;
    dialog.hidden = false;
    if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    else if ('open' in dialog) dialog.open = true;
    dialog.setAttribute('aria-hidden', 'false');
    dialog.dataset.mode = mode;
    dialog.dataset.subject = subject;
    dialog.setAttribute('data-ranking-locator-open', 'true');
    openState = true;
    renderResults('');
    input.focus?.();
  }

  function handleDialogKeydown(event) {
    if (!openState) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.target !== input) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(0, { focus: true });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(resultList.querySelectorAll?.('.ranking-locator-result').length - 1, { focus: true });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = searchRankingLocator(getModel(), input.value, { limit: currentLimit }).results[Math.max(0, activeIndex)];
      choose(entry);
    }
  }

  input.addEventListener('input', () => renderResults(input.value));
  clearButton.addEventListener('click', () => {
    input.value = '';
    renderResults('');
    input.focus?.();
  });
  closeButton.addEventListener('click', close);
  form.addEventListener('submit', event => event.preventDefault());
  dialog.addEventListener('keydown', handleDialogKeydown);
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });

  return Object.freeze({
    open,
    close,
    dispose() {
      if (disposed) return;
      close();
      disposed = true;
      dialog.remove();
    }
  });
}

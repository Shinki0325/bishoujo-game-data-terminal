import {holdWorkIntent} from './work-detail-preparation.js';
// Plain entity links open a detail layer; modified clicks keep native deep links.
export function entityDetailTarget(href, base = location.href) {
  let url, current;
  try { url = new URL(href, base); current = new URL(base); } catch { return null; }
  if (url.origin !== current.origin || url.pathname !== current.pathname || url.search !== current.search) return null;
  const match = /^#(work|works\/work|companies\/company|persons\/person)\/([^/?#]+)(?:\?[^#]*)?$/.exec(url.hash);
  if (!match) return null;
  try { return { kind: match[1].startsWith('companies') ? 'company' : match[1].startsWith('persons') ? 'person' : 'work', id: decodeURIComponent(match[2]) }; } catch { return null; }
}
export function installEntityDetailLinks({ ensureRuntime, beforeOpen = () => {} }) {
  let sequence = 0;
  function feedback(message) {
    let status = document.getElementById('entity-detail-link-status');
    if (!status) { status = document.createElement('p'); status.id = 'entity-detail-link-status'; status.setAttribute('role', 'status'); document.body.append(status); }
    status.textContent = message; status.hidden = !message;
  }
  const cancel = () => { sequence++; feedback(''); };
  window.addEventListener('hashchange', cancel);
  window.addEventListener('popstate', cancel);
  async function open(href, trigger) {
    const target = entityDetailTarget(href);
    if (!target) return false;
    const sourceEntry = trigger?.closest('dialog[data-native-entry]')?.dataset.nativeEntry;
    const sourceLink = trigger?.href;
    const ticket = ++sequence, source = location.href;
    feedback('');
    const timer = setTimeout(() => { if (ticket === sequence) feedback('正在打开详情…'); }, 180);
    trigger?.setAttribute('aria-busy', 'true');
    const releaseIntent=target.kind==='work'&&/^[1-9][0-9]*$/u.test(target.id)?holdWorkIntent(target.id):()=>{};
    try {
      beforeOpen();
      const runtime = await ensureRuntime(target);
      if (ticket !== sequence || location.href !== source) return true;
      if (trigger && !trigger.isConnected) {
        // Loading the full runtime may redraw the same native entry. Preserve
        // that click only when both its source entry and exact link survive.
        // A closed/replaced entry or real navigation still cancels the intent.
        const entry = sourceEntry && [...document.querySelectorAll('dialog[data-native-entry][open]')].find(entry => entry.dataset.nativeEntry === sourceEntry);
        const replacement = entry && [...entry.querySelectorAll('a[href]')].find(link => link.href === sourceLink);
        if (!replacement) return true;
        trigger = replacement;
        trigger.setAttribute('aria-busy', 'true');
      }
      await runtime.openEntityDetail(target.kind, target.id);
      if (ticket === sequence) feedback('');
    } catch {
      if (ticket === sequence) {
        feedback('详情暂时无法打开，请再次点击链接重试。');
      }
    } finally { releaseIntent(); clearTimeout(timer); trigger?.removeAttribute('aria-busy'); }
    return true;
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    // Command search clears its links before navigating. Its own handler
    // passes the href intent without a detached trigger element.
    if (link?.closest('#global-search-results')) return;
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self' || !entityDetailTarget(link.href)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void open(link.href, link);
  }, true);
  return { open, accepts: href => !!entityDetailTarget(href) };
}

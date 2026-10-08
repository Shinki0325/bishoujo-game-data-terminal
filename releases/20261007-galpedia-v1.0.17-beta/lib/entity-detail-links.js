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
    const ticket = ++sequence, source = location.href;
    feedback('');
    const timer = setTimeout(() => { if (ticket === sequence) feedback('正在打开详情…'); }, 180);
    trigger?.setAttribute('aria-busy', 'true');
    try {
      beforeOpen();
      const runtime = await ensureRuntime();
      if (ticket !== sequence || location.href !== source || trigger && !trigger.isConnected) return true;
      await runtime.openEntityDetail(target.kind, target.id);
      if (ticket === sequence) feedback('');
    } catch {
      if (ticket === sequence) {
        feedback('详情暂时无法打开，请再次点击链接重试。');
      }
    } finally { clearTimeout(timer); trigger?.removeAttribute('aria-busy'); }
    return true;
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || link.target && link.target !== '_self' || !entityDetailTarget(link.href)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void open(link.href, link);
  }, true);
  return { open, accepts: href => !!entityDetailTarget(href) };
}

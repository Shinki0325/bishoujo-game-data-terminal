// Browser-only clipboard capability; callers own link generation and feedback.
export function createBrowserClipboard({ navigatorRef, documentRef }) {
  return Object.freeze({ async copy(text) {
    try {
      if (typeof navigatorRef.clipboard?.writeText === 'function') {
        await navigatorRef.clipboard.writeText(text); return true;
      }
    } catch { /* Permission denial falls back to the existing selection path. */ }
    const textarea = documentRef.createElement('textarea');
    textarea.value = text; textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed'; textarea.style.opacity = '0';
    documentRef.body.append(textarea);
    try { textarea.select(); return documentRef.execCommand?.('copy') === true; }
    catch { return false; }
    finally { textarea.remove(); }
  } });
}

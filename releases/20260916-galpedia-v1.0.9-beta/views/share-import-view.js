export function createShareImportView({ elements, openDialog, closeDialog }) {
  return Object.freeze({
    render({ count, missing, ready, error }) {
      elements.message.hidden = error === null;
      elements.message.textContent = error ?? '';
      elements.count.textContent = String(count);
      elements.missing.textContent = String(missing);
      elements.append.disabled = !ready;
      elements.replace.disabled = !ready;
    },
    open: () => openDialog(elements.dialog),
    close: () => closeDialog(elements.dialog)
  });
}

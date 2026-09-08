import { runtimeDiagnostics } from '../lib/runtime-diagnostics.js';
import { CURRENT_GALPEDIA_RELEASE } from '../lib/galpedia-release-notes.js';

// Opt-in, local-only. No persistence or upload; render only sanitized snapshots.
export function mountRuntimeDiagnostics({ documentRef = document, globalRef = window } = {}) {
  if (!runtimeDiagnostics.enabled) return null;
  runtimeDiagnostics.identify({ appVersion: CURRENT_GALPEDIA_RELEASE.version, appRelease: CURRENT_GALPEDIA_RELEASE.releaseId });
  const button = documentRef.createElement('button'), panel = documentRef.createElement('section');
  button.type = 'button'; button.textContent = '本地诊断'; button.id = 'runtime-diagnostics-toggle';
  button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'runtime-diagnostics-panel');
  button.style.cssText = 'position:fixed;right:12px;bottom:76px;z-index:1100;font:13px sans-serif;padding:8px';
  panel.id = 'runtime-diagnostics-panel'; panel.hidden = true;
  panel.setAttribute('aria-label', '本地运行诊断');
  panel.style.cssText = 'position:fixed;right:12px;bottom:118px;z-index:1100;width:min(440px,calc(100vw - 24px));max-height:55vh;overflow:auto;background:#fff;color:#222;padding:12px;border:1px solid #aaa;box-sizing:border-box;font:12px monospace';
  const note = documentRef.createElement('p'), output = documentRef.createElement('pre');
  note.textContent = '仅本地内存；不上传。监听器仅统计已接入生命周期的部分；Worker 内部缓存不在主线程计数中。删除 diagnostics 参数并刷新可停用。runtimeRelease 为配置标签，不代表本地 Git 提交。';
  output.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere';
  panel.append(note, output); documentRef.body.append(button, panel);
  let timer = null;
  const snapshot = () => ({ ...runtimeDiagnostics.snapshot(),
    workspace: ['works','persons','companies','ranking'].includes(globalRef.location.hash.slice(1).split(/[/?]/)[0])
      ? globalRef.location.hash.slice(1).split(/[/?]/)[0] : 'home' });
  const render = () => { output.textContent = JSON.stringify(snapshot(), null, 2); };
  const toggle = () => {
    panel.hidden = !panel.hidden; button.setAttribute('aria-expanded', String(!panel.hidden));
    if (timer !== null) { globalRef.clearInterval(timer); timer = null; }
    if (!panel.hidden) { render(); timer = globalRef.setInterval(render, 1000); }
  };
  button.addEventListener('click', toggle);
  const api = Object.freeze({ snapshot, clear: runtimeDiagnostics.clear });
  globalRef.__galpediaDiagnostics = api;
  const dispose = () => {
    if (timer !== null) globalRef.clearInterval(timer);
    button.removeEventListener('click', toggle); button.remove(); panel.remove();
    globalRef.removeEventListener('pagehide', onPageHide);
    if (globalRef.__galpediaDiagnostics === api) delete globalRef.__galpediaDiagnostics;
  };
  const onPageHide = event => {
    if (!event.persisted) dispose();
    else { if (timer !== null) globalRef.clearInterval(timer); timer = null; panel.hidden = true; button.setAttribute('aria-expanded','false'); }
  };
  globalRef.addEventListener('pagehide', onPageHide);
  return Object.freeze({ dispose });
}

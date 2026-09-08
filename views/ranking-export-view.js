import { createViewLifetime } from '../lib/view-lifetime.js';

export function formatEstimatedPngSize(range) {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return '';
  const unit = range.max >= 1000000 ? 'MB' : 'KB', divisor = unit === 'MB' ? 1000000 : 1000;
  const format = value => unit === 'MB' ? (value / divisor).toFixed(1) : String(Math.ceil(value / divisor));
  return `预计 PNG 大小：约 ${format(range.min)}–${format(range.max)} ${unit}`;
}

// The dialog previews geometry only. Covers are fetched by the existing export job on confirmation.
export function createRankingExportView({ documentRef = document, storage, preview, png, json, isBusy = () => false }) {
  const lifetime = createViewLifetime();
  const dialog = documentRef.getElementById('ranking-export-dialog');
  const quality = dialog.querySelector('[data-ranking-export-quality]');
  const summary = dialog.querySelector('[data-export-summary]');
  const confirm = dialog.querySelector('[data-export-confirm]');
  const retry = dialog.querySelector('[data-export-retry]');
  const key = 'galpedia:ranking-export-quality-v1';
  let generation = 0, returnFocus = null;
  try { quality.value = storage?.getItem(key) === 'high' ? 'high' : 'standard'; } catch { quality.value = 'standard'; }
  async function refresh() {
    const token = ++generation;
    confirm.disabled = true;
    retry.hidden = true;
    summary.textContent = '正在估算尺寸与文件大小…';
    try {
      const result = await preview();
      if (token !== generation || !dialog.open) return;
      const size = formatEstimatedPngSize(result.estimatedBytes);
      summary.textContent = result.rankedCount
        ? `${result.rankedCount} 项 · ${result.width} × ${result.height} 像素 · 每行最多 ${result.columns} 项${size ? `\n${size}` : ''}`
        : '尚未放入等级。先整理榜单，再导出图片。';
      confirm.disabled = !result.rankedCount;
    } catch (error) {
      if (token !== generation || !dialog.open) return;
      const limit = error?.code === 'TIER_ORDER_TOO_LARGE' ? '图片最多导出 200 项，请减少已排榜条目。'
        : ['CANVAS_BUDGET_EXCEEDED', 'UNSAFE_DIMENSIONS'].includes(error?.code) ? '图片尺寸超出浏览器限制，请尝试标准清晰度或减少条目。' : '';
      summary.textContent = limit ? `${limit}榜单未被修改。` : '暂时无法计算导出尺寸，请重试；榜单未被修改。';
      retry.hidden = Boolean(limit);
    }
  }
  function close() { ++generation; if (dialog.open) dialog.close(); returnFocus?.focus?.(); }
  function open(trigger) {
    returnFocus = trigger?.id === 'mobile-ranking-export-png' ? documentRef.getElementById('mobile-ranking-more') : trigger;
    if (!dialog.open) dialog.showModal(); void refresh();
  }
  for (const id of ['ranking-export-options', 'mobile-ranking-export-png', 'ranking-live-export']) {
    const trigger = documentRef.getElementById(id);
    lifetime.listen(trigger, 'click', () => open(trigger));
  }
  lifetime.listen(quality, 'change', () => {
    try { storage?.setItem(key, quality.value); } catch { /* Export still works without persistence. */ }
    void refresh();
  });
  lifetime.listen(dialog.querySelector('[data-export-close]'), 'click', close);
  lifetime.listen(dialog.querySelector('[data-export-retry]'), 'click', () => void refresh());
  lifetime.listen(dialog, 'cancel', event => { event.preventDefault(); close(); });
  lifetime.listen(confirm, 'click', () => {
    if (confirm.disabled) return;
    if (isBusy()) { summary.textContent = '已有导出正在进行，请等待完成后再导出。'; return; }
    close(); void png();
  });
  lifetime.listen(dialog.querySelector('[data-export-json]'), 'click', () => { close(); json(); });
  lifetime.add(() => { ++generation; if (dialog.open) dialog.close(); });
  return Object.freeze({ open, close, dispose: lifetime.dispose });
}

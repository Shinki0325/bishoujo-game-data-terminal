export function pngExportMessage(error, known) {
  if (known) {
    if (error.code === 'COVER_LOAD_FAILED') return '封面加载失败，请检查已排榜作品的本地封面文件。';
    if (error.code === 'TIER_ORDER_TOO_LARGE') return '图片最多导出 200 项，请先减少已排榜条目；当前榜单没有被修改。';
    if (error.code === 'CANVAS_BUDGET_EXCEEDED' || error.code === 'UNSAFE_DIMENSIONS') return '榜单尺寸超出浏览器可安全导出的画布限制，请减少已排榜作品。';
    return `PNG 导出失败（${error.code}），请稍后重试。`;
  }
  return 'PNG 导出失败，请稍后重试。';
}

export function projectPngExport(snapshot) {
  const worksById = snapshot.company ? snapshot.worksById : new Map();
  for (const { id } of snapshot.state.tiers) {
    for (const workId of snapshot.tierOrder[id]) {
      if (!snapshot.company) {
        const work = snapshot.worksById.get(workId);
        if (work) worksById.set(workId, work);
      }
    }
  }
  const high = snapshot.exportQuality === 'high';
  const largestRow = Math.max(1, ...Object.values(snapshot.tierOrder).map(ids => ids.length));
  const classic = snapshot.presentation?.display?.style === 'classic';
  const cardWidth = (snapshot.presentation?.display?.shape === 'landscape' ? 130 : 80) * (snapshot.presentation?.uiScale?.card ?? 100) / 100;
  return { tiers: snapshot.state.tiers, tierOrder: snapshot.tierOrder, worksById, presentation: snapshot.presentation,
    logicalMaxWidth: classic ? Math.max(320, Math.min(2048, Math.round(100 + Math.min(high ? 11 : 8, largestRow) * cardWidth)))
      : 128 + Math.min(high ? 11 : 8, largestRow) * 168, pixelRatio: high ? 2 : 1 };
}

// A cheap content-area heuristic, NOT RGBA memory and NOT an encoded-size promise.
// Photo-rich covers compress much less than the flat board. No image fetch/encode
// is performed merely to open settings; actual bytes are reported after export.
export function estimatePngBytes(plan) {
  const pixels = plan.pixelWidth * plan.pixelHeight;
  if (!Number.isFinite(pixels) || pixels <= 0) return null;
  const ratio = Number(plan.pixelRatio) || 1;
  const items = (plan.tiers ?? []).flatMap(tier => tier.items ?? []);
  const coverPixels = Math.min(pixels, items.reduce((sum, item) => sum + Math.max(0,
    item.width * (item.height - (item.titleStrip?.height ?? 0))) * ratio ** 2, 0));
  const flatPixels = pixels - coverPixels;
  // The interval is intentionally broad: artwork, local uploads and browser PNG
  // encoders differ. It is an estimate, not guaranteed lower/upper bounds.
  return { min: Math.ceil(16000 + coverPixels * .4 + flatPixels * .002),
    max: Math.ceil(32000 + coverPixels * 2.8 + flatPixels * .05) };
}

// One PNG job at a time; it retains the clicked board's snapshot across awaits.
// Existing state controllers still own JSON validation and serialization.
export function createRankingExportController({ isImportBusy, getSubject, getCompanyState,
  exportWorksJson, downloadJson, closeMenus, pngSnapshot, exportPng,
  environment, isPngError, onBusyChange, announce, logError, planPng }) {
  let busy = false;
  function json() {
    if (isImportBusy()) return false;
    closeMenus();
    try {
      if (getSubject() === 'company') {
        const state = getCompanyState();
        const result = downloadJson({ filename: 'company-ranking-v2.json', mimeType: 'application/json;charset=utf-8',
          text: JSON.stringify({ schemaVersion: 2, tiers: state.tiers, selectedCompanyIds: state.selectedCompanyIds, tierOrder: state.tierOrder }, null, 2) });
        announce(`会社排榜 JSON 已导出：${result.filename}`, 'success');
        return result;
      }
      const result = exportWorksJson();
      announce(`JSON 已导出：${result.filename}。${result.omittedCustomCount ? `未包含 ${result.omittedCustomCount} 项本地图片作品。` : ''}标注、替换封面和显示设置仅保留在本机。`, 'success'); return result;
    } catch (error) { announce('JSON 状态导出失败，请稍后重试。', 'error'); logError(error); return false; }
  }
  async function png() {
    if (isImportBusy() || busy) return false;
    const snapshot = pngSnapshot();
    if (snapshot.rankedCount === 0) return false;
    busy = true;
    try {
      onBusyChange();
      const result = await exportPng({ ...projectPngExport(snapshot),
        createCanvas: environment.createCanvas, fontsReady: environment.fontsReady(),
        loadCover: (path, record) => environment.loadCover(path, record, snapshot.company) });
      environment.download(result);
      const size = Number.isFinite(result.blob?.size) ? ` · ${(result.blob.size / 1000000).toFixed(1)} MB` : '';
      const dimensions = result.plan ? ` · ${result.plan.pixelWidth}×${result.plan.pixelHeight}` : '';
      announce(`PNG 已导出：${result.filename}${dimensions}${size}`, 'success'); return result;
    } catch (error) {
      const known = isPngError(error); announce(pngExportMessage(error, known), 'error');
      if (!known) logError(error);
      return false;
    } finally { busy = false; onBusyChange(); }
  }
  async function preview() {
    const snapshot = pngSnapshot();
    if (!snapshot.rankedCount) return { rankedCount: 0 };
    const plan = await planPng(projectPngExport(snapshot));
    return { rankedCount: snapshot.rankedCount, width: plan.pixelWidth, height: plan.pixelHeight, columns: plan.columns,
      estimatedBytes: estimatePngBytes(plan) };
  }
  return Object.freeze({ json, png, preview, get busy() { return busy; } });
}

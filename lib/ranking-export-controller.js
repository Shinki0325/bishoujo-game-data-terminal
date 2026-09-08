export function pngExportMessage(error, known) {
  if (known) {
    if (error.code === 'COVER_LOAD_FAILED') return '封面加载失败，请检查已排榜作品的本地封面文件。';
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
  return { tiers: snapshot.state.tiers, tierOrder: snapshot.tierOrder, worksById, presentation: snapshot.presentation };
}

// One PNG job at a time; it retains the clicked board's snapshot across awaits.
// Existing state controllers still own JSON validation and serialization.
export function createRankingExportController({ isImportBusy, getSubject, getCompanyState,
  exportWorksJson, downloadJson, closeMenus, pngSnapshot, exportPng,
  environment, isPngError, onBusyChange, announce, logError }) {
  let busy = false;
  function json() {
    if (isImportBusy()) return false;
    closeMenus();
    try {
      if (getSubject() === 'company') {
        const state = getCompanyState();
        const result = downloadJson({ filename: 'company-ranking-v1.json', mimeType: 'application/json;charset=utf-8',
          text: JSON.stringify({ schemaVersion: 1, selectedCompanyIds: state.selectedCompanyIds, tierOrder: state.tierOrder }, null, 2) });
        announce(`会社排榜 JSON 已导出：${result.filename}`, 'success');
        return result;
      }
      const result = exportWorksJson();
      announce(`JSON 已导出：${result.filename}`, 'success'); return result;
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
      announce(`PNG 已导出：${result.filename}`, 'success'); return result;
    } catch (error) {
      const known = isPngError(error); announce(pngExportMessage(error, known), 'error');
      if (!known) logError(error);
      return false;
    } finally { busy = false; onBusyChange(); }
  }
  return Object.freeze({ json, png, get busy() { return busy; } });
}

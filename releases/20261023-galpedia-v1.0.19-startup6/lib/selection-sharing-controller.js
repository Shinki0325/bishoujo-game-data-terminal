import { buildSelectionShareUrl } from './share-selection.js';

export function createSelectionSharingController({ locationRef, datasetVersion, nativeShare, copy, announce, logError }) {
  return Object.freeze({ async share(workIds) {
    if (!Array.isArray(workIds) || workIds.length === 0) return false;
    const url = buildSelectionShareUrl({ baseUrl: locationRef.href, datasetVersion, workIds });
    try { if (nativeShare) await nativeShare({ title: '排榜选片', url }); }
    catch (error) { if (error?.name !== 'AbortError') logError(error); }
    const copied = await copy(url);
    announce(copied ? '链接已复制，可在当前设备或其他设备打开' : '分享链接已生成，可在当前设备或其他设备打开', copied ? 'success' : 'warning');
    return copied;
  } });
}

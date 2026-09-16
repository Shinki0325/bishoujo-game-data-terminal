import { createViewLifetime } from './view-lifetime.js';

// Private import transaction state; shared candidate/ranking state stays behind
// getSelectedWorkIds/appendWorks, and guidance is a presentation callback.
export function createBangumiImportController({
  elements, loadImportModule, confirmedBindings, getSelectedWorkIds, workLimit,
  titleForWork, readTitles = null, familyForWork, isBusy, onPhase,
  renderGuidance, completeGuide, appendWorks, onSuccess, onOpen, onClose,
  closeDialog, showDialog
}) {
  const document = elements.bangumiPublicImportDialog.ownerDocument;
  const lifetime = createViewLifetime();
  let pendingBangumiPublicImport = null, bangumiPublicImportAbort = null;
  let bangumiImportTitles = new Map(), bangumiPublicImportRequest = 0, bangumiImport = null;
  let focusTimer = null;
  let bindingsPromise = null;
  const readBindings = () => bindingsPromise ??= Promise.resolve().then(() => (
    typeof confirmedBindings === 'function' ? confirmedBindings() : confirmedBindings
  )).then(value => {
    if (!Array.isArray(value)) throw new Error('已确认的 Bangumi 映射不可用');
    return value;
  }).catch(error => { bindingsPromise = null; throw error; });
  function cancelFocus() {
    if (focusTimer !== null) document.defaultView.clearTimeout(focusTimer);
    focusTimer = null;
  }
  function setBangumiPublicImportStatus(message, { error = false } = {}) {
    elements.bangumiPublicImportStatus.hidden = message.length === 0;
    elements.bangumiPublicImportStatus.textContent = message;
    elements.bangumiPublicImportStatus.classList.toggle('is-error', error);
    if (error) onPhase('error');
    renderGuidance();
  }

  function selectedBangumiImportWorkIds() {
    return Array.from(elements.bangumiPublicImportList.querySelectorAll('input[data-work-id]:checked:not(:disabled)'))
      .map(input => input.dataset.workId)
      .filter(workId => typeof workId === 'string' && workId.length > 0);
  }

  function syncBangumiPublicImportSelection() {
    if (pendingBangumiPublicImport === null) return;
    const selectedWorkIds = selectedBangumiImportWorkIds();
    const currentCount = getSelectedWorkIds().length;
    const availableSlots = Math.max(0, workLimit - currentCount);
    const overCapacity = selectedWorkIds.length > availableSlots;
    elements.bangumiPublicImportCapacity.textContent = `候选池剩余 ${availableSlots}`;
    elements.bangumiPublicImportAppend.disabled = isBusy() || selectedWorkIds.length === 0 || overCapacity;
    if (overCapacity) {
      elements.bangumiPublicImportSelectionStatus.textContent = `已勾选 ${selectedWorkIds.length} 部，但候选池只剩 ${availableSlots} 个位置。请取消部分作品后再追加。`;
      return;
    }
    elements.bangumiPublicImportSelectionStatus.textContent = selectedWorkIds.length === 0
      ? '请选择至少一部尚未在候选池中的作品。'
      : `将追加 ${selectedWorkIds.length} 部作品；已有候选和已排档位不会改变。`;
  }

  function resetBangumiPublicImportDialog({ keepInput = true } = {}) {
    bangumiImportTitles = new Map();
    onPhase('input');
    pendingBangumiPublicImport = null;
    elements.bangumiPublicImportResults.hidden = true;
    elements.bangumiPublicImportList.replaceChildren();
    elements.bangumiPublicUnmatchedList.replaceChildren();
    elements.bangumiPublicImportUnmatched.hidden = true;
    elements.bangumiPublicTotal.textContent = '0';
    elements.bangumiPublicMatchedSubjects.textContent = '0';
    elements.bangumiPublicMappedWorks.textContent = '0';
    elements.bangumiPublicUnmatched.textContent = '0';
    elements.bangumiPublicUnmatchedCount.textContent = '0';
    elements.bangumiPublicImportCapacity.textContent = `候选池剩余 ${Math.max(0, workLimit - getSelectedWorkIds().length)}`;
    elements.bangumiPublicImportAppend.disabled = true;
    elements.bangumiPublicImportSelectionStatus.textContent = '读取后可选择要追加的作品。';
    elements.bangumiPublicFetch.disabled = false;
    elements.bangumiPublicUserInput.disabled = false;
    setBangumiPublicImportStatus('');
    if (!keepInput) elements.bangumiPublicUserInput.value = '';
  }

  function closeBangumiPublicImportDialog() {
    cancelFocus();
    bangumiPublicImportRequest += 1;
    bangumiPublicImportAbort?.abort();
    bangumiPublicImportAbort = null;
    closeDialog(elements.bangumiPublicImportDialog);
    resetBangumiPublicImportDialog();
  }

  function createBangumiImportItem({ collection, workId, alreadySelected, checked, variant = 'primary' }) {
    const row = document.createElement('label');
    row.className = 'bangumi-import-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.dataset.workId = workId;
    checkbox.checked = checked || alreadySelected;
    checkbox.disabled = alreadySelected;
    const variantLabel = variant === 'primary' ? '主作品' : '可选版本';
    checkbox.setAttribute('aria-label', `${bangumiImportTitles.get(workId) ?? titleForWork(workId) ?? workId} ${alreadySelected ? '已在候选池' : `选择${variantLabel}导入`}`);
    checkbox.addEventListener('change', syncBangumiPublicImportSelection);

    const copy = document.createElement('span');
    copy.className = 'bangumi-import-item-copy';
    const title = document.createElement('strong');
    title.className = 'bangumi-import-item-title';
    title.textContent = bangumiImportTitles.get(workId) ?? titleForWork(workId) ?? `EGS #${workId}`;
    const meta = document.createElement('span');
    meta.className = 'bangumi-import-item-meta';
    const details = [`Bangumi #${collection.subjectId}`, bangumiImport.collectionTypeLabel(collection.collectionType)];
    if (collection.personalRate !== null) details.push(`个人评分 ${collection.personalRate}`);
    details.push(variantLabel);
    meta.textContent = details.join(' · ');
    copy.append(title, meta);

    const status = document.createElement('span');
    status.className = 'bangumi-import-item-status';
    status.textContent = alreadySelected ? '已在候选池' : variant === 'primary' ? '默认导入' : '可选';
    if (alreadySelected) status.classList.add('is-existing');
    row.append(checkbox, copy, status);
    return row;
  }

  function renderBangumiPublicImportPlan(plan, reportedTotal) {
    const fragment = document.createDocumentFragment();
    const renderedWorkIds = new Set();
    let selectedCount = 0;
    for (const collection of plan.matched) {
      for (const workId of collection.primaryWorkIds) {
        if (renderedWorkIds.has(workId)) continue;
        renderedWorkIds.add(workId);
        const alreadySelected = collection.alreadySelectedPrimaryWorkIds.includes(workId);
        const checked = !alreadySelected && selectedCount < plan.availableSlots;
        if (checked) selectedCount += 1;
        fragment.append(createBangumiImportItem({ collection, workId, alreadySelected, checked, variant: 'primary' }));
      }
      const optionalRows = [];
      for (const workId of collection.optionalWorkIds) {
        if (renderedWorkIds.has(workId)) continue;
        renderedWorkIds.add(workId);
        const alreadySelected = collection.alreadySelectedOptionalWorkIds.includes(workId);
        optionalRows.push(createBangumiImportItem({ collection, workId, alreadySelected, checked: false, variant: 'optional' }));
      }
      if (optionalRows.length > 0) {
        const alternatives = document.createElement('details');
        alternatives.className = 'bangumi-import-optional-versions';
        const summary = document.createElement('summary');
        summary.textContent = `其他 ${optionalRows.length} 个版本（可选，不会默认导入）`;
        const list = document.createElement('div');
        list.className = 'bangumi-import-optional-list';
        list.append(...optionalRows);
        alternatives.append(summary, list);
        fragment.append(alternatives);
      }
    }
    elements.bangumiPublicImportList.replaceChildren(fragment);
    const unmatched = document.createDocumentFragment();
    for (const collection of plan.unmatched) {
      const item = document.createElement('li');
      item.textContent = `${collection.title}（Bangumi #${collection.subjectId}）`;
      unmatched.append(item);
    }
    elements.bangumiPublicUnmatchedList.replaceChildren(unmatched);
    elements.bangumiPublicImportUnmatched.hidden = plan.unmatched.length === 0;
    elements.bangumiPublicTotal.textContent = String(reportedTotal);
    elements.bangumiPublicMatchedSubjects.textContent = String(plan.matchedSubjectCount);
    elements.bangumiPublicMappedWorks.textContent = String(plan.mappedWorkCount);
    elements.bangumiPublicUnmatched.textContent = String(plan.unmatchedSubjectCount);
    elements.bangumiPublicUnmatchedCount.textContent = String(plan.unmatchedSubjectCount);
    elements.bangumiPublicImportResults.hidden = false;
    syncBangumiPublicImportSelection();
  }

  async function readBangumiPublicCollections() {
    if (lifetime.disposed) return;
    if (confirmedBindings === null) {
      setBangumiPublicImportStatus('当前版本未加载已确认的 Bangumi 映射，无法安全导入。', { error: true });
      return;
    }
    const request = ++bangumiPublicImportRequest;
    bangumiPublicImportAbort?.abort();
    const abortController = new AbortController();
    bangumiPublicImportAbort = abortController;
    pendingBangumiPublicImport = null;
    elements.bangumiPublicImportResults.hidden = true;
    elements.bangumiPublicImportAppend.disabled = true;
    elements.bangumiPublicFetch.disabled = true;
    elements.bangumiPublicUserInput.disabled = true;
    onPhase('loading');
    setBangumiPublicImportStatus('正在读取 Bangumi 公开游戏收藏…');
    try {
      const [module, bindings] = await Promise.all([loadImportModule(), readBindings()]);
      bangumiImport = module;
      const { fetchBangumiPublicGameCollections, planBangumiPublicImport } = bangumiImport;
      if (request !== bangumiPublicImportRequest) return;
      const result = await fetchBangumiPublicGameCollections({
        userIdentifier: elements.bangumiPublicUserInput.value,
        signal: abortController.signal
      });
      if (request !== bangumiPublicImportRequest) return;
      const plan = planBangumiPublicImport({
        collections: result.collections,
        confirmedBindings: bindings,
        currentSelectedWorkIds: getSelectedWorkIds(),
        workLimit: workLimit,
        presentationFamilyForWork: workId => familyForWork(workId)
      });
      if(readTitles !== null) {
        const ids=[...new Set(plan.matched.flatMap(row=>[...row.primaryWorkIds,...row.optionalWorkIds]))];
        const titles=await readTitles(ids);
        if(request!==bangumiPublicImportRequest)return;
        if(titles.length!==ids.length)throw new Error('导入作品名称资料缺失');
        bangumiImportTitles=new Map(titles.map(row=>[row.workId,row.title]));
      }
      pendingBangumiPublicImport = plan;
      renderBangumiPublicImportPlan(plan, result.reportedTotal);
      onPhase('result');
      completeGuide('bangumi.input');
      setBangumiPublicImportStatus(
        `已读取 ${result.reportedTotal} 条公开游戏收藏；其中 ${plan.matchedSubjectCount} 条已确认与本站作品对应。`
      );
    } catch (error) {
      if (request !== bangumiPublicImportRequest || error?.name === 'AbortError') return;
      const message = bangumiImport && error instanceof bangumiImport.BangumiPublicImportError
        ? error.message
        : '读取 Bangumi 公开收藏失败，请稍后重试。';
      setBangumiPublicImportStatus(message, { error: true });
    } finally {
      if (request === bangumiPublicImportRequest) {
        bangumiPublicImportAbort = null;
        elements.bangumiPublicFetch.disabled = false;
        elements.bangumiPublicUserInput.disabled = false;
      }
    }
  }

  function openBangumiPublicImportDialog({ fromEmpty = false } = {}) {
    if (lifetime.disposed || isBusy()) return false;
    onOpen({ fromEmpty });
    resetBangumiPublicImportDialog();
    showDialog(elements.bangumiPublicImportDialog);
    // Begin the small pinned mapping while the user enters their account.
    // Closing the dialog cancels its transaction, not this reusable resource.
    if (confirmedBindings !== null) void readBindings().catch(() => {});
    cancelFocus();
    focusTimer = document.defaultView.setTimeout(() => {
      focusTimer = null;
      if (!lifetime.disposed && elements.bangumiPublicImportDialog.open) elements.bangumiPublicUserInput.focus();
    }, 0);
    return true;
  }

function appendSelected() {
    if (lifetime.disposed) return;
    if (pendingBangumiPublicImport === null) return;
    const workIds = selectedBangumiImportWorkIds();
    const availableSlots = Math.max(0, workLimit - getSelectedWorkIds().length);
    if (workIds.length === 0 || workIds.length > availableSlots) {
      syncBangumiPublicImportSelection();
      return;
    }
    try {
      const changed = appendWorks(workIds);
      if (!changed) {
        setBangumiPublicImportStatus('这些作品已经在候选池中，未修改当前排榜。', { error: true });
        return;
      }
      closeBangumiPublicImportDialog();
      onSuccess(`已将 ${workIds.length} 部作品追加到候选池。`, 'success');
      completeGuide('bangumi.result');
    } catch (error) {
      setBangumiPublicImportStatus(
        error instanceof Error ? error.message : '追加候选池失败，当前排榜未修改。',
        { error: true }
      );
    }
  }

  function syncControls() {
    if (lifetime.disposed) return;
    elements.bangumiPublicFetch.disabled = isBusy() || bangumiPublicImportAbort !== null;
    elements.bangumiPublicUserInput.disabled = isBusy() || bangumiPublicImportAbort !== null;
    if (pendingBangumiPublicImport === null) elements.bangumiPublicImportAppend.disabled = true;
    else syncBangumiPublicImportSelection();
  }
  lifetime.listen(elements.bangumiImportOpen, 'click', () => openBangumiPublicImportDialog());
  lifetime.listen(elements.mobileBangumiImportOpen, 'click', () => openBangumiPublicImportDialog());
  lifetime.listen(elements.bangumiPublicImportForm, 'submit', event => {
    event.preventDefault(); void readBangumiPublicCollections();
  });
  lifetime.listen(elements.bangumiPublicImportCancel, 'click', closeBangumiPublicImportDialog);
  lifetime.listen(elements.bangumiPublicImportAppend, 'click', appendSelected);
  lifetime.listen(elements.bangumiPublicImportDialog, 'close', () => {
    if (elements.bangumiPublicImportDialog.open) return; // Ignore a queued close after reopening.
    cancelFocus();
    bangumiPublicImportRequest += 1;
    bangumiPublicImportAbort?.abort(); bangumiPublicImportAbort = null;
    resetBangumiPublicImportDialog(); onClose();
  });
  lifetime.add(() => {
    cancelFocus();
    bangumiPublicImportRequest += 1; bangumiPublicImportAbort?.abort();
    bangumiPublicImportAbort = null;
  });
  return Object.freeze({
    open: openBangumiPublicImportDialog, read: readBangumiPublicCollections,
    close: closeBangumiPublicImportDialog, syncControls,
    dispose: () => lifetime.dispose()
  });
}

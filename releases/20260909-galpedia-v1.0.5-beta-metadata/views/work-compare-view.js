import { COMPARE_COLUMNS, compareRating, compareScoreText, compareValueFor } from '../lib/work-compare-model.js';

export function createWorkCompareView({
  elements, documentRef: document, fallbackCoverUrl, coverSourcesForWork,
  visibleFilters, openWorkDetails, onRemove, onSort,
  minimum = 2, maximum = 20
}) {
  const MIN_COMPARE_WORKS = minimum, MAX_COMPARE_WORKS = maximum;
  function refreshCompareCardControls(selectedIds) {
    const selected = new Set(selectedIds);
    for (const card of Array.from(elements.catalogResults.querySelectorAll('[data-work-id]'))) {
      const button = card.querySelector('.selection-card-compare');
      if (!button) continue;
      const isCompared = selected.has(card.dataset.workId);
      button.classList.toggle('is-compared', isCompared);
      button.textContent = isCompared ? '已加入比较' : '加入比较';
      button.setAttribute('aria-pressed', String(isCompared));
      const title = card.getAttribute('aria-label')?.replace(/^查看\s+/u, '').replace(/\s+详情$/u, '') ?? '作品';
      button.setAttribute('aria-label', `${isCompared ? '移出' : '加入'}比较：${title}`);
    }
  }

  function renderBar(works, selectedIds, compareMode) {
    elements.workCompareBar.hidden = works.length === 0 && !compareMode;
    elements.workCompareCount.textContent = `已选 ${works.length} 部`;
    elements.workCompareHint.textContent = works.length < MIN_COMPARE_WORKS
      ? '选择两部作品开始并列比较'
      : works.length === 2
        ? '可查看双作并列比较'
        : works.length >= MAX_COMPARE_WORKS
          ? `已达到上限（${MAX_COMPARE_WORKS} 部）`
          : `可查看多作比较列表 · 最多 ${MAX_COMPARE_WORKS} 部`;
    elements.workCompareOpen.disabled = works.length < MIN_COMPARE_WORKS;
    elements.workCompareOpen.textContent = works.length > 2 ? '查看多作比较' : '查看双作比较';
    elements.workCompareItems.replaceChildren(...works.map(work => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'work-compare-item';
      item.title = `移出比较：${work.title}`;
      item.setAttribute('aria-label', item.title);
      const thumb = document.createElement('img');
      thumb.className = 'work-compare-item-thumb';
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.src = fallbackCoverUrl(work);
      item.append(thumb);
      const title = document.createElement('span');
      title.className = 'work-compare-item-title';
      title.textContent = work.title;
      item.append(title);
      const remove = document.createElement('span');
      remove.className = 'work-compare-item-remove';
      remove.setAttribute('aria-hidden', 'true');
      remove.textContent = '×';
      item.append(remove);
      void coverSourcesForWork(work).then(({ thumbnailUrl }) => {
        if (thumbnailUrl) thumb.src = thumbnailUrl;
      }).catch(() => {});
      item.addEventListener('click', () => onRemove(work));
      return item;
    }));
    refreshCompareCardControls(selectedIds);
  }

  function appendCompareValue(row, value, className) {
    const cell = document.createElement('div');
    cell.className = className;
    cell.textContent = value;
    row.append(cell);
  }

  function compareContentTags(work) {
    return visibleFilters(work)
      // Runtime filter adapters intentionally keep the stable group identity
      // but omit the source-only `kind` field. Use both forms so content tags
      // remain available in compare view while genre/platform stay excluded.
      .filter(filter => (
        filter.groupId !== 'game-type'
        && filter.groupId !== 'platform'
        && filter.kind !== 'genre'
        && filter.kind !== 'platform'
        && (filter.kind === 'content' || filter.kind === undefined)
      ))
      .map(filter => filter.displayTitle)
      .filter(Boolean);
  }

  function createCompareScoreCell(work, source, reverse = false) {
    const cell = document.createElement('div');
    cell.className = `work-compare-score-cell${reverse ? ' is-reverse' : ''}`;
    const value = document.createElement('span');
    value.className = 'work-compare-score-number';
    value.textContent = compareScoreText(work, source);
    const score = compareRating(work, source).score;
    const max = source === 'bangumi' ? 10 : 100;
    const meter = document.createElement('span');
    meter.className = 'work-compare-meter';
    const fill = document.createElement('span');
    fill.className = 'work-compare-meter-fill';
    fill.style.width = `${score === null ? 0 : Math.max(0, Math.min(100, (score / max) * 100))}%`;
    meter.append(fill);
    cell.append(value, meter);
    return cell;
  }

  function createCompareHeader(work) {
    const card = document.createElement('article');
    card.className = 'work-compare-header-card';
    const cover = document.createElement('div');
    cover.className = 'work-compare-header-cover';
    const image = document.createElement('img');
    image.alt = `${work.title} 封面`;
    image.loading = 'lazy';
    image.src = fallbackCoverUrl(work);
    cover.append(image);
    const title = document.createElement('h3');
    title.textContent = work.title;
    const meta = document.createElement('p');
    meta.textContent = [work.brandName, work.releaseDate].filter(Boolean).join(' · ');
    card.append(cover, title, meta);
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-label', `打开作品详情：${work.title}`);
    card.addEventListener('click', () => openWorkDetails(work));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openWorkDetails(work);
    });
    void coverSourcesForWork(work).then(({ thumbnailUrl }) => {
      if (thumbnailUrl) image.src = thumbnailUrl;
    }).catch(() => {});
    return card;
  }

  function renderDialog({ works, sorted, sortKey: compareSortKey, sortDirection: compareSortDirection, staffText }) {
    const compareStaffText = (work, key) => staffText(work.workId, key);
    elements.workCompareDialogSubtitle.textContent = works.length === 2
      ? '两部作品的评分与核心资料并列展示'
      : `${works.length} 部作品 · 当前列表仅展示核心比较字段`;
    const content = document.createElement('div');
    content.className = works.length === 2 ? 'work-compare-two' : 'work-compare-many';
    if (works.length === 2) {
      const headers = document.createElement('div');
      headers.className = 'work-compare-header-grid';
      headers.append(createCompareHeader(works[0]));
      const middle = document.createElement('div');
      middle.className = 'work-compare-axis';
      middle.textContent = '指标对照';
      headers.append(middle, createCompareHeader(works[1]));
      content.append(headers);
      const sources = [['egs', 'EGS'], ['vndb', 'VNDB'], ['bangumi', 'Bangumi']];
      const section = document.createElement('section');
      section.className = 'work-compare-section';
      section.innerHTML = '<h3>评分</h3>';
      for (const [source, label] of sources) {
        const row = document.createElement('div');
        row.className = `work-compare-score-row source-${source}`;
        row.append(createCompareScoreCell(works[0], source));
        appendCompareValue(row, label, 'work-compare-label');
        row.append(createCompareScoreCell(works[1], source, true));
        section.append(row);
      }
      content.append(section);
      const info = document.createElement('section');
      info.className = 'work-compare-section';
      info.innerHTML = '<h3>核心资料</h3>';
      for (const [label, key] of [['原画', 'artwork'], ['剧本', 'scenario']]) {
        const row = document.createElement('div');
        row.className = 'work-compare-info-row';
        appendCompareValue(row, label, 'work-compare-label');
        appendCompareValue(row, compareStaffText(works[0], key), 'work-compare-value');
        appendCompareValue(row, compareStaffText(works[1], key), 'work-compare-value');
        info.append(row);
      }
      const tagsA = new Set(compareContentTags(works[0]));
      const tagsB = new Set(compareContentTags(works[1]));
      const shared = [...tagsA].filter(tag => tagsB.has(tag));
      const uniqueA = [...tagsA].filter(tag => !tagsB.has(tag));
      const uniqueB = [...tagsB].filter(tag => !tagsA.has(tag));
      for (const [label, left, right, tone] of [
        ['共同标签', shared, shared, 'shared'],
        ['作品 A 独有', uniqueA, [], 'unique-a'],
        ['作品 B 独有', [], uniqueB, 'unique-b']
      ]) {
        const row = document.createElement('div');
        row.className = 'work-compare-info-row work-compare-tags-row';
        row.dataset.tagTone = tone;
        appendCompareValue(row, label, 'work-compare-label');
        appendCompareValue(row, left.join(' · ') || '—', 'work-compare-value');
        appendCompareValue(row, right.join(' · ') || '—', 'work-compare-value');
        info.append(row);
      }
      content.append(info);
    } else {
      const columns = COMPARE_COLUMNS;
      const valueFor = compareValueFor;
      const updateCompareSort = column => onSort(column.key);
      const list = document.createElement('div');
      list.className = 'work-compare-leaderboard';
      const table = document.createElement('table');
      table.className = 'work-compare-table';
      const colgroup = document.createElement('colgroup');
      for (const width of ['40px', '64px', '210px', '76px', '150px', '100px', '100px', '100px', '100px', '100px', '100px']) {
        const col = document.createElement('col');
        col.style.width = width;
        colgroup.append(col);
      }
      table.append(colgroup);
      const thead = document.createElement('thead');
      const groupHeader = document.createElement('tr');
      groupHeader.className = 'work-compare-leaderboard-header work-compare-group-header';
      const appendSortButton = (cell, column, label = column.label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `work-compare-sort-head${compareSortKey === column.key ? ' is-active' : ''}`;
        button.textContent = `${label}${compareSortKey === column.key ? (compareSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}`;
        button.setAttribute('aria-label', `按${column.label}排序`);
        button.title = `按${column.label}排序${compareSortKey === column.key ? `（当前${compareSortDirection === 'asc' ? '升序' : '降序'}，再次点击切换）` : ''}`;
        if (compareSortKey === column.key) cell.setAttribute('aria-sort', compareSortDirection === 'asc' ? 'ascending' : 'descending');
        button.addEventListener('click', () => updateCompareSort(column));
        cell.append(button);
      };
      const appendRowspanHeader = (label, key, className = '', sortable = false) => {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.rowSpan = 2;
        cell.dataset.columnKey = key;
        if (className) cell.className = className;
        const column = columns.find(item => item.key === key);
        if (sortable && column) appendSortButton(cell, column, label);
        else cell.textContent = label;
        groupHeader.append(cell);
      };
      appendRowspanHeader('#', 'rank');
      appendRowspanHeader('', 'cover');
      appendRowspanHeader('作品', 'title', '', true);
      appendRowspanHeader('年份', 'year', '', true);
      appendRowspanHeader('会社', 'company', '', true);
      for (const [source, label] of [['egs', 'EGS'], ['vndb', 'VNDB'], ['bangumi', 'Bangumi']]) {
        const cell = document.createElement('th');
        cell.scope = 'colgroup';
        cell.colSpan = 2;
        cell.className = `work-compare-source-group source-${source}-column`;
        cell.textContent = label;
        groupHeader.append(cell);
      }
      thead.append(groupHeader);

      const metricHeader = document.createElement('tr');
      metricHeader.className = 'work-compare-leaderboard-header work-compare-metric-header';
      const sortableColumns = columns.filter(column => column.source);
      for (const column of sortableColumns) {
        const cell = document.createElement('th');
        cell.scope = 'col';
        cell.dataset.columnKey = column.key;
        cell.className = `source-${column.source}-column`;
        const shortLabel = column.key.endsWith('Votes') ? '人数' : '分数';
        appendSortButton(cell, column, shortLabel);
        metricHeader.append(cell);
      }
      thead.append(metricHeader);
      table.append(thead);
      const tbody = document.createElement('tbody');
      sorted.forEach((work, index) => {
        const row = document.createElement('tr');
        row.className = 'work-compare-leaderboard-row';
        for (const column of columns) {
          const cell = document.createElement('td');
          cell.dataset.columnKey = column.key;
          if (column.source) cell.classList.add(`source-${column.source}-column`);
          if (column.key === 'rank') cell.textContent = String(index + 1);
          else if (column.key === 'cover') {
            const thumb = document.createElement('img');
            thumb.className = 'work-compare-leaderboard-thumb';
            thumb.alt = '';
            thumb.loading = 'lazy';
            thumb.src = fallbackCoverUrl(work);
            cell.append(thumb);
            void coverSourcesForWork(work).then(({ thumbnailUrl }) => { if (thumbnailUrl) thumb.src = thumbnailUrl; }).catch(() => {});
          } else if (column.key === 'title') {
            const title = document.createElement('button');
            title.type = 'button';
            title.className = 'work-compare-leaderboard-title';
            title.textContent = work.title;
            title.addEventListener('click', () => openWorkDetails(work));
            cell.append(title);
          } else {
            const value = valueFor(work, column.key);
            cell.textContent = value === null || value === '' ? '—' : String(value);
          }
          row.append(cell);
        }
        tbody.append(row);
      });
      table.append(tbody);
      list.append(table);

      const mobileList = document.createElement('div');
      mobileList.className = 'work-compare-mobile-list';
      const mobileControls = document.createElement('div');
      mobileControls.className = 'work-compare-mobile-controls';
      mobileControls.setAttribute('role', 'toolbar');
      mobileControls.setAttribute('aria-label', '选择比较指标与排序方式');
      const mobileColumns = columns.filter(column => column.type);
      for (const column of mobileColumns) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `work-compare-mobile-metric${compareSortKey === column.key ? ' is-active' : ''}${column.source ? ` source-${column.source}` : ''}`;
        button.textContent = `${column.label}${compareSortKey === column.key ? (compareSortDirection === 'asc' ? ' ↑' : ' ↓') : ''}`;
        button.setAttribute('aria-pressed', String(compareSortKey === column.key));
        button.addEventListener('click', () => updateCompareSort(column));
        mobileControls.append(button);
      }
      mobileList.append(mobileControls);
      const activeColumn = columns.find(column => column.key === compareSortKey) ?? columns.find(column => column.key === 'vndbScore');
      const mobileRows = document.createElement('div');
      mobileRows.className = 'work-compare-mobile-rows';
      sorted.forEach((work, index) => {
        const row = document.createElement('article');
        row.className = `work-compare-mobile-row${activeColumn.source ? ` source-${activeColumn.source}` : ''}`;
        const rank = document.createElement('span');
        rank.className = 'work-compare-mobile-rank';
        rank.textContent = String(index + 1);
        const thumb = document.createElement('img');
        thumb.className = 'work-compare-mobile-thumb';
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.src = fallbackCoverUrl(work);
        void coverSourcesForWork(work).then(({ thumbnailUrl }) => { if (thumbnailUrl) thumb.src = thumbnailUrl; }).catch(() => {});
        const identity = document.createElement('div');
        identity.className = 'work-compare-mobile-identity';
        const title = document.createElement('button');
        title.type = 'button';
        title.className = 'work-compare-mobile-title';
        title.textContent = work.title;
        title.addEventListener('click', () => openWorkDetails(work));
        const meta = document.createElement('span');
        meta.className = 'work-compare-mobile-meta';
        const year = valueFor(work, 'year');
        meta.textContent = [year, work.brandName].filter(value => value !== null && value !== '').join(' · ') || '资料未记录';
        identity.append(title, meta);
        const metric = document.createElement('div');
        metric.className = 'work-compare-mobile-value';
        const metricLabel = document.createElement('span');
        metricLabel.textContent = activeColumn.label;
        const metricValue = document.createElement('strong');
        const value = valueFor(work, activeColumn.key);
        metricValue.textContent = activeColumn.key === 'title'
          ? '标题顺序'
          : value === null || value === '' ? '—' : String(value);
        metric.append(metricLabel, metricValue);
        row.append(rank, thumb, identity, metric);
        mobileRows.append(row);
      });
      mobileList.append(mobileRows);
      content.append(list, mobileList);
    }
    elements.workCompareContent.replaceChildren(content);
    if (typeof elements.workCompareDialog.showModal === 'function' && !elements.workCompareDialog.open) elements.workCompareDialog.showModal();
  }
  return Object.freeze({ renderBar, renderDialog });
}


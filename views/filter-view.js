import {
  FormulaSyntaxError,
  basicToFormula,
  formatFormula
} from '../lib/formula.js';
import {
  canonicalToDisplayFormula,
  displayToCanonicalFormula,
  formatDisplayFormula,
  parseDisplayFormula
} from '../lib/display-formula.js';
import {
  applyFormulaCompletion,
  formulaCompletions
} from '../lib/formula-autocomplete.js';
import {
  ATTRIBUTE_GROUP_IDS,
  attributeSelectionsToFormula,
  DEFAULT_ATTRIBUTE_SELECTIONS,
  FILTER_GROUP_ORDER,
  formulaToBasicWithAttributes
} from '../lib/attribute-filters.js';
import { DEFAULT_FILTER_STATE } from '../lib/state.js';

const DEBOUNCE_MS = 150;
const COMPANY_OPTION_LIMIT = 6;
const FILTER_GROUP_RANK = new Map(FILTER_GROUP_ORDER.map((groupId, index) => [groupId, index]));
const ATTRIBUTE_GROUP_ID_SET = new Set(ATTRIBUTE_GROUP_IDS);
const ATTRIBUTE_SUMMARY_TITLES = Object.freeze({
  'game-type': '类型',
  platform: '平台',
  length: '篇幅'
});

function normalizeCompanySearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ja-JP');
}

function companyMatchesQuery(brand, query) {
  if (!query) return true;
  const aliases = Array.isArray(brand.searchAliases) ? brand.searchAliases : [];
  return [brand.brandName, ...aliases]
    .some(value => normalizeCompanySearchText(value).includes(query));
}

export function searchCompanySuggestions(brands, source, selectedBrandIds = [], limit = COMPANY_OPTION_LIMIT) {
  const query = normalizeCompanySearchText(source);
  const selected = new Set(selectedBrandIds);
  return brands
    .filter(brand => companyMatchesQuery(brand, query))
    .sort((left, right) => Number(selected.has(right.brandId)) - Number(selected.has(left.brandId)))
    .slice(0, limit);
}

function cloneFilterState(state) {
  return {
    ...state,
    brandIds: [...state.brandIds],
    attributeSelections: Object.fromEntries(ATTRIBUTE_GROUP_IDS.map(groupId => [
      groupId,
      [...(state.attributeSelections?.[groupId] ?? DEFAULT_ATTRIBUTE_SELECTIONS[groupId])]
    ])),
    positiveFilterIds: [...state.positiveFilterIds],
    excludedFilterIds: [...state.excludedFilterIds]
  };
}

function requiredElement(root, id) {
  const element = typeof root.getElementById === 'function'
    ? root.getElementById(id)
    : root.querySelector?.(`#${id}`);
  if (!element) throw new Error(`Missing required filter element #${id}`);
  return element;
}

function optionalElement(root, id) {
  return typeof root.getElementById === 'function'
    ? root.getElementById(id)
    : root.querySelector?.(`#${id}`) ?? null;
}

function createDebouncedCommit(callback) {
  let timer = null;
  let pendingArgs = null;
  function schedule(...args) {
    pendingArgs = args;
    if (timer !== null) globalThis.clearTimeout(timer);
    timer = globalThis.setTimeout(() => {
      const argsToCommit = pendingArgs;
      timer = null;
      pendingArgs = null;
      callback(...argsToCommit);
    }, DEBOUNCE_MS);
  }
  schedule.cancel = () => {
    if (timer !== null) globalThis.clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  schedule.flush = () => {
    if (timer === null) return false;
    globalThis.clearTimeout(timer);
    const argsToCommit = pendingArgs;
    timer = null;
    pendingArgs = null;
    callback(...argsToCommit);
    return true;
  };
  schedule.pending = () => timer !== null;
  return schedule;
}

function activeFilterCount(state) {
  const attributeCount = ATTRIBUTE_GROUP_IDS.reduce((count, groupId) => {
    const selected = state.attributeSelections?.[groupId] ?? DEFAULT_ATTRIBUTE_SELECTIONS[groupId];
    const defaults = DEFAULT_ATTRIBUTE_SELECTIONS[groupId];
    const isDefault = selected.length === defaults.length
      && selected.every((filterId, index) => filterId === defaults[index]);
    return count + Number(!isDefault);
  }, 0);
  const tagCount = state.mode === 'advanced'
    ? Number(state.advancedExpression.trim().length > 0)
    : state.positiveFilterIds.length + state.excludedFilterIds.length;
  return Number(state.titleQuery.trim().length > 0)
    + Number(state.minimumScore > DEFAULT_FILTER_STATE.minimumScore)
    + Number(state.minimumVoteCount !== DEFAULT_FILTER_STATE.minimumVoteCount)
    + Number(
      state.releaseYearStart !== DEFAULT_FILTER_STATE.releaseYearStart
      || state.releaseYearEnd !== DEFAULT_FILTER_STATE.releaseYearEnd
    )
    + state.brandIds.length
    + attributeCount
    + tagCount
    + Number(state.selectedOnly);
}

function orderedGroups(filters) {
  const groups = new Map();
  for (const filter of filters) {
    if (!groups.has(filter.groupId)) {
      groups.set(filter.groupId, {
        groupId: filter.groupId,
        title: filter.groupTitleZh,
        filters: []
      });
    }
    groups.get(filter.groupId).filters.push(filter);
  }
  for (const group of groups.values()) {
    group.filters.sort((left, right) => left.displayOrder - right.displayOrder);
  }
  return [...groups.values()].sort((left, right) => {
    const leftRank = FILTER_GROUP_RANK.get(left.groupId) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = FILTER_GROUP_RANK.get(right.groupId) ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank;
  });
}

function tagState(filterState, filterId) {
  if (filterState.positiveFilterIds.includes(filterId)) return 'include';
  if (filterState.excludedFilterIds.includes(filterId)) return 'exclude';
  return 'neutral';
}

function findByData(root, key, value) {
  const pending = [...Array.from(root.children ?? [])];
  while (pending.length > 0) {
    const node = pending.shift();
    if (node.dataset?.[key] === value) return node;
    pending.push(...Array.from(node.children ?? []));
  }
  return null;
}

function sharedAncestor(nodes) {
  let candidate = nodes[0]?.parentElement ?? null;
  while (candidate) {
    if (nodes.every(node => candidate.contains(node))) return candidate;
    candidate = candidate.parentElement;
  }
  return null;
}

export function createFilterView({
  root,
  filters,
  brands,
  releaseYearCounts = {},
  onFilterChange,
  onRequestCounts,
  onAttributeSelectionChange = () => {}
}) {
  if (!Array.isArray(filters) || !Array.isArray(brands)) {
    throw new TypeError('filters and brands must be arrays');
  }
  if (typeof onFilterChange !== 'function' || typeof onRequestCounts !== 'function') {
    throw new TypeError('filter callbacks must be functions');
  }
  if (typeof onAttributeSelectionChange !== 'function') {
    throw new TypeError('onAttributeSelectionChange must be a function');
  }

  const elements = {
    minimumScore: requiredElement(root, 'minimum-score'),
    minimumVotes: requiredElement(root, 'minimum-votes'),
    releaseYearStart: optionalElement(root, 'release-year-start'),
    releaseYearEnd: optionalElement(root, 'release-year-end'),
    releaseYearStartNumber: optionalElement(root, 'release-year-start-number'),
    releaseYearEndNumber: optionalElement(root, 'release-year-end-number'),
    releaseYearStartLabel: optionalElement(root, 'release-year-start-label'),
    releaseYearEndLabel: optionalElement(root, 'release-year-end-label'),
    releaseYearSlider: optionalElement(root, 'release-year-slider'),
    releaseYearRangeSelection: optionalElement(root, 'release-year-range-selection'),
    releaseYearPreview: optionalElement(root, 'release-year-result-preview'),
    companySearch: requiredElement(root, 'company-search'),
    companySelected: requiredElement(root, 'company-selected'),
    companyOptions: requiredElement(root, 'company-options'),
    attributeGroups: requiredElement(root, 'attribute-filter-groups'),
    attributeSelected: requiredElement(root, 'attribute-selected'),
    groups: requiredElement(root, 'filter-groups'),
    attributeSection: requiredElement(root, 'attribute-filter-region'),
    tagSection: requiredElement(root, 'tag-filter-title').parentElement,
    tagActionAnd: requiredElement(root, 'tag-action-and'),
    tagActionOr: requiredElement(root, 'tag-action-or'),
    tagActionNot: requiredElement(root, 'tag-action-not'),
    tagSelected: requiredElement(root, 'tag-selected'),
    summary: requiredElement(root, 'active-filter-summary'),
    activeChips: requiredElement(root, 'active-filter-chips'),
    modeBasic: requiredElement(root, 'mode-basic'),
    modeAdvanced: requiredElement(root, 'mode-advanced'),
    advancedPanel: requiredElement(root, 'advanced-panel'),
    expression: requiredElement(root, 'advanced-expression'),
    formulaSuggestions: requiredElement(root, 'formula-suggestions'),
    expressionError: requiredElement(root, 'advanced-error'),
    format: requiredElement(root, 'format-formula')
  };
  const documentRef = typeof root.createElement === 'function' ? root : root.ownerDocument;
  if (!documentRef || typeof documentRef.createElement !== 'function') {
    throw new TypeError('root must provide a document creation context');
  }
  const companyRegion = sharedAncestor([
    elements.companySearch,
    elements.companySelected,
    elements.companyOptions
  ]);
  if (!companyRegion) throw new Error('Company controls must share a container');
  const groups = orderedGroups(filters);
  const attributeGroups = groups.filter(group => ATTRIBUTE_GROUP_ID_SET.has(group.groupId));
  const contentGroups = groups.filter(group => !ATTRIBUTE_GROUP_ID_SET.has(group.groupId));
  let currentState = cloneFilterState(DEFAULT_FILTER_STATE);
  let currentCounts = { current: 0, filters: {}, brands: {} };
  let advancedDraft = '';
  let advancedDraftInvalid = false;
  let tagAction = 'and';
  let openGroupId = null;
  let companyPopupActive = false;
  let suppressCompanyFocusOpen = false;
  let pendingFocus = null;
  let formulaCompletion = null;
  let activeFormulaCompletionIndex = -1;
  const yearCounts = new Map();
  for (
    let year = DEFAULT_FILTER_STATE.releaseYearStart;
    year <= DEFAULT_FILTER_STATE.releaseYearEnd;
    year += 1
  ) {
    const count = Number(releaseYearCounts[year] ?? 0);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new TypeError(`releaseYearCounts.${year} must be a non-negative safe integer`);
    }
    yearCounts.set(year, count);
  }

  function emit(nextState) {
    currentState = cloneFilterState(nextState);
    onFilterChange(cloneFilterState(currentState));
  }

  function visibleCompanySuggestions() {
    if (!companyPopupActive) return [];
    return searchCompanySuggestions(brands, elements.companySearch.value, currentState.brandIds);
  }

  function requestCounts() {
    onRequestCounts(cloneFilterState(currentState), visibleCompanySuggestions().map(brand => ({ ...brand })));
  }

  function showFormulaError(error) {
    elements.expressionError.hidden = false;
    elements.expressionError.textContent = error instanceof FormulaSyntaxError
      ? `偏移 ${error.offset}: ${error.message}`
      : String(error?.message ?? error);
  }

  function clearFormulaError() {
    elements.expressionError.hidden = true;
    elements.expressionError.textContent = '';
  }

  function restorePendingFocus() {
    if (pendingFocus === null) return;
    const request = pendingFocus;
    pendingFocus = null;
    let target = null;
    if (request.type === 'tag') {
      target = findByData(elements.groups, 'filterId', request.id);
    } else if (request.type === 'attribute') {
      target = findByData(elements.attributeGroups, 'filterId', request.id);
    } else if (request.type === 'company-option') {
      target = findByData(elements.companyOptions, 'brandId', request.id);
      if (!target && request.fallbackId) {
        target = findByData(elements.companySelected, 'brandId', request.fallbackId);
      }
      target ??= elements.companySearch;
    } else if (request.type === 'company-search') {
      target = elements.companySearch;
    }
    target?.focus();
  }

  function parseDraft() {
    if (advancedDraft.trim().length === 0) return null;
    return parseDisplayFormula(advancedDraft, filters);
  }

  function closeFormulaSuggestions() {
    formulaCompletion = null;
    activeFormulaCompletionIndex = -1;
    elements.formulaSuggestions.hidden = true;
    elements.formulaSuggestions.replaceChildren();
    elements.expression.setAttribute('aria-expanded', 'false');
    elements.expression.removeAttribute?.('aria-activedescendant');
  }

  function renderFormulaSuggestions() {
    const cursor = Number.isInteger(elements.expression.selectionStart)
      ? elements.expression.selectionStart
      : elements.expression.value.length;
    formulaCompletion = formulaCompletions({
      source: elements.expression.value,
      cursor,
      filters
    });
    if (formulaCompletion.items.length === 0) {
      closeFormulaSuggestions();
      return;
    }
    if (
      activeFormulaCompletionIndex < 0
      || activeFormulaCompletionIndex >= formulaCompletion.items.length
    ) {
      activeFormulaCompletionIndex = 0;
    }
    const options = formulaCompletion.items.map((item, index) => {
      const button = documentRef.createElement('button');
      button.id = `formula-suggestion-${index}`;
      button.type = 'button';
      button.className = 'formula-suggestion';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === activeFormulaCompletionIndex));
      button.textContent = item.displayTitle;
      button.addEventListener('click', () => acceptFormulaCompletion(index));
      return button;
    });
    elements.formulaSuggestions.replaceChildren(...options);
    elements.formulaSuggestions.hidden = false;
    elements.expression.setAttribute('aria-expanded', 'true');
    elements.expression.setAttribute(
      'aria-activedescendant',
      `formula-suggestion-${activeFormulaCompletionIndex}`
    );
  }

  function selectFormulaCompletion(index) {
    if (!formulaCompletion || formulaCompletion.items.length === 0) return;
    activeFormulaCompletionIndex = (
      index + formulaCompletion.items.length
    ) % formulaCompletion.items.length;
    renderFormulaSuggestions();
  }

  function acceptFormulaCompletion(index = activeFormulaCompletionIndex) {
    const item = formulaCompletion?.items[index];
    if (!item) return false;
    const completed = applyFormulaCompletion(
      elements.expression.value,
      formulaCompletion,
      item.displayTitle
    );
    advancedDraft = completed.source;
    elements.expression.value = completed.source;
    elements.expression.selectionStart = completed.cursor;
    elements.expression.selectionEnd = completed.cursor;
    elements.expression.setSelectionRange?.(completed.cursor, completed.cursor);
    closeFormulaSuggestions();
    elements.expression.focus();
    advancedDraftInvalid = false;
    emitAdvanced(advancedDraft);
    return true;
  }

  function canRepresentDraftAsBasic() {
    try {
      const ast = parseDraft();
      return ast === null || formulaToBasicWithAttributes(ast, filters) !== null;
    } catch {
      return false;
    }
  }

  function renderSelectedCompanies() {
    const selectedChips = currentState.brandIds.flatMap(brandId => {
      const brand = brands.find(item => item.brandId === brandId);
      if (!brand) return [];
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip company-chip';
      button.dataset.brandId = brand.brandId;
      button.setAttribute('aria-label', `移除会社 ${brand.brandName}`);
      button.textContent = `${brand.brandName} ×`;
      button.addEventListener('click', () => {
        flushPendingEdits();
        pendingFocus = { type: 'company-search' };
        emit({
          ...currentState,
          brandIds: currentState.brandIds.filter(id => id !== brand.brandId)
        });
      });
      return [button];
    });
    elements.companySelected.replaceChildren(...selectedChips);
  }

  function renderCompanyOptions() {
    const selected = new Set(currentState.brandIds);
    elements.companyOptions.hidden = !companyPopupActive;
    if (!companyPopupActive) {
      elements.companyOptions.replaceChildren();
      return;
    }

    const matches = visibleCompanySuggestions();
    const rows = matches.map(brand => {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'company-option facet-control';
      button.dataset.brandId = brand.brandId;
      button.dataset.selected = String(selected.has(brand.brandId));
      button.setAttribute('aria-pressed', String(selected.has(brand.brandId)));
      const count = selected.has(brand.brandId)
        ? currentCounts.current
        : currentCounts.brands?.[brand.brandId] ?? brand.sampleWorkCount ?? 0;
      button.classList.toggle('is-active', selected.has(brand.brandId));
      button.classList.toggle('is-zero', count === 0);
      const name = documentRef.createElement('span');
      name.textContent = brand.brandName;
      const output = documentRef.createElement('small');
      output.textContent = String(count);
      button.addEventListener('click', () => {
        flushPendingEdits();
        const selectedIndex = currentState.brandIds.indexOf(brand.brandId);
        const fallbackId = selectedIndex === -1
          ? null
          : currentState.brandIds[selectedIndex + 1]
            ?? currentState.brandIds[selectedIndex - 1]
            ?? null;
        const next = new Set(currentState.brandIds);
        if (next.has(brand.brandId)) next.delete(brand.brandId); else next.add(brand.brandId);
        pendingFocus = { type: 'company-option', id: brand.brandId, fallbackId };
        emit({
          ...currentState,
          brandIds: brands.filter(item => next.has(item.brandId)).map(item => item.brandId)
        });
      });
      button.append(name, output);
      return button;
    });
    if (rows.length === 0) {
      const empty = documentRef.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = '没有匹配的会社';
      rows.push(empty);
    }
    elements.companyOptions.replaceChildren(...rows);
  }

  function renderCompanies() {
    renderSelectedCompanies();
    renderCompanyOptions();
  }

  function toggleTag(filterId) {
    flushPendingEdits();
    const state = tagState(currentState, filterId);
    const targetState = tagAction === 'not' ? 'exclude' : 'include';
    const positive = currentState.positiveFilterIds.filter(id => id !== filterId);
    const excluded = currentState.excludedFilterIds.filter(id => id !== filterId);
    if (state !== targetState) {
      if (targetState === 'include') positive.push(filterId); else excluded.push(filterId);
    }
    pendingFocus = { type: 'tag', id: filterId };
    emit({ ...currentState, positiveFilterIds: positive, excludedFilterIds: excluded });
  }

  function renderTagActions() {
    elements.tagActionAnd.setAttribute('aria-pressed', String(tagAction === 'and'));
    elements.tagActionOr.setAttribute('aria-pressed', String(tagAction === 'or'));
    elements.tagActionNot.setAttribute('aria-pressed', String(tagAction === 'not'));
  }

  function selectedAttributeIds(groupId) {
    return currentState.attributeSelections?.[groupId]
      ?? DEFAULT_ATTRIBUTE_SELECTIONS[groupId]
      ?? [];
  }

  function submitAttributeSelection(group, filterId) {
    flushPendingEdits();
    const selected = new Set(selectedAttributeIds(group.groupId));
    if (selected.has(filterId)) selected.delete(filterId); else selected.add(filterId);
    const nextIds = group.filters
      .filter(filter => selected.has(filter.filterId))
      .map(filter => filter.filterId);
    pendingFocus = { type: 'attribute', id: filterId };
    onAttributeSelectionChange(group.groupId, nextIds);
  }

  function renderSelectedAttributes() {
    if (currentState.mode !== 'basic') {
      elements.attributeSelected.replaceChildren();
      return;
    }
    const chips = [];
    for (const group of attributeGroups) {
      const selected = new Set(selectedAttributeIds(group.groupId));
      for (const filter of group.filters) {
        if (!selected.has(filter.filterId)) continue;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'filter-chip attribute-filter-chip';
        button.dataset.filterId = filter.filterId;
        button.dataset.groupId = group.groupId;
        const label = `${ATTRIBUTE_SUMMARY_TITLES[group.groupId] ?? group.title}：${filter.displayTitle}`;
        button.setAttribute('aria-label', `移除属性条件 ${label}`);
        button.textContent = `${label} ×`;
        button.addEventListener('click', () => submitAttributeSelection(group, filter.filterId));
        chips.push(button);
      }
    }
    elements.attributeSelected.replaceChildren(...chips);
  }

  function closeSiblingGroups(current) {
    for (const container of [elements.attributeGroups, elements.groups]) {
      for (const sibling of Array.from(container.children)) {
        if (sibling !== current) sibling.open = false;
      }
    }
  }

  function renderAttributeGroups() {
    const sections = attributeGroups.map(group => {
      const details = documentRef.createElement('details');
      details.className = 'filter-group attribute-filter-group';
      details.dataset.groupId = group.groupId;
      details.setAttribute('name', 'filter-tag-group');
      details.open = openGroupId === group.groupId;
      details.addEventListener('toggle', () => {
        if (details.open) {
          openGroupId = group.groupId;
          closeSiblingGroups(details);
        } else if (openGroupId === group.groupId) {
          openGroupId = null;
        }
      });
      const summary = documentRef.createElement('summary');
      const title = documentRef.createElement('span');
      title.textContent = group.title;
      const selected = new Set(selectedAttributeIds(group.groupId));
      const count = documentRef.createElement('small');
      count.className = 'count-badge';
      count.textContent = `${selected.size} / ${group.filters.length}`;
      summary.append(title, count);
      const list = documentRef.createElement('div');
      list.className = 'tag-list attribute-list';
      for (const filter of group.filters) {
        const isSelected = selected.has(filter.filterId);
        const facetCount = isSelected
          ? currentCounts.current
          : currentCounts.filters?.[filter.filterId] ?? 0;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'facet-control attribute-state-button';
        button.dataset.filterId = filter.filterId;
        button.dataset.groupId = group.groupId;
        button.dataset.state = isSelected ? 'selected' : 'neutral';
        button.classList.toggle('is-active', isSelected);
        button.classList.toggle('is-zero', facetCount === 0);
        button.setAttribute('aria-pressed', String(isSelected));
        button.setAttribute(
          'aria-label',
          `${filter.displayTitle}，${isSelected ? '移除属性条件' : '添加属性条件'}`
        );
        const label = documentRef.createElement('span');
        label.textContent = filter.displayTitle;
        const output = documentRef.createElement('small');
        output.textContent = String(facetCount);
        button.append(label, output);
        button.addEventListener('click', () => submitAttributeSelection(group, filter.filterId));
        list.append(button);
      }
      details.append(summary, list);
      return details;
    });
    elements.attributeGroups.replaceChildren(...sections);
  }

  function renderSelectedTags() {
    if (currentState.mode !== 'basic') {
      elements.tagSelected.replaceChildren();
      return;
    }
    const chips = [];
    const positiveLogic = currentState.basicOperator === 'OR' ? 'OR' : 'AND';

    function addChip(filterId, logic, className, stateKey) {
      const filter = filters.find(item => item.filterId === filterId);
      if (!filter) return;
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = `filter-chip tag-filter-chip ${className}`;
      button.dataset.filterId = filterId;
      button.setAttribute('aria-label', `移除标签条件 ${logic} ${filter.displayTitle}`);
      button.textContent = `${logic} ${filter.displayTitle} ×`;
      button.addEventListener('click', () => {
        flushPendingEdits();
        pendingFocus = { type: 'tag', id: filterId };
        emit({
          ...currentState,
          [stateKey]: currentState[stateKey].filter(id => id !== filterId)
        });
      });
      chips.push(button);
    }

    for (const filterId of currentState.positiveFilterIds) {
      addChip(filterId, positiveLogic, `tag-chip-${positiveLogic.toLowerCase()}`, 'positiveFilterIds');
    }
    for (const filterId of currentState.excludedFilterIds) {
      addChip(filterId, 'NOT', 'tag-chip-not', 'excludedFilterIds');
    }
    elements.tagSelected.replaceChildren(...chips);
  }

  function renderGroups() {
    const sections = contentGroups.map(group => {
      const details = documentRef.createElement('details');
      details.className = 'filter-group';
      details.dataset.groupId = group.groupId;
      details.setAttribute('name', 'filter-tag-group');
      details.open = openGroupId === group.groupId;
      details.addEventListener('toggle', () => {
        if (details.open) {
          openGroupId = group.groupId;
          closeSiblingGroups(details);
        } else if (openGroupId === group.groupId) {
          openGroupId = null;
        }
      });
      const summary = documentRef.createElement('summary');
      const title = documentRef.createElement('span');
      title.textContent = group.title;
      const activeCount = group.filters.filter(filter => tagState(currentState, filter.filterId) !== 'neutral').length;
      const count = documentRef.createElement('small');
      count.className = 'count-badge';
      count.textContent = `${activeCount} / ${group.filters.length}`;
      summary.append(title, count);
      const list = documentRef.createElement('div');
      list.className = 'tag-list';
      for (const filter of group.filters) {
        const state = tagState(currentState, filter.filterId);
        const facetCount = state === 'neutral'
          ? currentCounts.filters?.[filter.filterId] ?? 0
          : currentCounts.current;
        const button = documentRef.createElement('button');
        button.type = 'button';
        button.className = 'facet-control tag-state-button';
        button.dataset.filterId = filter.filterId;
        button.dataset.state = state;
        button.classList.toggle('is-active', state !== 'neutral');
        button.classList.toggle('is-zero', facetCount === 0);
        const targetState = tagAction === 'not' ? 'exclude' : 'include';
        const actionLabel = tagAction === 'and'
          ? '全部满足'
          : tagAction === 'or'
            ? '任一满足'
            : '排除';
        button.setAttribute(
          'aria-label',
          state === targetState
            ? `${filter.displayTitle}，清除${actionLabel}`
            : `${filter.displayTitle}，设为${actionLabel}`
        );
        const label = documentRef.createElement('span');
        label.textContent = filter.displayTitle;
        const output = documentRef.createElement('small');
        output.textContent = String(facetCount);
        button.append(label, output);
        button.addEventListener('click', () => toggleTag(filter.filterId));
        list.append(button);
      }
      details.append(summary, list);
      return details;
    });
    elements.groups.replaceChildren(...sections);
  }

  function renderActiveChips() {
    const chips = [];
    function addChip(key, label, removeCondition) {
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip active-filter-chip';
      button.dataset.chipKey = key;
      button.setAttribute('aria-label', `移除条件 ${label}`);
      button.textContent = `${label} ×`;
      button.addEventListener('click', () => {
        flushPendingEdits();
        pendingFocus = { type: 'clear' };
        removeCondition();
      });
      chips.push(button);
    }

    if (currentState.minimumScore > DEFAULT_FILTER_STATE.minimumScore) {
      addChip('minimumScore', `评分 ≥ ${currentState.minimumScore}`, () => emit({
        ...currentState,
        minimumScore: DEFAULT_FILTER_STATE.minimumScore
      }));
    }
    if (currentState.minimumVoteCount !== DEFAULT_FILTER_STATE.minimumVoteCount) {
      addChip('minimumVoteCount', `票数 ≥ ${currentState.minimumVoteCount}`, () => emit({
        ...currentState,
        minimumVoteCount: DEFAULT_FILTER_STATE.minimumVoteCount
      }));
    }
    if (
      currentState.releaseYearStart !== DEFAULT_FILTER_STATE.releaseYearStart
      || currentState.releaseYearEnd !== DEFAULT_FILTER_STATE.releaseYearEnd
    ) {
      addChip('releaseYear', `年份 ${currentState.releaseYearStart}-${currentState.releaseYearEnd}`, () => emit({
        ...currentState,
        releaseYearStart: DEFAULT_FILTER_STATE.releaseYearStart,
        releaseYearEnd: DEFAULT_FILTER_STATE.releaseYearEnd
      }));
    }
    for (const brandId of currentState.brandIds) {
      const brand = brands.find(item => item.brandId === brandId);
      if (!brand) continue;
      addChip(`brand:${brandId}`, `会社 ${brand.brandName}`, () => emit({
        ...currentState,
        brandIds: currentState.brandIds.filter(id => id !== brandId)
      }));
    }
    if (currentState.mode === 'basic') {
      for (const filterId of currentState.positiveFilterIds) {
        const filter = filters.find(item => item.filterId === filterId);
        if (!filter) continue;
        addChip(`include:${filterId}`, `包含 ${filter.displayTitle}`, () => emit({
          ...currentState,
          positiveFilterIds: currentState.positiveFilterIds.filter(id => id !== filterId)
        }));
      }
      for (const filterId of currentState.excludedFilterIds) {
        const filter = filters.find(item => item.filterId === filterId);
        if (!filter) continue;
        addChip(`exclude:${filterId}`, `排除 ${filter.displayTitle}`, () => emit({
          ...currentState,
          excludedFilterIds: currentState.excludedFilterIds.filter(id => id !== filterId)
        }));
      }
    }
    elements.activeChips.replaceChildren(...chips);
  }

  const emitNumeric = createDebouncedCommit(values => emit({
    ...currentState,
    minimumScore: values.minimumScore,
    minimumVoteCount: values.minimumVoteCount
  }));
  const emitYear = createDebouncedCommit(values => {
    if (
      values.releaseYearStart === currentState.releaseYearStart
      && values.releaseYearEnd === currentState.releaseYearEnd
    ) return;
    emit({
      ...currentState,
      releaseYearStart: values.releaseYearStart,
      releaseYearEnd: values.releaseYearEnd
    });
  });
  const emitAdvanced = createDebouncedCommit(draft => {
    advancedDraft = draft;
    try {
      const canonicalDraft = displayToCanonicalFormula(advancedDraft, filters);
      advancedDraftInvalid = false;
      clearFormulaError();
      emit({ ...currentState, mode: 'advanced', advancedExpression: canonicalDraft });
    } catch (error) {
      advancedDraftInvalid = true;
      showFormulaError(error);
      elements.modeBasic.disabled = true;
    }
  });

  function captureNumericValues() {
    return {
      minimumScore: Number(elements.minimumScore.value || 0),
      minimumVoteCount: Number(elements.minimumVotes.value || 0)
    };
  }

  function clampYear(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_FILTER_STATE.releaseYearStart;
    return Math.max(
      DEFAULT_FILTER_STATE.releaseYearStart,
      Math.min(DEFAULT_FILTER_STATE.releaseYearEnd, Math.round(numeric))
    );
  }

  function normalizeYearValues(endpoint, source) {
    let start = clampYear(elements.releaseYearStart?.value ?? currentState.releaseYearStart);
    let end = clampYear(elements.releaseYearEnd?.value ?? currentState.releaseYearEnd);
    const edited = clampYear(source?.value ?? (endpoint === 'start' ? start : end));
    if (endpoint === 'start') {
      start = edited;
      if (start > end) end = start;
    } else if (endpoint === 'end') {
      end = edited;
      if (end < start) start = end;
    }
    return {
      releaseYearStart: start,
      releaseYearEnd: end
    };
  }

  function renderYearLabels(values = currentState) {
    const startText = String(values.releaseYearStart);
    const endText = String(values.releaseYearEnd);
    if (elements.releaseYearStart) elements.releaseYearStart.value = startText;
    if (elements.releaseYearEnd) elements.releaseYearEnd.value = endText;
    if (elements.releaseYearStartNumber) elements.releaseYearStartNumber.value = startText;
    if (elements.releaseYearEndNumber) elements.releaseYearEndNumber.value = endText;
    if (elements.releaseYearStartLabel) {
      elements.releaseYearStartLabel.textContent = startText;
    }
    if (elements.releaseYearEndLabel) {
      elements.releaseYearEndLabel.textContent = endText;
    }
    if (elements.releaseYearSlider) {
      const minimum = DEFAULT_FILTER_STATE.releaseYearStart;
      const maximum = DEFAULT_FILTER_STATE.releaseYearEnd;
      const coincident = values.releaseYearStart === values.releaseYearEnd;
      elements.releaseYearSlider.dataset.yearHandles = coincident ? 'coincident' : 'separate';
      elements.releaseYearSlider.dataset.yearBoundary = !coincident
        ? 'none'
        : values.releaseYearStart === minimum
          ? 'minimum'
          : values.releaseYearEnd === maximum
            ? 'maximum'
            : 'middle';
    }
    if (elements.releaseYearRangeSelection) {
      const minimum = DEFAULT_FILTER_STATE.releaseYearStart;
      const span = DEFAULT_FILTER_STATE.releaseYearEnd - minimum;
      const startPercent = ((values.releaseYearStart - minimum) / span) * 100;
      const endPercent = 100 - (((values.releaseYearEnd - minimum) / span) * 100);
      elements.releaseYearRangeSelection.style.setProperty('--year-range-start', `${startPercent}%`);
      elements.releaseYearRangeSelection.style.setProperty('--year-range-end', `${endPercent}%`);
    }
    for (const element of [elements.releaseYearStart, elements.releaseYearStartNumber]) {
      element?.setAttribute('aria-valuetext', `最早发行年份 ${startText}`);
    }
    for (const element of [elements.releaseYearEnd, elements.releaseYearEndNumber]) {
      element?.setAttribute('aria-valuetext', `最晚发行年份 ${endText}`);
    }
  }

  function renderYearPreview(values, committed = false) {
    if (!elements.releaseYearPreview) return;
    let count = currentCounts.current;
    if (!committed) {
      count = 0;
      for (let year = values.releaseYearStart; year <= values.releaseYearEnd; year += 1) {
        count += yearCounts.get(year) ?? 0;
      }
    }
    elements.releaseYearPreview.setAttribute('aria-live', 'polite');
    elements.releaseYearPreview.textContent = `预计 ${count} 个结果`;
  }

  function flushPendingEdits() {
    emitNumeric.flush();
    emitYear.flush();
    emitAdvanced.flush();
  }

  function closeCompanyPopupOnEscape(event) {
    if (event.key !== 'Escape' || !companyPopupActive) return;
    event.preventDefault();
    event.stopPropagation();
    companyPopupActive = false;
    suppressCompanyFocusOpen = true;
    renderCompanyOptions();
    elements.companySearch.focus();
    suppressCompanyFocusOpen = false;
  }

  elements.expression.setAttribute('aria-autocomplete', 'list');
  elements.expression.setAttribute('aria-controls', 'formula-suggestions');
  elements.expression.setAttribute('aria-expanded', 'false');
  closeFormulaSuggestions();
  elements.minimumScore.addEventListener('input', () => {
    emitNumeric(captureNumericValues());
  });
  elements.minimumVotes.addEventListener('input', () => {
    emitNumeric(captureNumericValues());
  });
  for (const [endpoint, element] of [
    ['start', elements.releaseYearStart],
    ['start', elements.releaseYearStartNumber],
    ['end', elements.releaseYearEnd],
    ['end', elements.releaseYearEndNumber]
  ]) {
    element?.addEventListener('input', () => {
      const values = normalizeYearValues(endpoint, element);
      renderYearLabels(values);
      renderYearPreview(values);
    });
    element?.addEventListener('change', () => {
      emitYear(normalizeYearValues(endpoint, element));
      emitYear.flush();
    });
    element?.addEventListener('keyup', event => {
      if (['Enter', ' ', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
        emitYear(normalizeYearValues(endpoint, element));
        emitYear.flush();
      }
    });
  }
  elements.companySearch.setAttribute('aria-controls', 'company-options');
  elements.companySearch.addEventListener('input', () => {
    companyPopupActive = true;
    renderCompanyOptions();
    requestCounts();
  });
  companyRegion.addEventListener('focusin', () => {
    if (suppressCompanyFocusOpen || companyPopupActive) return;
    companyPopupActive = true;
    renderCompanyOptions();
    requestCounts();
  });
  companyRegion.addEventListener('focusout', event => {
    if (event.relatedTarget && companyRegion.contains(event.relatedTarget)) return;
    companyPopupActive = false;
    renderCompanyOptions();
  });
  companyRegion.addEventListener('keydown', closeCompanyPopupOnEscape);
  elements.tagActionAnd.addEventListener('click', () => {
    flushPendingEdits();
    tagAction = 'and';
    emit({ ...currentState, basicOperator: 'AND' });
  });
  elements.tagActionOr.addEventListener('click', () => {
    flushPendingEdits();
    tagAction = 'or';
    emit({ ...currentState, basicOperator: 'OR' });
  });
  elements.tagActionNot.addEventListener('click', () => {
    tagAction = 'not';
    renderTagActions();
    renderGroups();
  });
  elements.expression.addEventListener('input', () => {
    advancedDraft = elements.expression.value;
    advancedDraftInvalid = false;
    emitAdvanced(advancedDraft);
    activeFormulaCompletionIndex = -1;
    renderFormulaSuggestions();
  });
  elements.expression.addEventListener('click', renderFormulaSuggestions);
  elements.expression.addEventListener('keyup', event => {
    if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      renderFormulaSuggestions();
    }
  });
  elements.expression.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !elements.formulaSuggestions.hidden) {
      event.preventDefault();
      closeFormulaSuggestions();
      return;
    }
    if (!formulaCompletion || formulaCompletion.items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      selectFormulaCompletion(activeFormulaCompletionIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      selectFormulaCompletion(activeFormulaCompletionIndex - 1);
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      acceptFormulaCompletion();
    }
  });
  const formulaRegion = sharedAncestor([elements.expression, elements.formulaSuggestions]);
  formulaRegion?.addEventListener('focusout', event => {
    if (event.relatedTarget && formulaRegion.contains(event.relatedTarget)) return;
    closeFormulaSuggestions();
  });
  elements.modeAdvanced.addEventListener('click', () => {
    closeFormulaSuggestions();
    emitNumeric.flush();
    emitYear.flush();
    if (currentState.mode === 'advanced') {
      emitAdvanced.flush();
      return;
    }
    emitAdvanced.cancel();
    let contentDraft = basicToFormula(
      currentState.positiveFilterIds,
      currentState.excludedFilterIds,
      currentState.basicOperator
    );
    if (
      currentState.basicOperator === 'OR'
      && currentState.positiveFilterIds.length > 1
      && currentState.excludedFilterIds.length === 0
    ) {
      contentDraft = `(${contentDraft})`;
    }
    const attributeDraft = attributeSelectionsToFormula(
      currentState.attributeSelections,
      filters
    );
    const canonicalDraft = [attributeDraft, contentDraft].filter(Boolean).join(' AND ');
    advancedDraft = canonicalToDisplayFormula(canonicalDraft, filters);
    advancedDraftInvalid = false;
    clearFormulaError();
    emit({ ...currentState, mode: 'advanced', advancedExpression: canonicalDraft });
  });
  elements.modeBasic.addEventListener('click', () => {
    closeFormulaSuggestions();
    emitNumeric.flush();
    emitYear.flush();
    emitAdvanced.cancel();
    if (currentState.mode === 'basic') return;
    if (advancedDraftInvalid) return;
    try {
      const ast = parseDraft();
      const basic = ast === null
        ? {
            attributeSelections: Object.fromEntries(
              ATTRIBUTE_GROUP_IDS.map(groupId => [groupId, []])
            ),
            positiveFilterIds: [],
            excludedFilterIds: [],
            basicOperator: 'AND'
          }
        : formulaToBasicWithAttributes(ast, filters);
      if (basic === null) return;
      tagAction = basic.basicOperator === 'OR' ? 'or' : 'and';
      emit({
        ...currentState,
        mode: 'basic',
        attributeSelections: basic.attributeSelections,
        positiveFilterIds: basic.positiveFilterIds,
        excludedFilterIds: basic.excludedFilterIds,
        basicOperator: basic.basicOperator
      });
    } catch (error) {
      advancedDraftInvalid = true;
      showFormulaError(error);
    }
  });
  elements.format.addEventListener('click', () => {
    closeFormulaSuggestions();
    emitNumeric.flush();
    emitYear.flush();
    emitAdvanced.cancel();
    try {
      const ast = parseDraft();
      advancedDraft = ast === null ? '' : formatDisplayFormula(ast, filters);
      elements.expression.value = advancedDraft;
      advancedDraftInvalid = false;
      clearFormulaError();
      emit({
        ...currentState,
        mode: 'advanced',
        advancedExpression: ast === null ? '' : formatFormula(ast)
      });
    } catch (error) {
      advancedDraftInvalid = true;
      showFormulaError(error);
    }
  });
  return Object.freeze({
    render(filterState, prospectiveCounts = {}) {
      currentState = cloneFilterState(filterState);
      currentCounts = {
        current: prospectiveCounts.current ?? 0,
        filters: prospectiveCounts.filters ?? {},
        brands: prospectiveCounts.brands ?? {}
      };
      if (!advancedDraftInvalid && !emitAdvanced.pending()) {
        advancedDraft = canonicalToDisplayFormula(currentState.advancedExpression, filters);
      }
      if (!emitNumeric.pending()) {
        elements.minimumScore.value = String(currentState.minimumScore);
        elements.minimumVotes.value = String(currentState.minimumVoteCount);
      }
      if (!emitYear.pending()) {
        if (elements.releaseYearStart) elements.releaseYearStart.value = String(currentState.releaseYearStart);
        if (elements.releaseYearEnd) elements.releaseYearEnd.value = String(currentState.releaseYearEnd);
      }
      renderYearLabels();
      renderYearPreview(currentState, true);
      elements.modeBasic.setAttribute('aria-pressed', String(currentState.mode === 'basic'));
      elements.modeAdvanced.setAttribute('aria-pressed', String(currentState.mode === 'advanced'));
      elements.attributeSection.hidden = currentState.mode !== 'basic';
      elements.tagSection.hidden = currentState.mode !== 'basic';
      elements.advancedPanel.hidden = currentState.mode !== 'advanced';
      if (tagAction !== 'not') {
        tagAction = currentState.basicOperator === 'OR' ? 'or' : 'and';
      }
      if (!emitAdvanced.pending()) elements.expression.value = advancedDraft;
      elements.modeBasic.disabled = currentState.mode === 'advanced' && !canRepresentDraftAsBasic();
      elements.summary.textContent = activeFilterCount(currentState) === 0
        ? `全部作品 · ${currentCounts.current}`
        : `${activeFilterCount(currentState)} 项筛选 · ${currentCounts.current} 个结果`;
      renderTagActions();
      renderCompanies();
      renderAttributeGroups();
      renderSelectedAttributes();
      renderGroups();
      renderSelectedTags();
      renderActiveChips();
      restorePendingFocus();
    }
  });
}

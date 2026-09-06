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
  const pinyin = Array.isArray(brand.searchPinyin) ? brand.searchPinyin : [];
  return [brand.brandName, ...aliases, ...pinyin]
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
    excludedFilterIds: [...state.excludedFilterIds],
    personIds: [...(state.personIds ?? [])],
    personRole: state.personRole ?? 'all'
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
    + (state.personIds?.length ?? 0)
    + attributeCount
    + tagCount
    + Number(state.selectedOnly);
}

function drawerFilterCount(state) {
  return Number(state.minimumScore > DEFAULT_FILTER_STATE.minimumScore)
    + Number(state.minimumVoteCount !== DEFAULT_FILTER_STATE.minimumVoteCount)
    + Number(
      state.releaseYearStart !== DEFAULT_FILTER_STATE.releaseYearStart
      || state.releaseYearEnd !== DEFAULT_FILTER_STATE.releaseYearEnd
    )
    + state.brandIds.length
    + (state.personIds?.length ?? 0)
    + ATTRIBUTE_GROUP_IDS.reduce((count, groupId) => {
      const selected = state.attributeSelections?.[groupId] ?? DEFAULT_ATTRIBUTE_SELECTIONS[groupId];
      const defaults = DEFAULT_ATTRIBUTE_SELECTIONS[groupId];
      return count + Number(
        selected.length !== defaults.length
        || selected.some((filterId, index) => filterId !== defaults[index])
      );
    }, 0)
    + (state.mode === 'advanced'
      ? Number(state.advancedExpression.trim().length > 0)
      : state.positiveFilterIds.length + state.excludedFilterIds.length);
}

function resetDrawerFilterState(state) {
  return {
    ...state,
    mode: DEFAULT_FILTER_STATE.mode,
    minimumScore: DEFAULT_FILTER_STATE.minimumScore,
    minimumVoteCount: DEFAULT_FILTER_STATE.minimumVoteCount,
    brandIds: [],
    attributeSelections: Object.fromEntries(ATTRIBUTE_GROUP_IDS.map(groupId => [
      groupId,
      [...DEFAULT_ATTRIBUTE_SELECTIONS[groupId]]
    ])),
    basicOperator: DEFAULT_FILTER_STATE.basicOperator,
    positiveFilterIds: [],
    excludedFilterIds: [],
    advancedExpression: DEFAULT_FILTER_STATE.advancedExpression,
    releaseYearStart: DEFAULT_FILTER_STATE.releaseYearStart,
    releaseYearEnd: DEFAULT_FILTER_STATE.releaseYearEnd,
    personIds: [],
    personRole: DEFAULT_FILTER_STATE.personRole
  };
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
  onAttributeSelectionChange = () => {},
  onPersonFilterFocus = () => {},
  personOptions = []
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
  if (typeof onPersonFilterFocus !== 'function') {
    throw new TypeError('onPersonFilterFocus must be a function');
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
    releaseYearStartTooltip: optionalElement(root, 'release-year-start-tooltip'),
    releaseYearEndTooltip: optionalElement(root, 'release-year-end-tooltip'),
    releaseYearHistogram: optionalElement(root, 'release-year-histogram'),
    releaseYearPreview: optionalElement(root, 'release-year-result-preview'),
    companySearch: requiredElement(root, 'company-search'),
    companySearchClear: optionalElement(root, 'company-filter-search-clear'),
    companySelected: requiredElement(root, 'company-selected'),
    companySelectedCount: optionalElement(root, 'company-selected-count'),
    companyOptions: requiredElement(root, 'company-options'),
    personSearch: optionalElement(root, 'person-filter-search'),
    personSearchClear: optionalElement(root, 'person-filter-search-clear'),
    personSelected: optionalElement(root, 'person-filter-selected'),
    personSelectedCount: optionalElement(root, 'person-selected-count'),
    personOptions: optionalElement(root, 'person-filter-options'),
    personRole: optionalElement(root, 'person-filter-role'),
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
    draftSummary: optionalElement(root, 'filter-draft-summary-text'),
    clearAll: optionalElement(root, 'filter-clear-all'),
    resultStatus: optionalElement(root, 'filter-result-status'),
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
  let personPopupActive = false;
  let personOptionsState = Array.isArray(personOptions) ? [...personOptions] : [];
  let personOptionsLoading = false;
  let suppressCompanyFocusOpen = false;
  let pendingFocus = null;
  let formulaCompletion = null;
  let activeFormulaCompletionIndex = -1;
  let yearCounts = new Map();
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

  function markResultPending() {
    if (!elements.resultStatus) return;
    elements.resultStatus.textContent = '正在更新…';
    elements.resultStatus.dataset.state = 'pending';
  }

  function emit(nextState) {
    markResultPending();
    currentState = cloneFilterState(nextState);
    onFilterChange(cloneFilterState(currentState));
  }

  function visibleCompanySuggestions() {
    if (!companyPopupActive) return [];
    return searchCompanySuggestions(brands, elements.companySearch.value, currentState.brandIds);
  }

  function requestCounts() {
    markResultPending();
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
    if (elements.companySelectedCount) {
      const count = currentState.brandIds.length;
      elements.companySelectedCount.textContent = count > 0 ? `已选 ${count} 家会社` : '';
    }
    if (elements.companySearchClear) {
      elements.companySearchClear.hidden = elements.companySearch.value.length === 0;
    }
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

  function personIdOf(person) {
    return String(person?.personId ?? person?.entityId ?? '');
  }

  function personNameOf(person) {
    return String(person?.displayName ?? person?.canonicalName ?? person?.name ?? personIdOf(person));
  }

  function personMatchesQuery(person, query) {
    const needle = String(query ?? '').trim().toLocaleLowerCase('zh-Hans');
    if (!needle) return true;
    return [
      personNameOf(person),
      person?.canonicalName,
      ...(Array.isArray(person?.aliases) ? person.aliases : []),
      person?.searchKey,
      person?.pinyinSearchKey
    ].filter(Boolean).some(value => String(value).toLocaleLowerCase('zh-Hans').includes(needle));
  }

  function visiblePersonSuggestions() {
    const selected = new Set(currentState.personIds ?? []);
    const query = elements.personSearch?.value ?? '';
    return personOptionsState
      .filter(person => personIdOf(person) && personMatchesQuery(person, query))
      .sort((left, right) => Number(selected.has(personIdOf(right))) - Number(selected.has(personIdOf(left)))
        || personNameOf(left).localeCompare(personNameOf(right), 'zh-Hans'))
      .slice(0, 12);
  }

  const PERSON_ROLE_LABELS = Object.freeze({
    'voice-actor': '声优',
    voice: '声优',
    scenario: '剧本',
    artwork: '原画',
    music: '音乐',
    unknown: '其他'
  });

  function personRoleLabel(person) {
    const roles = Object.keys(person?.roles ?? {})
      .filter(role => PERSON_ROLE_LABELS[role])
      .map(role => PERSON_ROLE_LABELS[role]);
    if (roles.length > 0) return [...new Set(roles)].join(' / ');
    return PERSON_ROLE_LABELS[person?.primaryRole] ?? '人物参与';
  }

  function renderSelectedPersons() {
    if (!elements.personSelected) return;
    const chips = (currentState.personIds ?? []).map(personId => {
      const person = personOptionsState.find(item => personIdOf(item) === personId);
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'filter-chip person-chip';
      button.dataset.personId = personId;
      const label = person ? personNameOf(person) : personId;
      const role = person ? personRoleLabel(person) : '人物参与';
      button.textContent = `${label} · ${role} ×`;
      button.setAttribute('aria-label', `移除人物 ${label}（${role}）`);
      button.addEventListener('click', () => {
        flushPendingEdits();
        emit({ ...currentState, personIds: currentState.personIds.filter(id => id !== personId) });
      });
      return button;
    });
    elements.personSelected.replaceChildren(...chips);
  }

  function renderPersonOptions() {
    if (!elements.personOptions) return;
    elements.personOptions.hidden = !personPopupActive;
    if (!personPopupActive) {
      elements.personOptions.replaceChildren();
      return;
    }
    const selected = new Set(currentState.personIds ?? []);
    const rows = visiblePersonSuggestions().map(person => {
      const personId = personIdOf(person);
      const active = selected.has(personId);
      const button = documentRef.createElement('button');
      button.type = 'button';
      button.className = 'person-option facet-control';
      button.dataset.personId = personId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      const name = documentRef.createElement('span');
      name.textContent = personNameOf(person);
      const meta = documentRef.createElement('small');
      meta.textContent = active ? `已选 · ${personRoleLabel(person)}` : personRoleLabel(person);
      button.append(name, meta);
      button.addEventListener('click', () => {
        flushPendingEdits();
        const next = new Set(currentState.personIds ?? []);
        if (next.has(personId)) next.delete(personId); else next.add(personId);
        emit({
          ...currentState,
          personIds: personOptionsState
            .map(item => personIdOf(item))
            .filter(id => next.has(id))
        });
        renderPersonOptions();
      });
      return button;
    });
    if (personOptionsLoading) {
      const loading = documentRef.createElement('p');
      loading.className = 'empty-list';
      loading.textContent = '正在加载人物…';
      rows.push(loading);
    } else if (rows.length === 0) {
      const empty = documentRef.createElement('p');
      empty.className = 'empty-list';
      empty.textContent = personOptionsState.length ? '没有匹配的人物' : '打开人物条件后加载目录';
      rows.push(empty);
    }
    elements.personOptions.replaceChildren(...rows);
  }

  function renderPersons() {
    if (elements.personSelectedCount) {
      const count = currentState.personIds?.length ?? 0;
      elements.personSelectedCount.textContent = count > 0 ? `已选 ${count} 位人物` : '';
    }
    if (elements.personSearchClear) {
      elements.personSearchClear.hidden = (elements.personSearch?.value ?? '').length === 0;
    }
    renderSelectedPersons();
    if (elements.personRole && elements.personRole.value !== (currentState.personRole ?? 'all')) {
      elements.personRole.value = currentState.personRole ?? 'all';
    }
    renderPersonOptions();
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
    for (const personId of currentState.personIds ?? []) {
      const person = personOptionsState.find(item => personIdOf(item) === personId);
      const label = person ? personNameOf(person) : personId;
      addChip(`person:${personId}`, `人物 ${label}`, () => emit({
        ...currentState,
        personIds: currentState.personIds.filter(id => id !== personId)
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
      elements.releaseYearSlider?.style.setProperty('--year-start-position', `${startPercent}%`);
      elements.releaseYearSlider?.style.setProperty('--year-end-position', `${100 - endPercent}%`);
    }
    if (elements.releaseYearStartTooltip) elements.releaseYearStartTooltip.textContent = startText;
    if (elements.releaseYearEndTooltip) elements.releaseYearEndTooltip.textContent = endText;
    for (const element of [elements.releaseYearStart, elements.releaseYearStartNumber]) {
      element?.setAttribute('aria-valuetext', `最早发行年份 ${startText}`);
    }
    for (const element of [elements.releaseYearEnd, elements.releaseYearEndNumber]) {
      element?.setAttribute('aria-valuetext', `最晚发行年份 ${endText}`);
    }
    renderYearHistogram(values);
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

  function renderYearHistogram(values = currentState) {
    if (!elements.releaseYearHistogram) return;
    const years = [...yearCounts.keys()];
    const maximum = Math.max(1, ...years.map(year => yearCounts.get(year) ?? 0));
    const fragment = documentRef.createDocumentFragment();
    for (const year of years) {
      const count = yearCounts.get(year) ?? 0;
      const bar = documentRef.createElement('button');
      bar.type = 'button';
      bar.className = 'year-histogram-bar';
      bar.style.setProperty('--year-height', `${(count / maximum) * 100}%`);
      bar.dataset.year = String(year);
      bar.dataset.inRange = String(year >= values.releaseYearStart && year <= values.releaseYearEnd);
      bar.title = `${year}：${count} 部作品`;
      bar.setAttribute('aria-label', `${year} 年，${count} 部作品，点击调整年份范围`);
      bar.addEventListener('click', () => {
        const start = Number(elements.releaseYearStart?.value ?? currentState.releaseYearStart);
        const end = Number(elements.releaseYearEnd?.value ?? currentState.releaseYearEnd);
        const endpoint = Math.abs(year - start) <= Math.abs(year - end) ? 'start' : 'end';
        commitYearEndpoint(endpoint, year);
      });
      fragment.append(bar);
    }
    elements.releaseYearHistogram.replaceChildren(fragment);
  }

  function commitYearEndpoint(endpoint, value) {
    const input = endpoint === 'start' ? elements.releaseYearStart : elements.releaseYearEnd;
    if (!input) return;
    input.value = String(value);
    const values = normalizeYearValues(endpoint, input);
    renderYearLabels(values);
    renderYearPreview(values);
    emitYear(values);
    emitYear.flush();
    input.focus({ preventScroll: true });
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
  elements.releaseYearSlider?.addEventListener('click', event => {
    // The range inputs intentionally expose only their thumbs to pointer input.
    // A click on the track itself should still provide the expected jump-to-year
    // interaction, while clicks that originate on a thumb remain native drags.
    if (event.target?.tagName === 'INPUT') return;
    const rect = elements.releaseYearSlider.getBoundingClientRect();
    const trackStart = rect.left + 10;
    const trackEnd = rect.right - 10;
    const ratio = Math.max(0, Math.min(1, (event.clientX - trackStart) / Math.max(1, trackEnd - trackStart)));
    const minimum = DEFAULT_FILTER_STATE.releaseYearStart;
    const maximum = DEFAULT_FILTER_STATE.releaseYearEnd;
    const year = Math.round(minimum + ratio * (maximum - minimum));
    const start = Number(elements.releaseYearStart?.value ?? currentState.releaseYearStart);
    const end = Number(elements.releaseYearEnd?.value ?? currentState.releaseYearEnd);
    const endpoint = Math.abs(year - start) <= Math.abs(year - end) ? 'start' : 'end';
    const input = endpoint === 'start' ? elements.releaseYearStart : elements.releaseYearEnd;
    if (!input) return;
    commitYearEndpoint(endpoint, year);
  });
  elements.companySearch.setAttribute('aria-controls', 'company-options');
  elements.companySearch.addEventListener('input', () => {
    companyPopupActive = true;
    renderCompanyOptions();
    renderSelectedCompanies();
    requestCounts();
  });
  elements.companySearchClear?.addEventListener('click', () => {
    elements.companySearch.value = '';
    companyPopupActive = true;
    renderCompanyOptions();
    renderSelectedCompanies();
    requestCounts();
    elements.companySearch.focus();
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
  if (elements.personSearch && elements.personOptions) {
    elements.personSearch.setAttribute('aria-controls', 'person-filter-options');
    elements.personSearch.addEventListener('focus', () => {
      personPopupActive = true;
      onPersonFilterFocus();
      renderPersonOptions();
    });
    elements.personSearch.addEventListener('input', () => {
      personPopupActive = true;
      onPersonFilterFocus();
      renderPersonOptions();
      renderPersons();
    });
    elements.personSearchClear?.addEventListener('click', () => {
      elements.personSearch.value = '';
      personPopupActive = true;
      onPersonFilterFocus();
      renderPersons();
      elements.personSearch.focus();
    });
    elements.personSearch.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      personPopupActive = false;
      renderPersonOptions();
    });
    elements.personSearch.addEventListener('blur', event => {
      if (event.relatedTarget && elements.personOptions.contains(event.relatedTarget)) return;
      personPopupActive = false;
      renderPersonOptions();
    });
  }
  elements.clearAll?.addEventListener('click', () => {
    flushPendingEdits();
    pendingFocus = { type: 'clear' };
    advancedDraft = '';
    advancedDraftInvalid = false;
    clearFormulaError();
    elements.companySearch.value = '';
    if (elements.personSearch) elements.personSearch.value = '';
    companyPopupActive = false;
    personPopupActive = false;
    emit(resetDrawerFilterState(currentState));
  });
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
        brands: prospectiveCounts.brands ?? {},
        yearCounts: prospectiveCounts.yearCounts ?? null
      };
      if (currentCounts.yearCounts) {
        yearCounts = new Map();
        for (let year = DEFAULT_FILTER_STATE.releaseYearStart; year <= DEFAULT_FILTER_STATE.releaseYearEnd; year += 1) {
          yearCounts.set(year, Number(currentCounts.yearCounts[year] ?? 0));
        }
      }
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
      renderYearHistogram();
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
      const appliedCount = activeFilterCount(currentState);
      const badge = optionalElement(root, 'filter-applied-count');
      if (badge) {
        badge.hidden = appliedCount === 0;
        badge.textContent = String(appliedCount);
        badge.setAttribute('aria-label', `已应用 ${appliedCount} 项筛选`);
        badge.parentElement.setAttribute('aria-label', appliedCount ? `筛选，已应用 ${appliedCount} 项` : '筛选');
      }
      const drawerCount = drawerFilterCount(currentState);
      if (elements.draftSummary) {
        elements.draftSummary.textContent = drawerCount === 0
          ? `当前范围 · ${new Intl.NumberFormat('zh-CN').format(currentCounts.current)} 个结果`
          : `${drawerCount} 项筛选 · ${new Intl.NumberFormat('zh-CN').format(currentCounts.current)} 个结果`;
      }
      if (elements.clearAll) elements.clearAll.hidden = drawerCount === 0;
      if (elements.resultStatus) {
        elements.resultStatus.textContent = '已更新';
        elements.resultStatus.dataset.state = 'ready';
      }
      elements.summary.textContent = appliedCount === 0
        ? `当前范围 · ${new Intl.NumberFormat('zh-CN').format(currentCounts.current)}`
        : `${activeFilterCount(currentState)} 项筛选 · ${new Intl.NumberFormat('zh-CN').format(currentCounts.current)} 个结果`;
      renderTagActions();
      renderCompanies();
      renderPersons();
      renderAttributeGroups();
      renderSelectedAttributes();
      renderGroups();
      renderSelectedTags();
      renderActiveChips();
      restorePendingFocus();
    },
    setPersonOptions(options) {
      personOptionsState = Array.isArray(options) ? [...options] : [];
      personOptionsLoading = false;
      renderPersons();
    },
    setPersonOptionsLoading(loading = true) {
      personOptionsLoading = Boolean(loading);
      renderPersonOptions();
    }
  });
}

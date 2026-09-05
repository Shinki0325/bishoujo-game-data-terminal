import { formulaToBasic } from './formula.js';

export const ATTRIBUTE_GROUP_IDS = Object.freeze(['game-type', 'platform', 'length']);
export const FILTER_GROUP_ORDER = Object.freeze([
  'game-type',
  'platform',
  'length',
  'world-type',
  'stage-season',
  'narrative-tone',
  'romance',
  'character',
  'adult'
]);
const ATTRIBUTE_GROUP_ID_SET = new Set(ATTRIBUTE_GROUP_IDS);
const SAFE_FILTER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const UNSAFE_FILTER_IDS = new Set(['__proto__', 'constructor', 'prototype']);
const RESERVED_FILTER_IDS = new Set(['AND', 'OR', 'NOT']);

export const DEFAULT_ATTRIBUTE_SELECTIONS = Object.freeze({
  'game-type': Object.freeze([]),
  platform: Object.freeze([]),
  length: Object.freeze([])
});

function appendDataProperty(array, value) {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(array, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value >= 0xffffffff
  ) {
    throw new TypeError('append target length is invalid');
  }
  Object.defineProperty(array, String(lengthDescriptor.value), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  });
}

function assertSafeFilterId(filterId) {
  if (
    typeof filterId !== 'string'
    || !SAFE_FILTER_ID_PATTERN.test(filterId)
    || UNSAFE_FILTER_IDS.has(filterId)
    || RESERVED_FILTER_IDS.has(filterId.toUpperCase())
  ) {
    throw new TypeError('attribute filter IDs must be safe and must not use unsafe or reserved IDs');
  }
}

function authorityGroup(filterId, authority) {
  if (authority === null || authority === undefined) return undefined;
  if (authority instanceof Map) return authority.get(filterId);
  if (Array.isArray(authority)) {
    const definition = authority.find(item => item?.filterId === filterId);
    return definition?.groupId;
  }
  if (typeof authority !== 'object') {
    throw new TypeError('attribute filter authority must be an object, Map, or definitions array');
  }
  const descriptor = Object.getOwnPropertyDescriptor(authority, filterId);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    throw new TypeError('attribute filter authority entries must be data properties');
  }
  return descriptor.value;
}

export function isAttributeFilter(filterId, authority) {
  if (typeof filterId !== 'string') return false;
  return ATTRIBUTE_GROUP_ID_SET.has(authorityGroup(filterId, authority));
}

export function cloneAttributeSelections(source, authority = null) {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new TypeError('attributeSelections must be an object');
  }
  const prototype = Object.getPrototypeOf(source);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('attributeSelections must be a plain object');
  }
  const keys = Reflect.ownKeys(source);
  for (const key of keys) {
    if (typeof key !== 'string' || !ATTRIBUTE_GROUP_ID_SET.has(key)) {
      throw new TypeError('attributeSelections contains an unexpected group');
    }
  }
  if (keys.length !== ATTRIBUTE_GROUP_IDS.length) {
    throw new TypeError('attributeSelections must contain every attribute group');
  }

  const entries = ATTRIBUTE_GROUP_IDS.map(groupId => {
    const descriptor = Object.getOwnPropertyDescriptor(source, groupId);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`attributeSelections.${groupId} must be a data property`);
    }
    const values = descriptor.value;
    if (!Array.isArray(values) || Object.getPrototypeOf(values) !== Array.prototype) {
      throw new TypeError(`attributeSelections.${groupId} must be a standard array`);
    }
    const clone = [];
    const seen = new Set();
    for (let index = 0; index < values.length; index += 1) {
      const itemDescriptor = Object.getOwnPropertyDescriptor(values, String(index));
      if (!itemDescriptor || !Object.hasOwn(itemDescriptor, 'value')) {
        throw new TypeError(`attributeSelections.${groupId} must be a dense data array`);
      }
      const filterId = itemDescriptor.value;
      assertSafeFilterId(filterId);
      if (seen.has(filterId)) {
        throw new TypeError(`attributeSelections.${groupId} contains a duplicate ID`);
      }
      const actualGroup = authorityGroup(filterId, authority);
      if (authority !== null && authority !== undefined && actualGroup === undefined) {
        throw new RangeError(`Unknown attribute filter ID "${filterId}"`);
      }
      if (actualGroup !== undefined && actualGroup !== groupId) {
        throw new RangeError(`Attribute filter "${filterId}" belongs to ${String(actualGroup)}`);
      }
      seen.add(filterId);
      appendDataProperty(clone, filterId);
    }
    if (Reflect.ownKeys(values).length !== values.length + 1) {
      throw new TypeError(`attributeSelections.${groupId} must contain only indexed entries`);
    }
    return [groupId, Object.freeze(clone)];
  });

  return Object.freeze(Object.fromEntries(entries));
}

export function attributeSelectionsToFormula(source, authority = null) {
  const selections = cloneAttributeSelections(source, authority);
  return ATTRIBUTE_GROUP_IDS
    .map(groupId => {
      const filterIds = selections[groupId];
      if (filterIds.length === 0) return '';
      if (filterIds.length === 1) return filterIds[0];
      return `(${filterIds.join(' OR ')})`;
    })
    .filter(Boolean)
    .join(' AND ');
}

function flatten(node, type, output) {
  if (node?.type === type) {
    flatten(node.left, type, output);
    flatten(node.right, type, output);
  } else {
    appendDataProperty(output, node);
  }
}

function filterIdsInOr(node) {
  const terms = [];
  flatten(node, 'or', terms);
  if (terms.some(term => term?.type !== 'filter')) return null;
  return terms.map(term => term.id);
}

function andAst(terms) {
  if (terms.length === 0) return null;
  return terms.slice(1).reduce(
    (left, right) => ({ type: 'and', left, right }),
    terms[0]
  );
}

export function formulaToBasicWithAttributes(ast, authority) {
  const terms = [];
  flatten(ast, 'and', terms);
  const grouped = Object.fromEntries(ATTRIBUTE_GROUP_IDS.map(groupId => [groupId, null]));
  const contentTerms = [];

  for (const term of terms) {
    if (term?.type === 'not' && isAttributeFilter(term.value?.id, authority)) return null;

    const filterIds = term?.type === 'filter'
      ? [term.id]
      : term?.type === 'or' ? filterIdsInOr(term) : null;
    if (filterIds !== null) {
      const groups = new Set(filterIds.map(filterId => authorityGroup(filterId, authority)));
      if (groups.size === 1 && ATTRIBUTE_GROUP_ID_SET.has([...groups][0])) {
        const groupId = [...groups][0];
        if (grouped[groupId] !== null) return null;
        grouped[groupId] = [...new Set(filterIds)];
        continue;
      }
      if ([...groups].some(groupId => ATTRIBUTE_GROUP_ID_SET.has(groupId))) return null;
    }
    appendDataProperty(contentTerms, term);
  }

  const contentAst = andAst(contentTerms);
  const basic = contentAst === null
    ? { positiveIds: [], excludedIds: [], operator: 'AND' }
    : formulaToBasic(contentAst);
  if (basic === null) return null;

  const attributeSelections = cloneAttributeSelections(
    Object.fromEntries(ATTRIBUTE_GROUP_IDS.map(groupId => [groupId, grouped[groupId] ?? []])),
    authority
  );
  return {
    attributeSelections,
    positiveFilterIds: basic.positiveIds,
    excludedFilterIds: basic.excludedIds,
    basicOperator: basic.operator
  };
}

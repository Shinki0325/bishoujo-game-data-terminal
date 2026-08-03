import {
  MAX_TIERS,
  MIN_TIERS,
  TIER_NAME_MAX_LENGTH
} from './tier-config.js';
import { tierColor } from './tier-palette.js';
import {
  ANNOTATION_MAX_ITEMS,
  annotationLines,
  normalizeAnnotation
} from './ranking-presentation.js';

export const PNG_LIMITS = Object.freeze({
  logicalMaxWidth: 2048,
  pixelRatio: 2,
  maxDimension: 16384,
  maxPixels: 64000000
});

const LAYOUT = Object.freeze({
  outerPadding: 16,
  tierLabelWidth: 96,
  itemSize: 160,
  gap: 8,
  titleStripHeight: 36
});
const TIER_BACKGROUND = '#111821';
const TITLE_BACKGROUND = 'rgba(8, 12, 18, 0.88)';
const MISSING_COVER_BACKGROUND = '#dce1e4';
const MISSING_COVER_FOREGROUND = '#35434b';
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_ID_LENGTH = 128;
const MAX_TITLE_LENGTH = 2048;
const MAX_COVER_PATH_LENGTH = 2048;
const MAX_RANKED_ITEMS = 100;
const TITLE_LINE_LENGTH = 20;
const TIER_NAME_LINE_LENGTH = 8;
const TIER_FIELDS = new Set(['id', 'name', 'colorId']);
const INTERNAL_ERRORS = new WeakMap();
const PLAN_RECORDS = new WeakMap();

export class PngExportError extends Error {
  constructor(message, { code = 'PNG_EXPORT_FAILED', path, cause, workIds } = {}) {
    super(message);
    Object.defineProperty(this, 'name', {
      configurable: true,
      value: 'PngExportError',
      writable: true
    });
    Object.defineProperty(this, 'code', {
      configurable: true,
      enumerable: true,
      value: code,
      writable: true
    });
    if (path !== undefined) {
      Object.defineProperty(this, 'path', {
        configurable: true,
        enumerable: true,
        value: path,
        writable: true
      });
    }
    if (cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        value: cause,
        writable: true
      });
    }
    if (workIds !== undefined) {
      Object.defineProperty(this, 'workIds', {
        configurable: true,
        enumerable: true,
        value: workIds,
        writable: true
      });
    }
  }
}

function pngError(invocation, code, message, { path, cause, workIds } = {}) {
  const error = new PngExportError(message, { code, path, cause, workIds });
  INTERNAL_ERRORS.set(error, invocation);
  return error;
}

function withSyncBoundary(operation) {
  const invocation = {};
  try {
    return operation(invocation);
  } catch (error) {
    if (INTERNAL_ERRORS.get(error) === invocation) {
      throw error;
    }
    throw pngError(
      invocation,
      'UNEXPECTED_INPUT',
      'Unexpected failure while validating PNG export input',
      { cause: error }
    );
  }
}

function assertPlainObject(value, path, invocation, code = 'INVALID_INPUT') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw pngError(invocation, code, `${path} must be a plain object`, { path });
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw pngError(invocation, code, `${path} must use a plain object prototype`, { path });
  }
}

function ownDataValue(object, field, path, invocation, {
  code = 'INVALID_INPUT',
  optional = false,
  defaultValue
} = {}) {
  const descriptor = Object.getOwnPropertyDescriptor(object, field);
  if (!descriptor) {
    if (optional) return defaultValue;
    throw pngError(invocation, code, `${path}.${field} is required`, {
      path: `${path}.${field}`
    });
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw pngError(invocation, code, `${path}.${field} must be an own data property`, {
      path: `${path}.${field}`
    });
  }
  return descriptor.value;
}

function isCanonicalArrayIndex(key) {
  return typeof key === 'string'
    && /^(?:0|[1-9]\d*)$/u.test(key)
    && Number.isSafeInteger(Number(key));
}

function snapshotDenseArray(value, path, invocation, {
  code = 'INVALID_TIER_ORDER',
  maxLength = MAX_RANKED_ITEMS,
  tooLargeCode = code
} = {}) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw pngError(invocation, code, `${path} must be a standard Array`, {
      path
    });
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) {
    throw pngError(
      invocation,
      code,
      `${path}.length must be a safe data property`,
      { path: `${path}.length` }
    );
  }
  const length = lengthDescriptor.value;
  if (length > maxLength) {
    throw pngError(invocation, tooLargeCode, `${path} exceeds its maximum length`, { path });
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length + 1
    || keys.some(key => (
      key !== 'length'
      && (!isCanonicalArrayIndex(key) || Number(key) >= length)
    ))
  ) {
    throw pngError(
      invocation,
      code,
      `${path} must be dense and contain only indexes`,
      { path }
    );
  }
  const snapshot = [];
  for (let index = 0; index < length; index += 1) {
    const itemPath = `${path}[${index}]`;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw pngError(
        invocation,
        code,
        `${itemPath} must be an own data property`,
        { path: itemPath }
      );
    }
    snapshot.push(descriptor.value);
  }
  return snapshot;
}

function assertSafeTierId(tierId, path, invocation) {
  if (
    typeof tierId !== 'string'
    || tierId.length === 0
    || tierId.length > MAX_ID_LENGTH
    || !SAFE_ID_PATTERN.test(tierId)
    || UNSAFE_KEYS.has(tierId)
  ) {
    throw pngError(invocation, 'INVALID_TIER', `${path} must be a safe tier ID`, { path });
  }
}

function snapshotTier(value, index, invocation) {
  const path = `tiers[${index}]`;
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw pngError(invocation, 'INVALID_TIER', `${path} must be a standard plain object`, {
      path
    });
  }
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== TIER_FIELDS.size
    || keys.some(key => typeof key !== 'string' || !TIER_FIELDS.has(key))
  ) {
    throw pngError(invocation, 'INVALID_TIER', `${path} must contain exactly id, name, and colorId`, {
      path
    });
  }
  const id = ownDataValue(value, 'id', path, invocation, { code: 'INVALID_TIER' });
  const rawName = ownDataValue(value, 'name', path, invocation, { code: 'INVALID_TIER' });
  const colorId = ownDataValue(value, 'colorId', path, invocation, { code: 'INVALID_TIER' });
  assertSafeTierId(id, `${path}.id`, invocation);
  if (typeof rawName !== 'string') {
    throw pngError(invocation, 'INVALID_TIER', `${path}.name must be a string`, {
      path: `${path}.name`
    });
  }
  const name = rawName.trim();
  const nameLength = [...name].length;
  if (nameLength < 1 || nameLength > TIER_NAME_MAX_LENGTH) {
    throw pngError(
      invocation,
      'INVALID_TIER',
      `${path}.name must contain 1 to ${TIER_NAME_MAX_LENGTH} characters after trimming`,
      { path: `${path}.name` }
    );
  }
  if (typeof colorId !== 'string') {
    throw pngError(invocation, 'INVALID_TIER_COLOR', `${path}.colorId is unknown`, {
      path: `${path}.colorId`
    });
  }
  let palette;
  try {
    palette = tierColor(colorId);
  } catch (error) {
    throw pngError(invocation, 'INVALID_TIER_COLOR', `${path}.colorId is unknown`, {
      path: `${path}.colorId`,
      cause: error
    });
  }
  return { id, name, colorId, palette };
}

function snapshotTiers(value, invocation) {
  const values = snapshotDenseArray(value, 'tiers', invocation, {
    code: 'INVALID_TIERS',
    maxLength: MAX_TIERS,
    tooLargeCode: 'INVALID_TIER_COUNT'
  });
  if (values.length < MIN_TIERS || values.length > MAX_TIERS) {
    throw pngError(
      invocation,
      'INVALID_TIER_COUNT',
      `tiers must contain ${MIN_TIERS} to ${MAX_TIERS} tiers`,
      { path: 'tiers' }
    );
  }
  const tiers = [];
  const ids = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const tier = snapshotTier(values[index], index, invocation);
    if (ids.has(tier.id)) {
      throw pngError(invocation, 'INVALID_TIER', `tiers contains duplicate ID ${tier.id}`, {
        path: `tiers[${index}].id`
      });
    }
    ids.add(tier.id);
    tiers.push(tier);
  }
  return tiers;
}

function assertSafeWorkId(workId, path, invocation) {
  if (
    typeof workId !== 'string'
    || workId.length === 0
    || workId.length > MAX_ID_LENGTH
    || !SAFE_ID_PATTERN.test(workId)
    || UNSAFE_KEYS.has(workId)
  ) {
    throw pngError(invocation, 'INVALID_WORK_ID', `${path} must be a safe work ID`, { path });
  }
}

function snapshotTierOrder(value, tiers, invocation) {
  assertPlainObject(value, 'tierOrder', invocation, 'INVALID_TIER_ORDER');
  const tierIds = tiers.map(tier => tier.id);
  const expectedIds = new Set(tierIds);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== tierIds.length
    || keys.some(key => typeof key !== 'string' || !expectedIds.has(key))
  ) {
    throw pngError(
      invocation,
      'INVALID_TIER_ORDER',
      'tierOrder must contain exactly the configured tier IDs',
      { path: 'tierOrder' }
    );
  }
  const result = Object.create(null);
  const placed = new Set();
  let rankedCount = 0;
  for (const tierId of tierIds) {
    const path = `tierOrder.${tierId}`;
    const row = snapshotDenseArray(
      ownDataValue(value, tierId, 'tierOrder', invocation, { code: 'INVALID_TIER_ORDER' }),
      path,
      invocation,
      { tooLargeCode: 'TIER_ORDER_TOO_LARGE' }
    );
    for (let index = 0; index < row.length; index += 1) {
      const workId = row[index];
      const itemPath = `${path}[${index}]`;
      assertSafeWorkId(workId, itemPath, invocation);
      if (placed.has(workId)) {
        throw pngError(
          invocation,
          'DUPLICATE_TIER_PLACEMENT',
          `work ID ${workId} appears more than once in tierOrder`,
          { path: itemPath }
        );
      }
      placed.add(workId);
      rankedCount += 1;
      if (rankedCount > MAX_RANKED_ITEMS) {
        throw pngError(invocation, 'TIER_ORDER_TOO_LARGE', 'tierOrder exceeds 100 works', {
          path: 'tierOrder'
        });
      }
    }
    result[tierId] = row;
  }
  return result;
}

function snapshotWorksById(value, invocation) {
  const snapshot = new Map();
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Map.prototype) {
    if (Reflect.ownKeys(value).length !== 0) {
      throw pngError(
        invocation,
        'INVALID_WORKS_BY_ID',
        'worksById Map must not contain own properties',
        { path: 'worksById' }
      );
    }
    for (const [workId, workValue] of Map.prototype.entries.call(value)) {
      assertSafeWorkId(workId, 'worksById key', invocation);
      snapshot.set(workId, workValue);
    }
    return snapshot;
  }

  assertPlainObject(value, 'worksById', invocation, 'INVALID_WORKS_BY_ID');
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw pngError(
        invocation,
        'INVALID_WORKS_BY_ID',
        'worksById keys must be strings',
        { path: 'worksById' }
      );
    }
    assertSafeWorkId(key, `worksById.${key}`, invocation);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw pngError(
        invocation,
        'INVALID_WORKS_BY_ID',
        `worksById.${key} must be an own data property`,
        { path: `worksById.${key}` }
      );
    }
    snapshot.set(key, descriptor.value);
  }
  return snapshot;
}

function snapshotWork(value, expectedWorkId, invocation) {
  const path = `worksById.${expectedWorkId}`;
  assertPlainObject(value, path, invocation, 'INVALID_WORK');
  const workId = ownDataValue(value, 'workId', path, invocation, { code: 'INVALID_WORK' });
  if (workId !== expectedWorkId) {
    throw pngError(invocation, 'INVALID_WORK', `${path}.workId does not match its key`, {
      path: `${path}.workId`
    });
  }
  const title = ownDataValue(value, 'title', path, invocation, { code: 'INVALID_WORK' });
  if (typeof title !== 'string' || title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw pngError(invocation, 'INVALID_WORK', `${path}.title is invalid`, {
      path: `${path}.title`
    });
  }
  const localMediaKind = Object.getOwnPropertyDescriptor(value, 'localMediaKind')?.value;
  const coverDescriptor = Object.getOwnPropertyDescriptor(value, 'coverPath');
  const isLocalCustom = localMediaKind === 'custom';
  if (!isLocalCustom && (
    !coverDescriptor
    || !Object.hasOwn(coverDescriptor, 'value')
    || typeof coverDescriptor.value !== 'string'
    || coverDescriptor.value.length === 0
    || coverDescriptor.value.length > MAX_COVER_PATH_LENGTH
  )) {
    throw pngError(invocation, 'MISSING_COVER_PATH', `${path}.coverPath is required`, {
      path: `${path}.coverPath`
    });
  }
  const coverWidth = ownDataValue(value, 'coverWidth', path, invocation, {
    code: 'UNSAFE_DIMENSIONS'
  });
  const coverHeight = ownDataValue(value, 'coverHeight', path, invocation, {
    code: 'UNSAFE_DIMENSIONS'
  });
  for (const [field, dimension] of [['coverWidth', coverWidth], ['coverHeight', coverHeight]]) {
    if (
      !Number.isSafeInteger(dimension)
      || dimension <= 0
      || dimension > PNG_LIMITS.maxDimension
    ) {
      throw pngError(invocation, 'UNSAFE_DIMENSIONS', `${path}.${field} is unsafe`, {
        path: `${path}.${field}`
      });
    }
  }
  return {
    workId,
    title,
    coverPath: isLocalCustom ? `local:${workId}` : coverDescriptor.value,
    localMediaKind: isLocalCustom ? 'custom' : null,
    coverWidth,
    coverHeight
  };
}

function takeTextLine(text, lineLength) {
  const characters = Array.from(text);
  if (characters.length <= lineLength) {
    return { line: text.trim(), rest: '' };
  }
  const candidate = characters.slice(0, lineLength).join('');
  const breakIndex = candidate.lastIndexOf(' ');
  const useBreak = breakIndex >= Math.floor(lineLength / 2);
  const end = useBreak ? breakIndex : lineLength;
  return {
    line: characters.slice(0, end).join('').trim(),
    rest: characters.slice(useBreak ? end + 1 : end).join('').trimStart()
  };
}

function planTwoLines(text, lineLength) {
  const normalized = text.trim().replace(/\s+/gu, ' ');
  const first = takeTextLine(normalized, lineLength);
  if (first.rest.length === 0) {
    return { lines: [first.line], clipped: false };
  }
  const second = takeTextLine(first.rest, lineLength);
  return {
    lines: [first.line, second.line],
    clipped: second.rest.length > 0
  };
}

function planTitle(title) {
  return planTwoLines(title, TITLE_LINE_LENGTH);
}

function planTierName(name) {
  return planTwoLines(name, TIER_NAME_LINE_LENGTH);
}

function snapshotPresentation(value, invocation) {
  if (value === undefined) return { showTitles: true, annotations: Object.freeze({}) };
  assertPlainObject(value, 'input.presentation', invocation);
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(['showCounts', 'showTitles', 'annotations', 'immersive']);
  const completeSnapshot = keys.length === allowed.size;
  const compactSnapshot = keys.length === 2
    && keys.includes('showTitles')
    && keys.includes('annotations');
  if ((!completeSnapshot && !compactSnapshot) || keys.some(key => typeof key !== 'string' || !allowed.has(key))) {
    throw pngError(invocation, 'INVALID_INPUT', 'input.presentation has unknown or missing fields', {
      path: 'input.presentation'
    });
  }
  const showTitles = ownDataValue(value, 'showTitles', 'input.presentation', invocation);
  if (typeof showTitles !== 'boolean') {
    throw pngError(invocation, 'INVALID_INPUT', 'input.presentation.showTitles must be a boolean', {
      path: 'input.presentation.showTitles'
    });
  }
  if (completeSnapshot) {
    for (const field of ['showCounts', 'immersive']) {
      if (typeof ownDataValue(value, field, 'input.presentation', invocation) !== 'boolean') {
        throw pngError(invocation, 'INVALID_INPUT', `input.presentation.${field} must be a boolean`, {
          path: `input.presentation.${field}`
        });
      }
    }
  }
  const source = ownDataValue(value, 'annotations', 'input.presentation', invocation);
  assertPlainObject(source, 'input.presentation.annotations', invocation);
  const annotationKeys = Reflect.ownKeys(source);
  if (annotationKeys.length > ANNOTATION_MAX_ITEMS) {
    throw pngError(invocation, 'INVALID_INPUT', 'input.presentation.annotations exceeds its limit', {
      path: 'input.presentation.annotations'
    });
  }
  const annotations = Object.create(null);
  for (const workId of annotationKeys) {
    if (
      typeof workId !== 'string'
      || !SAFE_ID_PATTERN.test(workId)
      || workId.length > MAX_ID_LENGTH
      || UNSAFE_KEYS.has(workId)
    ) {
      throw pngError(invocation, 'INVALID_INPUT', 'annotation work ID is invalid', {
        path: 'input.presentation.annotations'
      });
    }
    const valueAtKey = ownDataValue(source, workId, 'input.presentation.annotations', invocation);
    const normalized = normalizeAnnotation(valueAtKey);
    if (normalized.length === 0 || normalized !== valueAtKey) {
      throw pngError(invocation, 'INVALID_INPUT', 'annotation value is invalid', {
        path: `input.presentation.annotations.${workId}`
      });
    }
    annotations[workId] = annotationLines(normalized);
  }
  return { showTitles, annotations };
}

function validateDimensions(logicalWidth, logicalHeight, pixelRatio, invocation) {
  if (
    !Number.isSafeInteger(logicalWidth)
    || logicalWidth < (
      (LAYOUT.outerPadding * 2)
      + LAYOUT.tierLabelWidth
      + LAYOUT.gap
      + LAYOUT.itemSize
    )
    || logicalWidth > PNG_LIMITS.logicalMaxWidth
    || !Number.isSafeInteger(logicalHeight)
    || logicalHeight <= 0
    || typeof pixelRatio !== 'number'
    || !Number.isFinite(pixelRatio)
    || pixelRatio <= 0
    || pixelRatio > PNG_LIMITS.pixelRatio
  ) {
    throw pngError(invocation, 'UNSAFE_DIMENSIONS', 'PNG logical dimensions are unsafe');
  }
  const pixelWidth = Math.ceil(logicalWidth * pixelRatio);
  const pixelHeight = Math.ceil(logicalHeight * pixelRatio);
  if (
    !Number.isSafeInteger(pixelWidth)
    || !Number.isSafeInteger(pixelHeight)
    || pixelWidth > PNG_LIMITS.maxDimension
    || pixelHeight > PNG_LIMITS.maxDimension
    || pixelWidth * pixelHeight > PNG_LIMITS.maxPixels
  ) {
    throw pngError(invocation, 'UNSAFE_DIMENSIONS', 'PNG pixel dimensions are unsafe');
  }
  return { pixelWidth, pixelHeight };
}

function freezePlan(plan) {
  for (const tier of plan.tiers) {
    for (const item of tier.items) {
      Object.freeze(item.titleLines);
      Object.freeze(item.titleStrip);
      Object.freeze(item.annotationLines);
      Object.freeze(item);
    }
    Object.freeze(tier.items);
    Object.freeze(tier.label.nameLines);
    Object.freeze(tier.label);
    Object.freeze(tier);
  }
  for (const cover of plan.covers) {
    Object.freeze(cover.workIds);
    Object.freeze(cover);
  }
  Object.freeze(plan.tiers);
  Object.freeze(plan.covers);
  return Object.freeze(plan);
}

export function planTierPng(input) {
  return withSyncBoundary(invocation => {
    assertPlainObject(input, 'input', invocation);
    const keys = Reflect.ownKeys(input);
    const allowed = new Set(['tiers', 'tierOrder', 'worksById', 'logicalMaxWidth', 'pixelRatio', 'presentation']);
    if (keys.some(key => typeof key !== 'string' || !allowed.has(key))) {
      throw pngError(invocation, 'INVALID_INPUT', 'PNG plan input contains unknown fields', {
        path: 'input'
      });
    }
    const tierDefinitions = snapshotTiers(
      ownDataValue(input, 'tiers', 'input', invocation),
      invocation
    );
    const tierOrder = snapshotTierOrder(
      ownDataValue(input, 'tierOrder', 'input', invocation),
      tierDefinitions,
      invocation
    );
    const workRegistry = snapshotWorksById(
      ownDataValue(input, 'worksById', 'input', invocation),
      invocation
    );
    const presentation = snapshotPresentation(
      ownDataValue(input, 'presentation', 'input', invocation, {
        optional: true,
        defaultValue: undefined
      }),
      invocation
    );
    const logicalWidth = ownDataValue(input, 'logicalMaxWidth', 'input', invocation, {
      optional: true,
      defaultValue: PNG_LIMITS.logicalMaxWidth
    });
    const pixelRatio = ownDataValue(input, 'pixelRatio', 'input', invocation, {
      optional: true,
      defaultValue: PNG_LIMITS.pixelRatio
    });
    if (
      !Number.isSafeInteger(logicalWidth)
      || logicalWidth > PNG_LIMITS.logicalMaxWidth
      || typeof pixelRatio !== 'number'
      || !Number.isFinite(pixelRatio)
      || pixelRatio <= 0
      || pixelRatio > PNG_LIMITS.pixelRatio
    ) {
      throw pngError(invocation, 'UNSAFE_DIMENSIONS', 'PNG dimensions are unsafe');
    }

    const contentWidth = logicalWidth
      - (LAYOUT.outerPadding * 2)
      - LAYOUT.tierLabelWidth
      - LAYOUT.gap;
    const columns = Math.floor((contentWidth + LAYOUT.gap) / (LAYOUT.itemSize + LAYOUT.gap));
    if (columns < 1) {
      throw pngError(invocation, 'UNSAFE_DIMENSIONS', 'PNG width cannot fit one ranked item');
    }

    const tierGeometry = [];
    let cursorY = LAYOUT.outerPadding;
    for (const tier of tierDefinitions) {
      const rowCount = Math.max(1, Math.ceil(tierOrder[tier.id].length / columns));
      const height = (rowCount * LAYOUT.itemSize) + ((rowCount - 1) * LAYOUT.gap);
      tierGeometry.push({ tier, y: cursorY, height });
      cursorY += height + LAYOUT.gap;
    }
    const logicalHeight = cursorY - LAYOUT.gap + LAYOUT.outerPadding;
    const { pixelWidth, pixelHeight } = validateDimensions(
      logicalWidth,
      logicalHeight,
      pixelRatio,
      invocation
    );

    const coverRecords = new Map();
    const tiers = [];
    for (const geometry of tierGeometry) {
      const { tier } = geometry;
      const tierId = tier.id;
      const items = [];
      for (let index = 0; index < tierOrder[tierId].length; index += 1) {
        const workId = tierOrder[tierId][index];
        if (!workRegistry.has(workId)) {
          throw pngError(
            invocation,
            'UNKNOWN_WORK_ID',
            `work ID ${workId} is not present in worksById`,
            { path: `tierOrder.${tierId}[${index}]` }
          );
        }
        const snapshot = snapshotWork(workRegistry.get(workId), workId, invocation);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = LAYOUT.outerPadding
          + LAYOUT.tierLabelWidth
          + LAYOUT.gap
          + (column * (LAYOUT.itemSize + LAYOUT.gap));
        const y = geometry.y + (row * (LAYOUT.itemSize + LAYOUT.gap));
        const title = planTitle(snapshot.title);
        const titleStripHeight = presentation.showTitles ? LAYOUT.titleStripHeight : 0;
        items.push({
          workId,
          title: snapshot.title,
          coverPath: snapshot.coverPath,
          coverWidth: snapshot.coverWidth,
          coverHeight: snapshot.coverHeight,
          x,
          y,
          width: LAYOUT.itemSize,
          height: LAYOUT.itemSize,
          titleStrip: {
            x,
            y: y + LAYOUT.itemSize - titleStripHeight,
            width: LAYOUT.itemSize,
            height: titleStripHeight
          },
          titleLines: title.lines,
          titleClipped: title.clipped,
          annotationLines: presentation.annotations[workId] ?? []
        });
        const existingCover = coverRecords.get(snapshot.coverPath);
        if (existingCover) {
          existingCover.workIds.push(workId);
        } else {
          coverRecords.set(snapshot.coverPath, {
            coverPath: snapshot.coverPath,
            coverWidth: snapshot.coverWidth,
            coverHeight: snapshot.coverHeight,
            workIds: [workId],
            work: snapshot
          });
        }
      }
      const tierName = planTierName(tier.name);
      tiers.push({
        id: tier.id,
        tierId: tier.id,
        name: tier.name,
        colorId: tier.colorId,
        palette: tier.palette,
        background: tier.palette.background,
        foreground: tier.palette.foreground,
        color: tier.palette.background,
        x: LAYOUT.outerPadding,
        y: geometry.y,
        width: logicalWidth - (LAYOUT.outerPadding * 2),
        height: geometry.height,
        label: {
          x: LAYOUT.outerPadding,
          y: geometry.y,
          width: LAYOUT.tierLabelWidth,
          height: geometry.height,
          nameLines: tierName.lines,
          nameClipped: tierName.clipped
        },
        items,
        works: items
      });
    }

    const internalPlan = {
      logicalWidth,
      logicalHeight,
      pixelRatio,
      pixelWidth,
      pixelHeight,
      columns,
      showTitles: presentation.showTitles,
      tiers,
      covers: [...coverRecords.values()]
    };
    const publicPlan = freezePlan({
      logicalWidth,
      logicalHeight,
      pixelRatio,
      pixelWidth,
      pixelHeight,
      columns,
      showTitles: presentation.showTitles,
      tiers,
      covers: internalPlan.covers
    });
    PLAN_RECORDS.set(publicPlan, internalPlan);
    return publicPlan;
  });
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function buildPngFilename(now = new Date()) {
  return withSyncBoundary(invocation => {
    if (now === null || typeof now !== 'object' || Object.getPrototypeOf(now) !== Date.prototype) {
      throw pngError(invocation, 'INVALID_DATE', 'now must be a standard Date');
    }
    const timestamp = Date.prototype.getTime.call(now);
    if (!Number.isFinite(timestamp)) {
      throw pngError(invocation, 'INVALID_DATE', 'now must be a valid Date');
    }
    const year = Date.prototype.getFullYear.call(now);
    if (!Number.isInteger(year) || year < 0 || year > 9999) {
      throw pngError(invocation, 'INVALID_DATE', 'now year must be between 0000 and 9999');
    }
    const yearText = String(year).padStart(4, '0');
    const month = pad(Date.prototype.getMonth.call(now) + 1);
    const day = pad(Date.prototype.getDate.call(now));
    const hour = pad(Date.prototype.getHours.call(now));
    const minute = pad(Date.prototype.getMinutes.call(now));
    return `egs-tier-list-${yearText}${month}${day}-${hour}${minute}.png`;
  });
}

function snapshotRenderOptions(value, invocation) {
  assertPlainObject(value, 'options', invocation, 'INVALID_RENDER_OPTIONS');
  const keys = Reflect.ownKeys(value);
  const allowed = new Set(['createCanvas', 'loadCover', 'fontsReady']);
  if (
    keys.length !== allowed.size
    || keys.some(key => typeof key !== 'string' || !allowed.has(key))
  ) {
    throw pngError(
      invocation,
      'INVALID_RENDER_OPTIONS',
      'render options must contain exactly createCanvas, loadCover, and fontsReady',
      { path: 'options' }
    );
  }
  const createCanvas = ownDataValue(value, 'createCanvas', 'options', invocation, {
    code: 'INVALID_RENDER_OPTIONS'
  });
  const loadCover = ownDataValue(value, 'loadCover', 'options', invocation, {
    code: 'INVALID_RENDER_OPTIONS'
  });
  const fontsReady = ownDataValue(value, 'fontsReady', 'options', invocation, {
    code: 'INVALID_RENDER_OPTIONS'
  });
  if (typeof createCanvas !== 'function' || typeof loadCover !== 'function') {
    throw pngError(
      invocation,
      'INVALID_RENDER_OPTIONS',
      'createCanvas and loadCover must be functions',
      { path: 'options' }
    );
  }
  return { createCanvas, loadCover, fontsReady };
}

function decodedCover(value) {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    throw new TypeError('decoded cover must be an image object');
  }
  const naturalWidth = value.naturalWidth;
  const naturalHeight = value.naturalHeight;
  const useFallback = naturalWidth === undefined && naturalHeight === undefined;
  const width = useFallback ? value.width : naturalWidth;
  const height = useFallback ? value.height : naturalHeight;
  if (
    typeof width !== 'number'
    || typeof height !== 'number'
    || !Number.isFinite(width)
    || !Number.isFinite(height)
    || width <= 0
    || height <= 0
  ) {
    throw new TypeError('decoded cover dimensions must be positive finite numbers');
  }
  return Object.freeze({ image: value, width, height });
}

function canvasMethod(canvasOrContext, field) {
  const method = canvasOrContext[field];
  return typeof method === 'function' ? method : null;
}

function snapshotCanvas(canvas, internalPlan, invocation) {
  if (canvas === null || (typeof canvas !== 'object' && typeof canvas !== 'function')) {
    throw pngError(invocation, 'CANVAS_CREATE_FAILED', 'createCanvas returned no canvas');
  }
  try {
    canvas.width = internalPlan.pixelWidth;
    canvas.height = internalPlan.pixelHeight;
    const getContext = canvasMethod(canvas, 'getContext');
    if (getContext === null) {
      throw new TypeError('canvas.getContext is unavailable');
    }
    const context = Reflect.apply(getContext, canvas, ['2d']);
    if (context === null || (typeof context !== 'object' && typeof context !== 'function')) {
      throw new TypeError('canvas 2D context is unavailable');
    }
    const methods = Object.create(null);
    for (const field of [
      'scale',
      'fillRect',
      'fillText',
      'strokeText',
      'drawImage',
      'save',
      'restore',
      'beginPath',
      'rect',
      'clip'
    ]) {
      const method = canvasMethod(context, field);
      if (method === null) {
        throw new TypeError(`canvas context.${field} is unavailable`);
      }
      methods[field] = method;
    }
    const convertToBlob = canvasMethod(canvas, 'convertToBlob');
    const toBlob = canvasMethod(canvas, 'toBlob');
    if (convertToBlob === null && toBlob === null) {
      throw new TypeError('canvas PNG encoder is unavailable');
    }
    return { canvas, context, methods, convertToBlob, toBlob };
  } catch (error) {
    throw pngError(
      invocation,
      'CANVAS_CREATE_FAILED',
      'Unable to create the final PNG canvas',
      { cause: error }
    );
  }
}

function callContext(contextState, method, args) {
  return Reflect.apply(contextState.methods[method], contextState.context, args);
}

function coverCrop(cover) {
  const size = Math.min(cover.width, cover.height);
  return {
    sourceX: (cover.width - size) / 2,
    sourceY: (cover.height - size) / 2,
    sourceSize: size
  };
}

function drawPlan(internalPlan, contextState, loadedCovers, invocation) {
  const context = contextState.context;
  try {
    callContext(contextState, 'scale', [internalPlan.pixelRatio, internalPlan.pixelRatio]);
    for (const tier of internalPlan.tiers) {
      context.fillStyle = TIER_BACKGROUND;
      callContext(contextState, 'fillRect', [tier.x, tier.y, tier.width, tier.height]);

      context.fillStyle = tier.background;
      callContext(contextState, 'fillRect', [
        tier.label.x,
        tier.label.y,
        tier.label.width,
        tier.label.height
      ]);
      callContext(contextState, 'save', []);
      try {
        callContext(contextState, 'beginPath', []);
        callContext(contextState, 'rect', [
          tier.label.x,
          tier.label.y,
          tier.label.width,
          tier.label.height
        ]);
        callContext(contextState, 'clip', []);
        context.lineWidth = 4;
        context.lineJoin = 'round';
        context.strokeStyle = '#000000';
        context.fillStyle = '#ffffff';
        context.font = '700 20px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const centerY = tier.label.y + (tier.label.height / 2);
        const firstLineY = centerY - ((tier.label.nameLines.length - 1) * 12);
        for (let lineIndex = 0; lineIndex < tier.label.nameLines.length; lineIndex += 1) {
          const textArgs = [
            tier.label.nameLines[lineIndex],
            tier.label.x + (tier.label.width / 2),
            firstLineY + (lineIndex * 24)
          ];
          callContext(contextState, 'strokeText', textArgs);
          callContext(contextState, 'fillText', textArgs);
        }
      } finally {
        callContext(contextState, 'restore', []);
      }

      for (const item of tier.items) {
        const cover = loadedCovers.get(item.coverPath);
        if (cover.missing) {
          context.fillStyle = MISSING_COVER_BACKGROUND;
          callContext(contextState, 'fillRect', [item.x, item.y, item.width, item.height]);
          context.fillStyle = MISSING_COVER_FOREGROUND;
          context.font = '700 13px sans-serif';
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          callContext(contextState, 'fillText', [
            'NO COVER',
            item.x + (item.width / 2),
            item.y + ((item.height - item.titleStrip.height) / 2)
          ]);
        } else {
          const crop = coverCrop(cover);
          callContext(contextState, 'drawImage', [
            cover.image,
            crop.sourceX,
            crop.sourceY,
            crop.sourceSize,
            crop.sourceSize,
            item.x,
            item.y,
            item.width,
            item.height
          ]);
        }

        if (internalPlan.showTitles) {
          context.fillStyle = TITLE_BACKGROUND;
          callContext(contextState, 'fillRect', [
            item.titleStrip.x,
            item.titleStrip.y,
            item.titleStrip.width,
            item.titleStrip.height
          ]);
          callContext(contextState, 'save', []);
          try {
            callContext(contextState, 'beginPath', []);
            callContext(contextState, 'rect', [
              item.titleStrip.x,
              item.titleStrip.y,
              item.titleStrip.width,
              item.titleStrip.height
            ]);
            callContext(contextState, 'clip', []);
            context.fillStyle = '#ffffff';
            context.font = '600 13px sans-serif';
            context.textAlign = 'left';
            context.textBaseline = 'alphabetic';
            for (let lineIndex = 0; lineIndex < item.titleLines.length; lineIndex += 1) {
              callContext(contextState, 'fillText', [
                item.titleLines[lineIndex],
                item.titleStrip.x + 6,
                item.titleStrip.y + 14 + (lineIndex * 16)
              ]);
            }
          } finally {
            callContext(contextState, 'restore', []);
          }
        }

        if (item.annotationLines.length > 0) {
          const coverHeight = item.height - item.titleStrip.height;
          const longestLine = Math.max(...item.annotationLines.map(line => Array.from(line).length));
          const fontSize = Math.max(12, Math.min(
            30,
            Math.floor((item.width - 16) / longestLine),
            Math.floor((coverHeight - 16) / (item.annotationLines.length * 1.25))
          ));
          const lineHeight = fontSize * 1.25;
          const centerY = item.y + (coverHeight / 2);
          const firstLineY = centerY - ((item.annotationLines.length - 1) * lineHeight / 2);
          context.lineWidth = Math.max(3, fontSize / 6);
          context.lineJoin = 'round';
          context.strokeStyle = '#000000';
          context.fillStyle = '#ffffff';
          context.font = `700 ${fontSize}px sans-serif`;
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          for (let lineIndex = 0; lineIndex < item.annotationLines.length; lineIndex += 1) {
            const textArgs = [
              item.annotationLines[lineIndex],
              item.x + (item.width / 2),
              firstLineY + (lineIndex * lineHeight)
            ];
            callContext(contextState, 'strokeText', textArgs);
            callContext(contextState, 'fillText', textArgs);
          }
        }
      }
    }
  } catch (error) {
    throw pngError(invocation, 'CANVAS_DRAW_FAILED', 'Unable to draw the PNG canvas', {
      cause: error
    });
  }
}

async function encodeCanvas(contextState, invocation) {
  try {
    let blob;
    if (contextState.convertToBlob !== null) {
      const encoded = Reflect.apply(contextState.convertToBlob, contextState.canvas, [{
        type: 'image/png'
      }]);
      blob = await Promise.resolve(encoded);
    } else {
      blob = await new Promise((resolve, reject) => {
        try {
          Reflect.apply(contextState.toBlob, contextState.canvas, [
            value => resolve(value),
            'image/png'
          ]);
        } catch (error) {
          reject(error);
        }
      });
    }
    if (blob === null || (typeof blob !== 'object' && typeof blob !== 'function')) {
      throw new TypeError('canvas PNG encoder returned no blob');
    }
    return blob;
  } catch (error) {
    throw pngError(invocation, 'PNG_ENCODE_FAILED', 'Unable to encode the PNG blob', {
      cause: error
    });
  }
}

export async function renderTierPng(plan, options) {
  const invocation = {};
  try {
    const internalPlan = (
      plan !== null
      && (typeof plan === 'object' || typeof plan === 'function')
    ) ? PLAN_RECORDS.get(plan) : undefined;
    if (internalPlan === undefined) {
      throw pngError(invocation, 'INVALID_PLAN', 'plan must come from planTierPng');
    }
    const { createCanvas, loadCover, fontsReady } = snapshotRenderOptions(options, invocation);

    let fontPromise;
    try {
      fontPromise = Promise.resolve(fontsReady);
    } catch (error) {
      fontPromise = Promise.reject(error);
    }
    const coverPromises = internalPlan.covers.map(cover => {
      try {
        const loaded = Reflect.apply(loadCover, undefined, [
          cover.coverPath,
          Object.freeze({
            coverPath: cover.coverPath,
            coverWidth: cover.coverWidth,
            coverHeight: cover.coverHeight,
            workIds: cover.workIds,
            work: cover.work
          })
        ]);
        return Promise.resolve(loaded).then(image => {
          return decodedCover(image);
        });
      } catch (error) {
        return Promise.reject(error);
      }
    });
    const settled = await Promise.allSettled([fontPromise, ...coverPromises]);
    const fontResult = settled[0];
    const coverResults = settled.slice(1);
    const loadedCovers = new Map();
    for (let index = 0; index < coverResults.length; index += 1) {
      const result = coverResults[index];
      const cover = internalPlan.covers[index];
      if (result.status === 'rejected') {
        loadedCovers.set(cover.coverPath, Object.freeze({ missing: true }));
      } else {
        loadedCovers.set(cover.coverPath, result.value);
      }
    }
    if (fontResult.status === 'rejected') {
      throw pngError(invocation, 'FONTS_READY_FAILED', 'Fonts were not ready for PNG export', {
        cause: fontResult.reason
      });
    }

    let canvas;
    try {
      canvas = Reflect.apply(createCanvas, undefined, [Object.freeze({
        width: internalPlan.pixelWidth,
        height: internalPlan.pixelHeight,
        logicalWidth: internalPlan.logicalWidth,
        logicalHeight: internalPlan.logicalHeight,
        pixelRatio: internalPlan.pixelRatio
      })]);
    } catch (error) {
      throw pngError(
        invocation,
        'CANVAS_CREATE_FAILED',
        'Unable to create the final PNG canvas',
        { cause: error }
      );
    }
    const contextState = snapshotCanvas(canvas, internalPlan, invocation);
    drawPlan(internalPlan, contextState, loadedCovers, invocation);
    const blob = await encodeCanvas(contextState, invocation);
    return Object.freeze({ canvas: contextState.canvas, blob });
  } catch (error) {
    if (INTERNAL_ERRORS.get(error) === invocation) {
      throw error;
    }
    throw pngError(invocation, 'UNEXPECTED_DEPENDENCY', 'Unexpected PNG render dependency failure', {
      cause: error
    });
  }
}

function snapshotExportInput(value) {
  return withSyncBoundary(invocation => {
    assertPlainObject(value, 'input', invocation);
    const allowed = new Set([
      'tiers',
      'tierOrder',
      'worksById',
      'logicalMaxWidth',
      'pixelRatio',
      'presentation',
      'now',
      'createCanvas',
      'loadCover',
      'fontsReady'
    ]);
    const keys = Reflect.ownKeys(value);
    if (keys.some(key => typeof key !== 'string' || !allowed.has(key))) {
      throw pngError(invocation, 'INVALID_INPUT', 'PNG export input contains unknown fields', {
        path: 'input'
      });
    }
    const planInput = {
      tiers: ownDataValue(value, 'tiers', 'input', invocation),
      tierOrder: ownDataValue(value, 'tierOrder', 'input', invocation),
      worksById: ownDataValue(value, 'worksById', 'input', invocation)
    };
    const logicalMaxWidth = ownDataValue(value, 'logicalMaxWidth', 'input', invocation, {
      optional: true
    });
    const pixelRatio = ownDataValue(value, 'pixelRatio', 'input', invocation, {
      optional: true
    });
    if (logicalMaxWidth !== undefined) planInput.logicalMaxWidth = logicalMaxWidth;
    if (pixelRatio !== undefined) planInput.pixelRatio = pixelRatio;
    const presentation = ownDataValue(value, 'presentation', 'input', invocation, {
      optional: true
    });
    if (presentation !== undefined) planInput.presentation = presentation;
    return {
      planInput,
      now: ownDataValue(value, 'now', 'input', invocation, {
        optional: true,
        defaultValue: new Date()
      }),
      renderOptions: {
        createCanvas: ownDataValue(value, 'createCanvas', 'input', invocation),
        loadCover: ownDataValue(value, 'loadCover', 'input', invocation),
        fontsReady: ownDataValue(value, 'fontsReady', 'input', invocation)
      }
    };
  });
}

export async function exportTierPng(input) {
  const snapshot = snapshotExportInput(input);
  const plan = planTierPng(snapshot.planInput);
  const filename = buildPngFilename(snapshot.now);
  const rendered = await renderTierPng(plan, snapshot.renderOptions);
  return Object.freeze({
    plan,
    filename,
    canvas: rendered.canvas,
    blob: rendered.blob
  });
}

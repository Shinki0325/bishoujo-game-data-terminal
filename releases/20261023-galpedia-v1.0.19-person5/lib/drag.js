function inputError(message, cause) {
  const options = cause === undefined ? undefined : { cause };
  return new TypeError(message, options);
}

function ownDataValue(object, key, label, { optional = false, defaultValue } = {}) {
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(object, key);
  } catch (error) {
    throw inputError(`${label} could not be inspected`, error);
  }
  if (descriptor === undefined) {
    if (optional) return defaultValue;
    throw inputError(`${label} must be an own data property`);
  }
  if (!Object.hasOwn(descriptor, 'value')) {
    throw inputError(`${label} must be an own data property`);
  }
  if (optional && descriptor.value === undefined) return defaultValue;
  return descriptor.value;
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw inputError(`${label} must be a finite number`);
  }
  return value;
}

function snapshotRect(rect, index) {
  if (rect === null || typeof rect !== 'object' || Array.isArray(rect)) {
    throw inputError(`cardRects[${index}] must be an object`);
  }
  const left = finiteNumber(
    ownDataValue(rect, 'left', `cardRects[${index}].left`),
    `cardRects[${index}].left`
  );
  const right = finiteNumber(
    ownDataValue(rect, 'right', `cardRects[${index}].right`),
    `cardRects[${index}].right`
  );
  if (right < left) {
    throw inputError(`cardRects[${index}].right must be greater than or equal to left`);
  }
  return { left, right };
}

function snapshotRects(cardRects) {
  let isArray;
  try {
    isArray = Array.isArray(cardRects);
  } catch (error) {
    throw inputError('cardRects could not be inspected', error);
  }
  if (!isArray) throw inputError('cardRects must be an array');
  let lengthDescriptor;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(cardRects, 'length');
  } catch (error) {
    throw inputError('cardRects could not be inspected', error);
  }
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0) {
    throw inputError('cardRects.length must be a safe non-negative integer');
  }
  const rects = [];
  for (let index = 0; index < length; index += 1) {
    const value = ownDataValue(cardRects, String(index), `cardRects[${index}]`);
    rects.push(snapshotRect(value, index));
  }
  return rects;
}

export function insertionIndexFromPoint(cardRects, pointerX) {
  const x = finiteNumber(pointerX, 'pointerX');
  const rects = snapshotRects(cardRects);
  for (let index = 0; index < rects.length; index += 1) {
    const center = rects[index].left + ((rects[index].right - rects[index].left) / 2);
    if (x <= center) return index;
  }
  return rects.length;
}

export function edgeScrollVelocity(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw inputError('options must be an object');
  }
  const pointerX = finiteNumber(ownDataValue(options, 'pointerX', 'pointerX'), 'pointerX');
  const left = finiteNumber(ownDataValue(options, 'left', 'left'), 'left');
  const right = finiteNumber(ownDataValue(options, 'right', 'right'), 'right');
  const threshold = finiteNumber(
    ownDataValue(options, 'threshold', 'threshold', { optional: true, defaultValue: 48 }),
    'threshold'
  );
  const maxSpeed = finiteNumber(
    ownDataValue(options, 'maxSpeed', 'maxSpeed', { optional: true, defaultValue: 18 }),
    'maxSpeed'
  );
  if (right <= left) throw inputError('right must be greater than left');
  if (threshold <= 0) throw inputError('threshold must be greater than zero');
  if (maxSpeed <= 0) throw inputError('maxSpeed must be greater than zero');

  if (pointerX <= left) return -maxSpeed;
  if (pointerX >= right) return maxSpeed;

  const leftDistance = pointerX - left;
  const rightDistance = right - pointerX;
  const nearLeft = leftDistance < threshold;
  const nearRight = rightDistance < threshold;
  if (!nearLeft && !nearRight) return 0;
  if (nearLeft && nearRight && leftDistance === rightDistance) return 0;

  const direction = nearLeft && (!nearRight || leftDistance < rightDistance) ? -1 : 1;
  const distance = direction < 0 ? leftDistance : rightDistance;
  const magnitude = Math.min(
    maxSpeed,
    Math.ceil(maxSpeed * ((threshold - distance) / threshold))
  );
  return direction * Math.max(0, magnitude);
}

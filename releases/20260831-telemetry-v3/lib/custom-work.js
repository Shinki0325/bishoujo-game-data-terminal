const CUSTOM_ID = /^custom-local-[a-z0-9-]{1,80}$/u;

export function titleFromFilename(value) {
  if (typeof value !== 'string') throw new TypeError('custom title must be a string');
  const title = value.normalize('NFKC').trim().replace(/\.(?:jpe?g|png|webp)$/iu, '').trim();
  if (title.length < 1 || title.length > 120) throw new RangeError('custom title must contain 1 to 120 characters');
  return title;
}

export function createCustomWork({ id, title, width, height }) {
  if (!CUSTOM_ID.test(id)) throw new TypeError('custom work ID is invalid');
  if (![width, height].every(Number.isSafeInteger) || Math.min(width, height) < 1) {
    throw new RangeError('custom dimensions must be positive safe integers');
  }
  return Object.freeze({
    workId: id,
    workGroupId: id,
    title: titleFromFilename(title),
    brandName: '自定义',
    localMediaKind: 'custom',
    coverWidth: width,
    coverHeight: height
  });
}

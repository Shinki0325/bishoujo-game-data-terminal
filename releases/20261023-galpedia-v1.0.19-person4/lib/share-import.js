const MODES = new Set(['append', 'replace']);

export class ShareImportError extends Error {
  constructor(message, code = 'INVALID_SHARE_IMPORT') {
    super(message);
    this.name = 'ShareImportError';
    this.code = code;
  }
}

function requireIds(value, name) {
  if (!Array.isArray(value)) throw new ShareImportError(`${name} must be an Array`, 'INVALID_ARRAY');
  for (const id of value) {
    if (typeof id !== 'string' || id.length === 0) {
      throw new ShareImportError(`${name} must contain non-empty string IDs`, 'INVALID_ID');
    }
  }
  return value;
}

function uniqueIds(ids) {
  return [...new Set(ids)];
}

export function planSharedSelectionImport({
  sharedWorkIds,
  authorityWorkIds,
  currentSelectedWorkIds,
  mode
}) {
  if (!MODES.has(mode)) throw new ShareImportError('mode must be append or replace', 'INVALID_MODE');
  const shared = uniqueIds(requireIds(sharedWorkIds, 'sharedWorkIds'));
  const authority = new Set(uniqueIds(requireIds(authorityWorkIds, 'authorityWorkIds')));
  const current = uniqueIds(requireIds(currentSelectedWorkIds, 'currentSelectedWorkIds'));
  const validWorkIds = shared.filter(workId => authority.has(workId));
  const missingWorkIds = shared.filter(workId => !authority.has(workId));
  if (validWorkIds.length === 0) {
    throw new ShareImportError('share contains no valid works in the current catalog', 'NO_VALID_WORKS');
  }

  const nextSelectedWorkIds = mode === 'replace'
    ? [...validWorkIds]
    : [...current, ...validWorkIds.filter(workId => !current.includes(workId))];
  return Object.freeze({
    mode,
    validWorkIds: Object.freeze([...validWorkIds]),
    missingWorkIds: Object.freeze([...missingWorkIds]),
    nextSelectedWorkIds: Object.freeze([...nextSelectedWorkIds])
  });
}

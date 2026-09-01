import { USER_WORK_LIMIT } from './work-limit.js';

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const SHARE_PAYLOAD_VERSION = 1;

export const MAX_SHARED_WORK_IDS = USER_WORK_LIMIT;
export const SHARE_PREFIX = 'v1.';

export class ShareSelectionError extends Error {
  constructor(message, code = 'INVALID_SHARE') {
    super(message);
    this.name = 'ShareSelectionError';
    this.code = code;
  }
}

function assertSafeString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || !SAFE_ID_PATTERN.test(value)) {
    throw new ShareSelectionError(`${name} must be a safe non-empty string`, 'INVALID_FIELD');
  }
}

function normalizeWorkIds(workIds) {
  if (!Array.isArray(workIds) || workIds.length === 0) {
    throw new ShareSelectionError('workIds must contain at least one work ID', 'EMPTY_WORK_IDS');
  }
  if (workIds.length > MAX_SHARED_WORK_IDS) {
    throw new ShareSelectionError(
      `workIds cannot contain more than ${MAX_SHARED_WORK_IDS} IDs`,
      'WORK_LIMIT'
    );
  }
  const seen = new Set();
  const normalized = [];
  for (const workId of workIds) {
    assertSafeString(workId, 'work ID');
    if (seen.has(workId)) {
      throw new ShareSelectionError(`workIds contains duplicate ID ${workId}`, 'DUPLICATE_ID');
    }
    seen.add(workId);
    normalized.push(workId);
  }
  return normalized;
}

function encodeBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  if (typeof globalThis.btoa === 'function') return globalThis.btoa(binary);
  if (typeof globalThis.Buffer !== 'undefined') return globalThis.Buffer.from(bytes).toString('base64');
  throw new ShareSelectionError('base64 encoding is unavailable', 'ENCODING_UNAVAILABLE');
}

function decodeBytes(value) {
  let binary;
  try {
    if (typeof globalThis.atob === 'function') binary = globalThis.atob(value);
    else if (typeof globalThis.Buffer !== 'undefined') binary = globalThis.Buffer.from(value, 'base64').toString('binary');
    else throw new Error('base64 decoding is unavailable');
  } catch (error) {
    throw new ShareSelectionError('share payload is malformed', 'MALFORMED_SHARE');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function toBase64Url(bytes) {
  return encodeBytes(bytes).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/gu, '');
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new ShareSelectionError('share payload is malformed', 'MALFORMED_SHARE');
  }
  const padded = value.replace(/-/gu, '+').replace(/_/gu, '/')
    + '='.repeat((4 - (value.length % 4)) % 4);
  return decodeBytes(padded);
}

function checksumFor(datasetVersion, workIds) {
  const canonical = JSON.stringify({ datasetVersion, workIds });
  const bytes = new TextEncoder().encode(canonical);
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function payloadObject(datasetVersion, workIds) {
  return {
    v: SHARE_PAYLOAD_VERSION,
    datasetVersion,
    workIds,
    checksum: checksumFor(datasetVersion, workIds)
  };
}

function validateDecodedPayload(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new ShareSelectionError('share payload is malformed', 'MALFORMED_SHARE');
  }
  const keys = Object.keys(value).sort();
  if (keys.join(',') !== 'checksum,datasetVersion,v,workIds') {
    throw new ShareSelectionError('share payload has an invalid shape', 'MALFORMED_SHARE');
  }
  if (value.v !== SHARE_PAYLOAD_VERSION) {
    throw new ShareSelectionError('share payload version is unsupported', 'UNSUPPORTED_VERSION');
  }
  assertSafeString(value.datasetVersion, 'datasetVersion');
  const workIds = normalizeWorkIds(value.workIds);
  if (typeof value.checksum !== 'string' || !/^[0-9a-f]{8}$/u.test(value.checksum)) {
    throw new ShareSelectionError('share payload checksum is malformed', 'INVALID_CHECKSUM');
  }
  if (value.checksum !== checksumFor(value.datasetVersion, workIds)) {
    throw new ShareSelectionError('share payload checksum does not match', 'CHECKSUM_MISMATCH');
  }
  return { version: SHARE_PAYLOAD_VERSION, datasetVersion: value.datasetVersion, workIds };
}

export function encodeSelectionShare({ datasetVersion, workIds }) {
  assertSafeString(datasetVersion, 'datasetVersion');
  const normalizedIds = normalizeWorkIds(workIds);
  const json = JSON.stringify(payloadObject(datasetVersion, normalizedIds));
  return `${SHARE_PREFIX}${toBase64Url(new TextEncoder().encode(json))}`;
}

export function decodeSelectionShare(token) {
  if (typeof token !== 'string' || !token.startsWith(SHARE_PREFIX)) {
    throw new ShareSelectionError('share token is invalid', 'MALFORMED_SHARE');
  }
  const encoded = token.slice(SHARE_PREFIX.length);
  let parsed;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
  } catch (error) {
    if (error instanceof ShareSelectionError) throw error;
    throw new ShareSelectionError('share payload is malformed', 'MALFORMED_SHARE');
  }
  const validated = validateDecodedPayload(parsed);
  return Object.freeze({
    ...validated,
    workIds: Object.freeze([...validated.workIds])
  });
}

export function buildSelectionShareUrl({ baseUrl, datasetVersion, workIds }) {
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    throw new TypeError('baseUrl must be a non-empty string');
  }
  const currentHref = typeof globalThis.location?.href === 'string'
    ? globalThis.location.href
    : null;
  const url = currentHref ? new URL(baseUrl, currentHref) : new URL(baseUrl);
  url.search = '';
  url.hash = `share=${encodeSelectionShare({ datasetVersion, workIds })}`;
  return url.toString();
}

export function parseSelectionShare(locationLike) {
  const hash = typeof locationLike?.hash === 'string' ? locationLike.hash : '';
  if (!hash.startsWith('#share=')) return null;
  const token = hash.slice('#share='.length);
  return token.length > 0 ? token : null;
}

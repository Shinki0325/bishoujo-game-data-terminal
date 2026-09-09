// Integration tests consume the active published payload, not historical root
// carriers left beside an immutable release, nor a private backend export.
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const head = JSON.parse(readFileSync(new URL('release-head.json', root), 'utf8'));
if (!/^[A-Za-z0-9._-]+$/.test(head.releaseId)) throw new Error('invalid fixture release');
export const runtimePayloadTestRoot = new URL(`releases/${head.releaseId}/`, root);

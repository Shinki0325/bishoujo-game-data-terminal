import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createProjectResources } from './project-resources.js';
import { DATA_URLS, RUNTIME_FEATURES, DATA_REVISION } from './runtime-config.js?v=a6ad209572ec5b7a1d0e223bff884b78f1315d3b56ca25dd3e2d6edcbf2c2952';

const sources = new Map();
async function diskSource(url) {
  const key = String(url);
  if (!sources.has(key)) sources.set(key, (async () => {
    const bytes = await readFile(url);
    return { value: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
  })());
  return sources.get(key);
}
const catalogSource = await diskSource(DATA_URLS.catalog);
function setup(extra = {}) {
  const calls = [], warnings = [], infos = [];
  const resources = createProjectResources({
    catalogSource,
    fetchSource: async (url, label) => { calls.push(label); return diskSource(url); },
    logger: { warn: (...args) => warnings.push(args), info: (...args) => infos.push(args) },
    ...extra
  });
  return { resources, calls, warnings, infos };
}

test('construction is lazy; concurrent character/identity reads share validated results', async () => {
  const { resources: r, calls, warnings } = setup();
  assert.deepEqual(calls, []);
  assert.equal(r.current, null);
  const images = r.loadCharacterImages(), identity = r.loadIdentityCrosswalk();
  assert.equal(images, r.loadCharacterImages());
  assert.equal(identity, r.loadIdentityCrosswalk());
  const [map, crosswalk] = await Promise.all([images, identity]);
  assert.ok(map.mappingCount > 0);
  assert.ok(crosswalk);
  assert.equal(await r.loadCharacterImages(), map);
  assert.equal(await r.loadIdentityCrosswalk(), crosswalk);
  assert.deepEqual(calls.sort(), ['人物角色身份映射', '角色图片别名映射', '角色图片映射'].sort());
  assert.deepEqual(warnings, []);
  assert.equal(r.current, null, 'optional mappings must not load the media runtime');
});

for (const [method, label] of [
  ['loadCharacterImages', '角色图片映射'],
  ['loadCharacterImages', '角色图片别名映射'],
  ['loadIdentityCrosswalk', '人物角色身份映射']
]) test(`${label}: wrong pin returns null, retry recovers without caching failure`, async () => {
  let corrupt = true, reads = 0;
  const { resources: r, warnings } = setup({ fetchSource: async (url, name) => {
    const source = await diskSource(url);
    if (name !== label) return source;
    reads++;
    return corrupt ? { ...source, sha256: '0'.repeat(64) } : source;
  } });
  assert.equal(await r[method](), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][1].message, /hash/);
  corrupt = false;
  const pending = r[method]();
  assert.equal(r[method](), pending);
  assert.ok(await pending);
  assert.equal(reads, 2);
});

test('optional HTTP and schema failures retain null semantics and remain independently retryable', async () => {
  let fail = true;
  const { resources: r, warnings } = setup({ fetchSource: async (url, label) => {
    if (fail && label === '角色图片映射') throw Error('HTTP 503');
    const source = await diskSource(url);
    return fail && label === '人物角色身份映射' ? { ...source, value: {} } : source;
  } });
  assert.deepEqual(await Promise.all([r.loadCharacterImages(), r.loadIdentityCrosswalk()]), [null, null]);
  assert.equal(warnings.length, 2);
  fail = false;
  assert.ok(await r.loadIdentityCrosswalk());
  assert.ok(await r.loadCharacterImages());
});

test('disabled image/media features perform no source reads or module imports', async () => {
  const { resources: r, calls } = setup({
    features: { ...RUNTIME_FEATURES, projectEntitiesV1: { enabled: false, characterImages: true, mediaClearance: true } },
    loadRuntimeModule: () => { throw Error('unexpected module'); }
  });
  assert.equal(await r.loadCharacterImages(), null);
  assert.equal(await r.ensureRuntime(), null);
  assert.equal(r.current, null);
  assert.deepEqual(calls, []);
});

test('media proof uses the original verified catalog in legacy mode and publishes only the completed runtime', async () => {
  const { resources: r, calls, infos } = setup();
  const pending = r.ensureRuntime();
  assert.equal(r.ensureRuntime(), pending);
  assert.equal(r.current, null);
  const runtime = await pending;
  assert.equal(runtime, r.current);
  assert.equal(runtime, await r.ensureRuntime());
  assert.equal(runtime.binding.catalogSha256, catalogSource.sha256);
  assert.equal(runtime.runtimeDataRevision, DATA_REVISION);
  assert.equal(runtime.audit.canonicalWorkCount, catalogSource.value.works.length);
  assert.equal(runtime.audit.clearanceStatus, 'cleared');
  assert.deepEqual(calls, ['G1 media clearance bridge']);
  assert.equal(infos.length, 1);
});

test('demand mode fetches the full proof catalog lazily and retains the source binding', async () => {
  const { resources: r, calls } = setup({ requiresCatalogFetch: true, catalogSource: { sha256: catalogSource.sha256, value: null } });
  assert.deepEqual(calls, []);
  const runtime = await r.ensureRuntime();
  assert.deepEqual(calls, ['G1 media clearance bridge', '作品详情校验目录']);
  assert.equal(runtime.binding.catalogSha256, catalogSource.sha256);
});

for (const label of ['G1 media clearance bridge', '作品详情校验目录']) test(`${label}: wrong proof pin rejects and cannot publish a runtime`, async () => {
  let corrupt = true;
  const attempts = [];
  const { resources: r } = setup({ requiresCatalogFetch: true,
    fetchSource: async (url, name) => {
      const source = await diskSource(url);
      return corrupt && name === label ? { ...source, sha256: '0'.repeat(64) } : source;
    },
    loadRuntimeModule: async attempt => { attempts.push(attempt); return import('./project-entity-runtime.js'); }
  });
  await assert.rejects(r.ensureRuntime(), error => error.message === 'G1 media clearance bridge rejected' && /hash/.test(error.cause.message));
  assert.equal(r.current, null);
  corrupt = false;
  assert.ok(await r.ensureRuntime());
  assert.deepEqual(attempts, [0, 1]);
});

test('module import failure retries; media failure never poisons the optional mappings', async () => {
  const attempts = [];
  const { resources: r } = setup({ loadRuntimeModule: async attempt => {
    attempts.push(attempt);
    if (attempt === 0) throw Error('module unavailable');
    return import('./project-entity-runtime.js');
  } });
  await assert.rejects(r.ensureRuntime(), error => error.cause.message === 'module unavailable');
  const identity = await r.loadIdentityCrosswalk();
  assert.ok(identity);
  assert.ok(await r.ensureRuntime());
  assert.equal(await r.loadIdentityCrosswalk(), identity);
  assert.deepEqual(attempts, [0, 1]);
});

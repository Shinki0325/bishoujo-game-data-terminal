import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchStagedRuntimeCoreSources } from '../main.js';

const catalogSource = Object.freeze({
  sha256: 'a'.repeat(64),
  value: {
    snapshot: { snapshotId: 'catalog-fixture' },
    works: [{ workId: '1' }, { workId: '2' }]
  }
});

const admissionsSource = Object.freeze({
  sha256: 'b'.repeat(64),
  value: { schemaVersion: 'fixture-admissions-v1' }
});

function createRequiredLoader(calls) {
  return async (url, label) => {
    calls.push({ kind: 'required', url, label });
    if (url === '/catalog.json') return catalogSource;
    if (url === '/indexes.json') return { value: { indexes: true }, sha256: 'c'.repeat(64) };
    if (url === '/assets-manifest.json') return { value: { assets: true }, sha256: 'd'.repeat(64) };
    throw new Error(`unexpected required URL: ${url}`);
  };
}

function stagedSources(options = {}) {
  const calls = options.calls ?? [];
  const warnings = options.warnings ?? [];
  return {
    calls,
    warnings,
    result: fetchStagedRuntimeCoreSources({
      catalogUrl: '/catalog.json',
      admissionsUrl: '/admissions.json',
      indexesUrl: '/indexes.json',
      assetsManifestUrl: '/assets-manifest.json',
      fetchRequired: createRequiredLoader(calls),
      warn: (...args) => warnings.push(args),
      ...options
    })
  };
}

test('valid admissions skips legacy indexes and assets-manifest carriers', async () => {
  const calls = [];
  const preparedAdmissions = Object.freeze({ works: [{ workId: '29131' }] });
  const scenario = stagedSources({
    calls,
    fetchOptional: async (url, label) => {
      calls.push({ kind: 'optional', url, label });
      return admissionsSource;
    },
    prepareAdmissions(value, context) {
      assert.equal(value, admissionsSource.value);
      assert.deepEqual(context, {
        catalogSnapshotId: 'catalog-fixture',
        catalogSha256: catalogSource.sha256,
        workIds: ['1', '2']
      });
      return preparedAdmissions;
    }
  });

  const loaded = await scenario.result;

  assert.equal(loaded.catalogSource, catalogSource);
  assert.equal(loaded.admissions, preparedAdmissions);
  assert.equal(loaded.backendIndexesSource, null);
  assert.equal(loaded.assetsManifestSource, null);
  assert.equal(loaded.useCoreFallback, false);
  assert.deepEqual(scenario.calls.map(call => call.url), ['/catalog.json', '/admissions.json']);
  assert.equal(scenario.warnings.length, 0);
});

test('absent admissions retains the core fallback carriers', async () => {
  const calls = [];
  const scenario = stagedSources({
    calls,
    fetchOptional: async (url, label) => {
      calls.push({ kind: 'optional', url, label });
      return null;
    },
    prepareAdmissions() {
      throw new Error('absent sidecars must not be prepared');
    }
  });

  const loaded = await scenario.result;

  assert.equal(loaded.admissions, null);
  assert.equal(loaded.useCoreFallback, true);
  assert.deepEqual(loaded.backendIndexesSource.value, { indexes: true });
  assert.deepEqual(loaded.assetsManifestSource.value, { assets: true });
  assert.deepEqual(scenario.calls.map(call => call.url), [
    '/catalog.json',
    '/admissions.json',
    '/indexes.json',
    '/assets-manifest.json'
  ]);
  assert.equal(scenario.warnings.length, 0);
});

test('invalid admissions warns once and retains the core fallback carriers', async () => {
  const calls = [];
  const rejection = new Error('fixture validation failure');
  const scenario = stagedSources({
    calls,
    fetchOptional: async (url, label) => {
      calls.push({ kind: 'optional', url, label });
      return admissionsSource;
    },
    prepareAdmissions() {
      throw rejection;
    }
  });

  const loaded = await scenario.result;

  assert.equal(loaded.admissions, null);
  assert.equal(loaded.useCoreFallback, true);
  assert.equal(loaded.backendIndexesSource.value.indexes, true);
  assert.equal(loaded.assetsManifestSource.value.assets, true);
  assert.deepEqual(scenario.calls.map(call => call.url), [
    '/catalog.json',
    '/admissions.json',
    '/indexes.json',
    '/assets-manifest.json'
  ]);
  assert.equal(scenario.warnings.length, 1);
  assert.equal(scenario.warnings[0][0], 'VNDB admissions sidecar rejected; loading core fallback carriers');
  assert.equal(scenario.warnings[0][1], rejection);
});

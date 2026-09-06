import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLazyResource } from './lazy-resource.js';

test('feature initialization is deferred and shared across concurrent callers', async () => {
  let calls = 0;
  const get = createLazyResource(async () => { calls++; return {}; });
  assert.equal(calls, 0);
  const [a, b] = await Promise.all([get(), get()]);
  assert.equal(a, b); assert.equal(calls, 1); assert.equal(await get(), a);
});
test('failed lazy initialization may retry without poisoning the workspace', async () => {
  let calls = 0;
  const get = createLazyResource(() => { if (++calls === 1) throw new Error('offline'); return 42; });
  await assert.rejects(get(), /offline/);
  assert.equal(await get(), 42); assert.equal(calls, 2);
});
test('workbench does not statically load tool modules or eagerly initialize its filter worker', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import[\s\S]*?from ['"]([^'"]+)['"];$/gm)].map(match => match[1]);
  for (const tool of ['ranking-view.js', 'sticker-editor-view.js', 'sticker-compositor.js', 'png-export.js', 'bangumi-public-import.js', 'project-entity-runtime.js']) {
    assert.equal(imports.some(path => path.includes(tool)), false, tool);
  }
  assert.match(source, /const ensureFilterWorker = createLazyResource/);
  assert.match(source, /if \(!RUNTIME_FEATURES.authorityFanoutV1.enabled\) await ensureProjectEntityRuntime/);
});

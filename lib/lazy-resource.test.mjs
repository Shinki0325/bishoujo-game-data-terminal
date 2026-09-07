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
test('workbench defers tools and detail runtime; worker preloading stays works-only', async () => {
  const source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import[\s\S]*?from ['"]([^'"]+)['"];$/gm)].map(match => match[1]);
  for (const tool of ['ranking-view.js', 'sticker-editor-view.js', 'sticker-compositor.js', 'png-export.js', 'bangumi-public-import.js', 'project-entity-runtime.js']) {
    assert.equal(imports.some(path => path.includes(tool)), false, tool);
  }
  assert.match(source, /const ensureFilterWorker = createLazyResource/);
  assert.match(source, /const ensureProjectEntityRuntime = createLazyResource/);
  assert.match(source, /ensureProjectRuntime: ensureProjectEntityRuntime/);
  const detailResources = await readFile(new URL('./work-detail-resources-controller.js', import.meta.url), 'utf8');
  assert.match(detailResources, /loader\.load\(work\.workId\), ensureProjectRuntime\(\)/);
  const mediaEnvironment = await readFile(new URL('../views/media-edit-environment.js', import.meta.url), 'utf8');
  assert.match(mediaEnvironment, /const ensureStickerEditor = createLazyResource/);
  assert.doesNotMatch(mediaEnvironment, /^import.*from.*(?:sticker-editor-view|sticker-compositor)/m);
  assert.ok(source.includes("if (/^#works(?:[/?]|$)/u.test(window.location.hash)) filterWorkerClient.preload();"));
});

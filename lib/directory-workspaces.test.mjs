import test from 'node:test';
import assert from 'node:assert/strict';
import { isIndependentDirectoryRoute } from './directory-workspaces.js';
import { createViewLifetime } from './view-lifetime.js';

test('directory browsing stays independent while person details and editing use the workbench', () => {
  for (const route of ['#persons', '#persons?query=test&page=2', '#companies', '#companies/company/test']) {
    assert.equal(isIndependentDirectoryRoute(route), true, route);
  }
  for (const route of ['#home', '#works', '#ranking', '#persons/person/p1', '#work/w1']) {
    assert.equal(isIndependentDirectoryRoute(route), false, route);
  }
});

test('disposing a directory removes its listeners without removing the next workspace owner', () => {
  const target = new EventTarget(), lifetime = createViewLifetime();
  let oldCalls = 0, newCalls = 0;
  lifetime.listen(target, 'change', () => oldCalls++);
  target.dispatchEvent(new Event('change'));
  lifetime.dispose(); lifetime.dispose();
  target.addEventListener('change', () => newCalls++);
  target.dispatchEvent(new Event('change'));
  assert.equal(oldCalls, 1); assert.equal(newCalls, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentHelpArticle } from './galpedia-help.js';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('source shell navigation and lazy entry do not depend on an old release', async () => {
  const html = await source('../index.html');
  const nav = html.slice(html.indexOf('id="workspace-mode"'), html.indexOf('class="header-actions"'));
  assert.deepEqual([...nav.matchAll(/id="(mode-[a-z]+)"/g)].map(match => match[1]), ['mode-selection', 'mode-company', 'mode-person', 'mode-ranking']);
  if (html.includes('./releases/')) {
    const head = JSON.parse(await source('../release-head.json'));
    assert.equal(head.schemaVersion, 'egs-tier-release-head-v1');
    assert.equal(head.entry, `releases/${head.releaseId}/index.html`);
    assert.ok(html.includes(`src="./releases/${head.releaseId}/galpedia-boot.js"`));
    assert.match(await source(`../releases/${head.releaseId}/galpedia-boot.js`), /import\('\.\/main\.js'\)/);
  } else {
    assert.match(html, /src="\.\/galpedia-boot\.js"/);
  }
  assert.doesNotMatch(html, /id="(?:site-welcome-dialog|mobile-help-dialog|ranking-help|company-directory-help)"/);
  assert.match(html, /id="workspace"[^>]*inert/);
});

test('all runtime-required and mobile-owned elements exist after help migration', async () => {
  const html = await source('../index.html');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'unique IDs');
  for (const path of ['../main.js', '../views/mobile-selection-view.js']) {
    const code = await source(path);
    for (const match of code.matchAll(/(?:requiredElement\(|requiredOwnedElement\(root, )'([^']+)'/g)) assert.ok(ids.includes(match[1]), `${path}: ${match[1]}`);
    assert.doesNotMatch(code, /siteWelcome|showSiteWelcome|elements\.helpDialog/);
  }
});

test('header help follows all existing workspace and detail hash contracts', () => {
  for (const [hash, id] of [['', 'home.overview'], ['#home', 'home.overview'], ['#works?query=x', 'works.overview'], ['#work/42', 'works.overview'], ['#companies/company/c1', 'companies.overview'], ['#persons/person/p1', 'people.overview'], ['#ranking?subject=company', 'tier.overview']]) assert.equal(currentHelpArticle(hash), id);
});

test('interaction grammar removes obsolete menu dependencies and keeps every action', async () => {
  const html = await source('../index.html'); const main = await source('../main.js');
  assert.doesNotMatch(html + main, /legacy-file-menu|file-menu-button|fileMenuButton|文件操作已移至/);
  for (const id of ['bangumi-import-open', 'import-state', 'export-state', 'clear-board', 'clear-candidates', 'clear-annotations']) assert.ok(html.includes(`id="${id}"`));
  assert.ok(html.indexOf('id="display-menu-button"') < html.indexOf('id="cleanup-menu-button"'));
  assert.ok(html.indexOf('galpedia-controls.css') > html.indexOf('galpedia-states.css'));
  assert.match(main, /createPopoverController/);
  for (const id of ['mode-basic', 'mode-advanced', 'selection-mode-toggle', 'compare-mode-toggle']) {
    assert.match(html, new RegExp(`<button[^>]*data-ui="mode"[^>]*id="${id}"`));
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentHelpArticle } from './galpedia-help.js';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('source shell navigation and lazy entry do not depend on an old release', async () => {
  const html = await source('../index.html');
  const nav = html.slice(html.indexOf('id="workspace-mode"'), html.indexOf('class="header-actions"'));
  assert.deepEqual([...nav.matchAll(/id="(mode-[a-z]+)"/g)].map(match => match[1]), ['mode-selection', 'mode-company', 'mode-person', 'mode-ranking']);
  assert.match(html, /src="\.\/galpedia-boot\.js"/);
  assert.doesNotMatch(html, /\.\/releases\//);
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

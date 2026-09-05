import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('P0-B keeps state responsibilities separate in the shared CSS contract', async () => {
  const states = await source('../galpedia-states.css');
  const controls = await source('../galpedia-controls.css');
  const localTabs = states.slice(states.indexOf('/* Local tabs/modes'), states.indexOf('/* Cards use'));
  const cards = states.slice(states.indexOf('/* Cards use'), states.indexOf('/* Small visual checkbox'));

  assert.match(states, /--gp-state-selected/);
  assert.match(states, /--gp-state-focus-ring/);
  assert.match(states, /aria-busy="true"/);
  assert.match(localTabs, /inset: auto 9px 2px/);
  assert.doesNotMatch(localTabs, /#workspace-mode/);
  assert.doesNotMatch(localTabs, /gp-corner-paint/);
  assert.match(cards, /content: none/);
  assert.match(cards, /:focus-within[\s\S]*outline: 2px solid var\(--focus\)/);
  assert.match(cards, /background: var\(--gp-state-selected\)/);
  assert.match(states, /\.person-directory-row:is\(\.is-current, \[aria-current="true"\]\)[\s\S]*box-shadow: inset 3px 0 0 var\(--gp-state-edge\)/);

  assert.match(controls, /data-ui="nav"[^\n]+[\s\S]*aria-selected="true"/);
  assert.match(controls, /data-ui="mode"[^\n]+::after/);
  assert.match(controls, /aria-busy="true"/);
  assert.match(controls, /@media \(hover: none\), \(pointer: coarse\)/);
  assert.match(controls, /prefers-reduced-motion: reduce/);
});

test('disabled persistent states remain represented instead of being reset', async () => {
  const states = await source('../galpedia-states.css');
  const controls = await source('../galpedia-controls.css');
  assert.match(states, /\[aria-expanded="true"\], \[aria-pressed="true"\]\):is\(:disabled, \[aria-disabled="true"\]\)/);
  assert.match(controls, /not\(\[data-ui="nav"\]\):not\(\[data-ui="mode"\]\)[\s\S]*\[aria-expanded="true"\], \[aria-pressed="true"\]/);
});

console.log('GALPEDIA control states contract: 2/2');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/linru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const sourceCandidate = source.includes('<script type="module" src="./galpedia-boot.js"></script>');
const preview = sourceCandidate
  ? source
  : source.replace(
    /<script type="module" src="\.\/releases\/[^\"]+\/galpedia-boot\.js"><\/script>/,
    '<script type="module" src="./galpedia-boot.js"></script>'
  );
if (!sourceCandidate) assert.notEqual(preview, source, 'preview entry must load the candidate boot');

const browser = await chromium.launch({ headless: true, executablePath: chromePath });
try {
  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 }
  ]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
    await page.route(`${baseUrl}/index.html`, route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: preview
    }));
    await page.addInitScript(() => {
      localStorage.setItem('egs-tier-terminal:site-welcome-v1', 'seen');
      localStorage.setItem('egs-tier-terminal:company-directory-guide-v2', 'seen');
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#mode-person').waitFor({ state: 'visible' });
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.runtimePopulation));
    await page.waitForTimeout(200);
    assert.deepEqual(errors, [], `${viewport.name}: startup errors`);
    await page.waitForFunction(() => document.querySelector('#mode-person')?.disabled === false);

    await page.locator('#mode-person').click();
    await page.locator('#person-view').waitFor({ state: 'visible' });
    await page.locator('#mode-company').click();
    await page.locator('#company-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#person-view').isHidden(), true, `${viewport.name}: person view must hide after opening companies`);

    await page.locator('#mode-person').click();
    await page.locator('#person-view').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#company-view').isHidden(), true, `${viewport.name}: company view must hide after opening persons`);
    assert.deepEqual(errors, [], `${viewport.name}: page errors`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('workspace navigation E2E passed: desktop + mobile');

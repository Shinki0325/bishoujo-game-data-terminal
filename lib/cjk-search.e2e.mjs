import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/linru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4174';
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const useImmutableRelease = process.env.TERMINAL_CJK_E2E_IMMUTABLE === '1';
const preview = useImmutableRelease ? source : source
  .replace(
    /<link rel="stylesheet" href="\.\/releases\/[^"/]+\/styles\.css">/u,
    '<link rel="stylesheet" href="./styles.css">'
  )
  .replace(
    /<script type="module" src="\.\/releases\/[^"/]+\/main\.js"><\/script>/u,
    '<script type="module" src="./main.js"></script>'
  )
  .replace(/\.\/releases\/[^"/]+\/assets\//gu, './assets/');
if (!useImmutableRelease) {
  assert.match(preview, /src="\.\/main\.js"/u, 'preview entry must load the candidate main.js');
  assert.match(preview, /href="\.\/styles\.css"/u, 'preview entry must load the candidate styles.css');
}

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
    if (!useImmutableRelease) {
      await page.route(`${baseUrl}/index.html`, route => route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: preview
      }));
    }
    await page.addInitScript(() => {
      localStorage.setItem('egs-tier-terminal:site-welcome-v1', 'seen');
      localStorage.setItem('egs-tier-terminal:company-directory-guide-v2', 'seen');
    });
    await page.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(document.documentElement.dataset.runtimePopulation));
    await page.waitForFunction(() => document.querySelector('#mode-person')?.disabled === false);
    await page.waitForTimeout(600);

    if (viewport.name === 'desktop') {
      const workSearch = page.locator('#title-search');
      await workSearch.fill('峰深き濑にたゆたう呗');
      const deepRiver = page.locator('.selection-card[data-work-id="5135"]');
      await deepRiver.waitFor({ state: 'visible' });
      await workSearch.fill('fengshenlaibei');
      await deepRiver.waitFor({ state: 'visible' });
    }

    await page.locator('#mode-person').click();
    await page.locator('#person-view').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('.person-directory-row').length > 0);
    const expectedAxisLabels = ['1989', '2000', '2010', '2020', '2026'];
    assert.deepEqual(await page.locator('.person-directory-activity-axis-label').allTextContents(), expectedAxisLabels, `${viewport.name}: global activity axis`);
    if (viewport.name === 'desktop') {
      const firstActivity = page.locator('.person-directory-activity:visible').first();
      assert.equal(await firstActivity.locator('i').count(), 16, 'desktop: global activity bucket count');
      assert.deepEqual(await firstActivity.locator('i').evaluateAll(items => items.slice(0, 3).map(item => item.title)), ['1989–1993', '1994–1998', '1999–2000'], 'desktop: merged early bucket ranges');
      assert.equal(await firstActivity.locator('i').last().getAttribute('title'), '2025–2026', 'desktop: final bucket range');
      assert.equal(await page.locator('.person-directory-activity-axis-label').nth(1).evaluate(element => element.style.left), '18.75%', 'desktop: 2000 label follows the first three ranges');
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.person-directory-activity')).some(element => element.getBoundingClientRect().width >= 300));
      const activityBox = await firstActivity.boundingBox();
      const activityGrid = await firstActivity.evaluate(element => getComputedStyle(element.parentElement).gridTemplateColumns);
      assert.ok(activityBox?.width >= 300 && activityBox.width <= 325, `desktop: compact activity timeline (${activityBox?.width ?? 0}px; grid ${activityGrid})`);
      assert.equal(await firstActivity.evaluate(element => getComputedStyle(element).backgroundImage), 'none', 'desktop: per-bucket frame lines are removed');
    }
    const personSearch = page.locator('#person-directory-search');
    await personSearch.fill('成濑未亚');
    const naruse = page.locator('.person-directory-row[data-person-id="per_000000000c6c"]');
    await naruse.waitFor({ state: 'visible' });
    assert.match(await naruse.innerText(), /成瀬\s*未亜/u, `${viewport.name}: original person display name`);
    await personSearch.fill('chenglai');
    await naruse.waitFor({ state: 'visible' });
    assert.equal(await page.locator('.person-directory-row').count(), 8, `${viewport.name}: pinyin collision candidates`);
    assert.match(await naruse.locator('.person-directory-metrics').innerText(), /名义\s*13/u, `${viewport.name}: directory counts real name variants only`);
    assert.deepEqual(await page.locator('.person-directory-activity-axis-label').allTextContents(), expectedAxisLabels, `${viewport.name}: filtered activity axis remains global`);
    if (viewport.name === 'desktop') {
      const emptyBars = naruse.locator('.person-directory-activity i.is-empty');
      assert.ok(await emptyBars.count() > 0, 'desktop: directory timeline has empty buckets');
      assert.equal(await emptyBars.first().evaluate(element => getComputedStyle(element).height), '0px', 'desktop: empty directory bucket has no minimum bar');
      await personSearch.fill('YUKIMI');
      const earlyOnly = page.locator('.person-directory-row[data-person-id="per_06d31839739cfaa6dd1addb3"]');
      await earlyOnly.waitFor({ state: 'visible' });
      assert.equal(await earlyOnly.locator('.person-directory-activity i:not(.is-empty)').count(), 2, 'desktop: early-only person remains visible in both merged buckets');
      assert.equal(await earlyOnly.locator('.person-directory-activity i').nth(2).evaluate(element => getComputedStyle(element).height), '0px', 'desktop: early-only person is empty from 1999 onward');
    }

    await page.goto(`${baseUrl}/index.html#persons/person/per_000000000c6c`, { waitUntil: 'domcontentloaded' });
    await page.locator('#person-detail-dialog[open]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('.person-alias-chip').length === 13);
    assert.match(await page.locator('#person-detail-meta').innerText(), /名义\s*13/u, `${viewport.name}: detail count matches displayed aliases`);
    assert.equal(await page.locator('.person-alias-chip').count(), 13, `${viewport.name}: detail shows thirteen real aliases`);
    assert.equal(await page.locator('.person-representative-item .person-character-role').count(), 0, `${viewport.name}: representative cards omit redundant main-role labels`);

    await page.goto(`${baseUrl}/index.html#persons/person/per_0000000009ae`, { waitUntil: 'domcontentloaded' });
    await page.locator('#person-detail-dialog[open]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('.person-frequency-bar').length === 24);
    const detailBars = page.locator('.person-frequency-bar');
    assert.equal(await detailBars.count(), 24, `${viewport.name}: 2003-only detail extends through 2026`);
    assert.equal(await detailBars.first().getAttribute('title'), '2003 · 3 部', `${viewport.name}: detail starts at recorded year`);
    assert.equal(await detailBars.last().getAttribute('title'), '2026 · 0 部', `${viewport.name}: detail ends at current year`);
    assert.equal(await detailBars.last().evaluate(element => getComputedStyle(element).height), '0px', `${viewport.name}: empty detail year has no minimum bar`);
    assert.match(await page.locator('.person-frequency-note').innerText(), /^2003\s+最后收录于 2003/u, `${viewport.name}: single-year and last-record wording`);

    if (viewport.name === 'desktop') {
      await page.goto(`${baseUrl}/index.html#work/1`, { waitUntil: 'domcontentloaded' });
      await page.locator('#work-details[open]').waitFor({ state: 'visible' });
      const castTab = page.locator('#details-credits-tabs [data-tab="cast"]');
      await castTab.waitFor({ state: 'visible' });
      await castTab.click();
      const roleLabels = await page.locator('.details-credits-pane[data-pane="cast"] .details-cast-identity small').allTextContents();
      assert.ok(roleLabels.includes('登场'), 'desktop: real appears role is localized');
      assert.equal(roleLabels.includes('appears'), false, 'desktop: raw appears label is hidden');
    }

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 1, `${viewport.name}: horizontal overflow ${overflow}px`);
    assert.deepEqual(errors, [], `${viewport.name}: page errors`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('CJK/pinyin search + person activity timeline + appears label E2E passed: desktop + mobile');

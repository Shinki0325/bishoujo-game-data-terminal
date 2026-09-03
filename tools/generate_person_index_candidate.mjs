import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const { chromium } = createRequire(import.meta.url)('D:/blog/node_modules/@playwright/test');
const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1');
const output = path.join(root, 'performance-candidate');
fs.mkdirSync(path.join(output, 'relations'), { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4174/?dumpPersonIndex=1#persons', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction(() => document.querySelector('#person-directory-count')?.textContent === '10,225', null, { timeout: 60000 });
const records = await page.evaluate(() => globalThis.__EGS_PERSON_INDEX_EXPORT__);
await browser.close();
if (!Array.isArray(records) || records.length !== 10225) throw new Error(`unexpected person export: ${records?.length}`);

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const indexRecords = [];
const shards = new Map();
for (const record of records) {
  const { credits = [], coActors = [], coCompanies = [], getCoActors, getCoCompanies, ...summary } = record;
  indexRecords.push({
    entityId: record.entityId,
    canonicalName: record.canonicalName,
    displayName: record.displayName,
    searchKey: record.searchKey,
    roles: record.roles,
    primaryRole: record.primaryRole,
    workCount: record.workCount,
    totalCredits: record.totalCredits,
    nameVariantCount: record.nameVariantCount,
    firstYear: record.firstYear,
    lastYear: record.lastYear,
    spanLabel: record.spanLabel,
    activity: record.activity,
    representativeWorks: record.representativeWorks,
    representativeCharacters: record.representativeCharacters
  });
  const suffix = String(record.entityId).slice(4).toLowerCase();
  const shardKey = suffix.slice(0, 2).padEnd(2, '0');
  const bucket = shards.get(shardKey) ?? [];
  bucket.push({ entityId: record.entityId, activityYears: record.activityYears, credits, coActors, coCompanies });
  shards.set(shardKey, bucket);
}
const indexText = `${JSON.stringify({ schemaVersion: 'terminal-wiki-m2-person-directory-index-v1', publicationStatus: 'source-only', dataRevision: '20260903-person-representative-works-v1', records: indexRecords })}\n`;
fs.writeFileSync(path.join(output, 'directory-index.json'), indexText);
const shardManifest = [];
for (const [shardKey, shardRecords] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const text = `${JSON.stringify({ schemaVersion: 'terminal-wiki-m2-person-relations-shard-v1', publicationStatus: 'source-only', shardKey, records: shardRecords })}\n`;
  const filename = `relations/${shardKey}.json`;
  fs.writeFileSync(path.join(output, filename), text);
  shardManifest.push({ shardKey, path: filename, sha256: sha256(text), recordCount: shardRecords.length, bytes: Buffer.byteLength(text) });
}
const manifestText = `${JSON.stringify({ schemaVersion: 'terminal-wiki-m2-person-performance-manifest-v1', publicationStatus: 'source-only', dataRevision: '20260903-person-representative-works-v1', index: { path: 'directory-index.json', sha256: sha256(indexText), recordCount: indexRecords.length, bytes: Buffer.byteLength(indexText) }, shards: shardManifest })}\n`;
fs.writeFileSync(path.join(output, 'performance-manifest.json'), manifestText);
console.log(JSON.stringify({ output, indexBytes: Buffer.byteLength(indexText), shardCount: shardManifest.length, shardBytes: shardManifest.reduce((sum, item) => sum + item.bytes, 0), recordCount: indexRecords.length }));

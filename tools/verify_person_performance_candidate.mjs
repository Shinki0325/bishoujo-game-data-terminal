import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1/performance-candidate');
const manifestPath = path.join(root, 'performance-manifest.json');
const indexPath = path.join(root, 'directory-index.json');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw new Error(message); };
const manifestBytes = fs.readFileSync(manifestPath);
const manifest = readJson(manifestPath);
if (manifest.schemaVersion !== 'terminal-wiki-m2-person-performance-manifest-v1' || manifest.publicationStatus !== 'source-only') fail('manifest contract mismatch');
const indexBytes = fs.readFileSync(indexPath);
if (sha256(indexBytes) !== manifest.index?.sha256) fail('index SHA mismatch');
const index = readJson(indexPath);
if (index.schemaVersion !== 'terminal-wiki-m2-person-directory-index-v1' || index.publicationStatus !== 'source-only') fail('index contract mismatch');
if (index.records.length !== manifest.index.recordCount || indexBytes.byteLength !== manifest.index.bytes) fail('index count/bytes mismatch');

const indexIds = new Set();
const shardIds = new Set();
const relationIds = new Set();
const catalog = readJson(path.resolve('data/catalog.json'));
const admissions = readJson(path.resolve('data/egs-tier-vndb-admissions-v1.json'));
const workIds = new Set([
  ...(catalog.works ?? []).map(work => String(work.workId)),
  ...(admissions.works ?? []).map(work => String(work.egsWorkId ?? work.workId))
]);
const companyIds = new Set([
  ...(catalog.companies ?? []).map(company => String(company.companyId)),
  ...(admissions.works ?? []).map(work => String(work.companyId ?? ''))
].filter(Boolean));
const errors = [];
for (const record of index.records) {
  if (!record?.entityId || indexIds.has(record.entityId)) errors.push(`duplicate/missing index entity: ${record?.entityId}`);
  indexIds.add(record.entityId);
}
const shardFiles = fs.readdirSync(path.join(root, 'relations')).filter(file => file.endsWith('.json')).sort();
if (shardFiles.length !== manifest.shards.length) errors.push('manifest/file shard count mismatch');
for (const descriptor of manifest.shards) {
  const file = path.join(root, descriptor.path);
  if (!fs.existsSync(file)) { errors.push(`missing shard: ${descriptor.path}`); continue; }
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== descriptor.sha256 || bytes.byteLength !== descriptor.bytes) errors.push(`shard hash/bytes mismatch: ${descriptor.shardKey}`);
  const shard = readJson(file);
  if (shard.schemaVersion !== 'terminal-wiki-m2-person-relations-shard-v1' || shard.publicationStatus !== 'source-only' || shard.shardKey !== descriptor.shardKey) errors.push(`shard contract mismatch: ${descriptor.shardKey}`);
  if (shard.records.length !== descriptor.recordCount) errors.push(`shard count mismatch: ${descriptor.shardKey}`);
  for (const record of shard.records) {
    const id = record?.entityId;
    const expected = String(id ?? '').slice(4, 6).toLowerCase().padEnd(2, '0');
    if (!id || expected !== descriptor.shardKey || shardIds.has(id) || !indexIds.has(id)) errors.push(`shard entity mismatch: ${descriptor.shardKey}/${id}`);
    shardIds.add(id);
    for (const credit of record.credits ?? []) {
      if (!credit.relationId || relationIds.has(credit.relationId)) errors.push(`duplicate/missing relation: ${credit.relationId}`);
      relationIds.add(credit.relationId);
      if (credit.workId && workIds.size && !workIds.has(String(credit.workId))) errors.push(`unknown work reference: ${credit.workId}`);
    }
    for (const actor of record.coActors ?? []) if (actor.personId && !indexIds.has(actor.personId)) errors.push(`unknown co-actor reference: ${actor.personId}`);
    for (const company of record.coCompanies ?? []) if (company.companyId && companyIds.size && !companyIds.has(String(company.companyId))) errors.push(`unknown company reference: ${company.companyId}`);
  }
}
for (const id of indexIds) if (!shardIds.has(id)) errors.push(`index entity missing from shards: ${id}`);
if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors: errors.slice(0, 20), errorCount: errors.length }));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, manifestSha256: sha256(manifestBytes), indexRecords: indexIds.size, shardCount: shardFiles.length, relationCount: relationIds.size, indexBytes: indexBytes.byteLength, shardBytes: manifest.shards.reduce((sum, item) => sum + item.bytes, 0) }));
}

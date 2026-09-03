import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1/performance-candidate');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const indexFile = path.join(root, 'directory-index.json');
const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
const shards = fs.readdirSync(path.join(root, 'relations')).filter(name => name.endsWith('.json')).sort().map(name => {
  const file = path.join(root, 'relations', name);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { shardKey: payload.shardKey, path: `relations/${name}`, sha256: hash(file), recordCount: payload.records.length, bytes: fs.statSync(file).size };
});
const manifest = { schemaVersion: 'terminal-wiki-m2-person-performance-manifest-v1', publicationStatus: 'source-only', dataRevision: '20260903-person-representative-works-v1', index: { path: 'directory-index.json', sha256: hash(indexFile), recordCount: index.records.length, bytes: fs.statSync(indexFile).size }, shards };
fs.writeFileSync(path.join(root, 'performance-manifest.json'), `${JSON.stringify(manifest)}\n`);
console.log(JSON.stringify({ indexBytes: manifest.index.bytes, shardBytes: shards.reduce((sum, item) => sum + item.bytes, 0), manifestSha256: hash(path.join(root, 'performance-manifest.json')) }));

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('data/terminal-wiki-m2-person-source-only-v1/performance-candidate');
const indexPath = path.join(root, 'directory-index.json');
const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const activityById = new Map(index.records.map(record => [record.entityId, record.activityYears]));
for (const record of index.records) delete record.activityYears;
fs.writeFileSync(indexPath, `${JSON.stringify(index)}\n`);
for (const filename of fs.readdirSync(path.join(root, 'relations'))) {
  const filePath = path.join(root, 'relations', filename);
  const shard = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  for (const record of shard.records) record.activityYears = activityById.get(record.entityId) ?? [];
  fs.writeFileSync(filePath, `${JSON.stringify(shard)}\n`);
}
console.log(JSON.stringify({ records: index.records.length, indexBytes: fs.statSync(indexPath).size }));

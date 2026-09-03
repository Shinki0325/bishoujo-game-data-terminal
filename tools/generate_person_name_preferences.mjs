import fs from 'node:fs';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url).pathname.replace(/^\//u, '').replaceAll('/', '/');
const kbRoot = 'D:/blog-kb';
const catalog = JSON.parse(fs.readFileSync(`${root}/data/catalog.json`, 'utf8'));
const works = new Map(catalog.works.map(work => [String(work.workId), work]));
const byStaff = new Map();

for (const file of fs.readdirSync(`${kbRoot}/data/work-details/v1/shards`)) {
  const shard = JSON.parse(fs.readFileSync(`${kbRoot}/data/work-details/v1/shards/${file}`, 'utf8'));
  for (const [workId, detail] of Object.entries(shard.works ?? {})) {
    const work = works.get(workId);
    if (!work) continue;
    const namesByStaff = new Map();
    for (const cast of detail.cast ?? []) {
      for (const actor of cast.actors ?? []) {
        if (!actor?.vndbStaffId || typeof actor.name !== 'string' || !actor.name.trim()) continue;
        const names = namesByStaff.get(actor.vndbStaffId) ?? new Set();
        names.add(actor.name.trim());
        namesByStaff.set(actor.vndbStaffId, names);
      }
    }
    for (const [vndbStaffId, names] of namesByStaff) {
      const rows = byStaff.get(vndbStaffId) ?? [];
      rows.push({
        workId,
        voteCount: Number.isSafeInteger(work.voteCount) ? work.voteCount : 0,
        names: [...names]
      });
      byStaff.set(vndbStaffId, rows);
    }
  }
}

const normalize = value => String(value ?? '')
  .normalize('NFKC')
  .toLocaleLowerCase('ja')
  .replace(/[\p{P}\p{S}\s]+/gu, '');
const variants = JSON.parse(fs.readFileSync(`${root}/data/terminal-wiki-m2-person-source-only-v1/name-variants.json`, 'utf8')).records;
const records = [];

for (const record of variants) {
  const uniqueWorks = new Map();
  for (const row of byStaff.get(record.vndbStaffId) ?? []) {
    const previous = uniqueWorks.get(row.workId);
    if (!previous || row.voteCount > previous.voteCount) uniqueWorks.set(row.workId, row);
  }
  const topWorks = [...uniqueWorks.values()]
    .sort((left, right) => right.voteCount - left.voteCount || left.workId.localeCompare(right.workId))
    .slice(0, 10);
  const variantByKey = new Map((record.variants ?? []).map(variant => [normalize(variant.name), variant.name]));
  const counts = new Map();
  const voteTotals = new Map();
  const firstRank = new Map();
  let rank = 0;
  for (const work of topWorks) {
    for (const name of work.names) {
      const key = normalize(name);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      voteTotals.set(key, (voteTotals.get(key) ?? 0) + work.voteCount);
      if (!firstRank.has(key)) firstRank.set(key, rank);
      rank += 1;
    }
  }
  const candidates = [...counts.keys()]
    .map(key => ({ name: variantByKey.get(key), key, workCount: counts.get(key), voteTotal: voteTotals.get(key), firstRank: firstRank.get(key) }))
    .filter(candidate => candidate.name);
  candidates.sort((left, right) => right.workCount - left.workCount || right.voteTotal - left.voteTotal || left.firstRank - right.firstRank || left.name.localeCompare(right.name, 'zh-Hans'));
  if (candidates.length) {
    records.push({
      personEntityId: record.personEntityId,
      vndbStaffId: record.vndbStaffId,
      preferredName: candidates[0].name,
      topWorkCount: topWorks.length,
      nameEvidence: candidates.slice(0, 5).map(candidate => ({ name: candidate.name, workCount: candidate.workCount, voteTotal: candidate.voteTotal }))
    });
  }
}

const payload = {
  schemaVersion: 'terminal-wiki-m2-person-name-preferences-v1',
  projection: 'person-name-preferences',
  publicationStatus: 'source-only',
  generatedAt: '2026-09-03T00:00:00+08:00',
  rule: {
    topWorks: 10,
    order: 'voteCount-desc',
    dedupe: 'workId',
    selection: 'frequency-then-voteTotal-then-first-ranked-work',
    source: 'work-details/v1 cast actors'
  },
  records: records.sort((left, right) => left.personEntityId.localeCompare(right.personEntityId))
};
const output = `${root}/data/terminal-wiki-m2-person-source-only-v1/name-preferences.json`;
fs.writeFileSync(output, JSON.stringify(payload));
console.log(JSON.stringify({ records: records.length, bytes: fs.statSync(output).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex'), samples: records.filter(record => ['s272', 's113'].includes(record.vndbStaffId)) }, null, 2));

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareBangumiPublicBindingsCarrier } from './bangumi-public-bindings.js';
import { planBangumiPublicImport } from './bangumi-public-import.js';
import { createBangumiRatingViewModel, projectWorkWithBangumiRating } from './bangumi-rating-view.js';
import { prepareBangumiCanonicalAliasFallback } from './bangumi-canonical-alias-fallback.js';
import { prepareBangumiRatingsSidecar } from './bangumi-ratings.js';
import { createWeightedRatingSort } from './rating-sort.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const sha256 = relative => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');

test('real Bangumi payload covers card, detail, sort and import smoke', () => {
  const catalog = readJson('data/catalog.json');
  const admissions = readJson('data/egs-tier-vndb-admissions-v1.json');
  const carrierPath = 'data/egs-tier-bangumi-public-bindings-v1.json';
  const ratingsPath = 'data/egs-tier-bangumi-ratings-v1.20260826-bangumi-public-bindings-v1.json';
  const aliasPath = 'data/egs-tier-bangumi-canonical-alias-fallback-v1.20260826-bangumi-public-bindings-v1.json';
  const carrierSha256 = sha256(carrierPath);
  const workIds = [
    ...catalog.works.map(work => work.workId),
    ...admissions.works.map(work => work.egsWorkId)
  ];
  const carrier = prepareBangumiPublicBindingsCarrier(readJson(carrierPath), {
    catalogSnapshotId: catalog.snapshot.snapshotId,
    catalogSha256: sha256('data/catalog.json'),
    workIds
  });
  const ratings = prepareBangumiRatingsSidecar(readJson(ratingsPath), {
    catalogSnapshotId: catalog.snapshot.snapshotId,
    catalogSha256: sha256('data/catalog.json'),
    bangumiPublicBindingsSha256: carrierSha256,
    workIds
  });
  const alias = prepareBangumiCanonicalAliasFallback(readJson(aliasPath), {
    catalogSnapshotId: catalog.snapshot.snapshotId,
    catalogSha256: sha256('data/catalog.json'),
    enrichmentSha256: sha256('data/egs-tier-full-enrichment-v1.json'),
    bangumiPublicBindingsSha256: carrierSha256,
    workIds: catalog.works.map(work => work.workId)
  });

  const representative = projectWorkWithBangumiRating(
    catalog.works.find(work => work.workId === '1'),
    ratings.ratingByWorkId
  );
  assert.equal(representative.bangumiRating.subjectId, carrier.bindingByWorkId.get('1').bangumiSubjectId);
  assert.equal(createBangumiRatingViewModel(ratings.ratingByWorkId.get('1')).status, 'mapped-rated');
  assert.equal(createWeightedRatingSort({ ratings: ratings.ratingByWorkId, scoreField: 'score' }).score(7, 2) > 0, true);

  const plan = planBangumiPublicImport({
    collections: [{ subjectId: carrier.bindingByWorkId.get('1').bangumiSubjectId, title: representative.title }],
    confirmedBindings: carrier.bindings,
    currentSelectedWorkIds: [],
    workLimit: 10
  });
  assert.equal(plan.matchedSubjectCount, 1);
  assert.equal(plan.unmatchedSubjectCount, 0);
  assert.equal(alias.workFallbackById.has('1'), true);
});

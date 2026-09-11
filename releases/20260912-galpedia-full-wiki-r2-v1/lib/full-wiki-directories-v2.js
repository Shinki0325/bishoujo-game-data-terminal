import { yieldMainThread, sortWithYield } from './yield-main-thread.js';
import * as personDirectoryTransportCodec from './person-directory-transport-codec.js';
import { createCharacterNamesLoader, characterDisplayName } from './full-wiki-character-names-v2.js';
import { selectRepresentativeCharacters } from './person-representative-characters.js';
import {resolveCompanyWorkIds} from './full-wiki-company-relations.js';
import {resolvePersonActivityBounds, buildPersonDirectoryActivity, formatPersonActivitySpan} from './person-activity-timeline.js';
import {normalizePersonWorkIndexAsync} from './person-work-index.js';
import {restoreCompanySummary} from './company-directory.js';
import {sortCatalog} from './catalog.js';
import * as releaseDateModule from './work-release-date.js';
import {resolveAssetUrl} from './asset-url.js';
import {FULL_WIKI_DIRECTORY_RECORD, PRECOMPUTED_PERSON_SEARCH_KEYS} from './person-search.js';
import {PERSON_DIRECTORY_INDEX} from './full-wiki-person-directory-index-config.js';
import {takePersonDirectoryIndexBytes} from './person-index-transport.js';

// Display projection preserves source identities; names never merge entities.
const hash = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
const text = value => typeof value === 'string' ? value.trim() : '';
const number = value => Number.isSafeInteger(value) ? value : null;
const releaseYear = releaseDateModule.releaseYear;
const defaultReleaseDateInfo = typeof releaseDateModule.releaseDateInfo === 'function'
  ? releaseDateModule.releaseDateInfo
  : () => ({ kind: 'unknown' });
const nameCollator = new Intl.Collator('zh-Hans'), japaneseCollator = new Intl.Collator('ja'), idCollator = new Intl.Collator('en');
const compareNames = (left, right) => nameCollator.compare(text(left), text(right)) || japaneseCollator.compare(text(left), text(right));
// Directory construction is deliberately cooperative.  A cold full-wiki
// lookup can otherwise spend several seconds in one task while projecting and
// sorting all 53,075 people.  Keep the batch large enough that the total
// await overhead stays small, while yielding between batches so navigation,
// input and paint can run.  scheduler.yield has browser priority semantics;
// the timer fallback keeps the same behavior in older browsers and Node.
// Four-times CPU emulation can make a 1,024-row projection visibly long;
// browser builds use 256 rows while Node/SSR keeps the lower-overhead 1,024
// row boundary used by the contract harness.
const DIRECTORY_YIELD_BATCH = typeof window !== 'undefined' ? 256 : 1024;
const yieldDirectoryTask = yieldMainThread;

let nextDirectoryYield = 0;
function shouldYieldDirectoryBatch(index) {
  if ((index + 1) % DIRECTORY_YIELD_BATCH !== 0) return false;
  const now = performance.now();
  if (now < nextDirectoryYield) return false;
  nextDirectoryYield = now + 8;
  return true;
}
const sortDirectoryRecords = sortWithYield;
// Keep direct consumers that read person.searchKey working without creating a
// second record object.  The controller can therefore retain the trusted
// directory row while person-search still reads the same pinned key.
const readPrecomputedSearchKey = function () { return this?.[PRECOMPUTED_PERSON_SEARCH_KEYS]?.searchKey ?? ''; };
const readPrecomputedPinyinSearchKey = function () { return this?.[PRECOMPUTED_PERSON_SEARCH_KEYS]?.pinyinSearchKey ?? ''; };

export function createFullWikiDirectories({
  manifestUrl, manifestSha256, runtime, readWorkMetadata, loadWorks,
  assetBase = null, characterImageById = null, representativeFamilyByWorkId = null,
  presentationFamilies = null, loadPersonNames = null, loadWorkCharacters = null, characterNames = null, loadCharacterNames = createCharacterNamesLoader(), releaseDateInfo = defaultReleaseDateInfo,
  loadPersonCast = null, loadCharacterImages = null, loadCharacterAvailability = null,
  fetchImpl = fetch
}) {
  const pending = new Map();
  async function read(url, sha, bytes) {
    // Boot may already have fetched the exact person-index URL.  Consume that
    // byte promise only for this URL/fetch function; all other files retain
    // the original request path and all validations below remain mandatory.
    const prefetched = takePersonDirectoryIndexBytes(url, {fetchImpl});
    const data = prefetched ? await prefetched : await (async () => {
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error('全量目录读取失败');
      return response.arrayBuffer();
    })();
    if (await hash(data) !== sha || (bytes !== undefined && data.byteLength !== bytes)) throw new Error('全量目录校验失败');
    const large = data.byteLength > 100000;
    if (large) await yieldMainThread();
    const decoded = new TextDecoder().decode(data);
    if (large) await yieldMainThread();
    const result = JSON.parse(decoded);
    if (large) await yieldMainThread();
    return result;
  }
  const once = (key, fn) => {
    if (!pending.has(key)) pending.set(key, fn().catch(error => { pending.delete(key); throw error; }));
    return pending.get(key);
  };
  const manifest = () => once('manifest', async () => {
    const value = await read(manifestUrl, manifestSha256);
    if (value.schema !== 'terminal-wiki-full-directory-manifest-v1') throw new TypeError('全量目录版本不兼容');
    return value;
  });
  const file = path => once(path, async () => {
    const value = await manifest();
    const descriptor = value.files.find(row => row.path === path);
    if (!descriptor) throw new TypeError(`全量目录文件未登记：${path}`);
    return read(new URL(path, manifestUrl), descriptor.sha256, descriptor.bytes);
  });
  const loadPersonDirectoryIndex = () => once('person-directory-index', async () => {
    if (PERSON_DIRECTORY_INDEX?.enabled !== true) return null;
    if (PERSON_DIRECTORY_INDEX.schemaVersion !== 'terminal-wiki-person-directory-index-v2'
      || !/^\.\.\/runtime-data\/person-directory-index-v2\/person-directory\.[a-f0-9]{16}\.json$/u.test(PERSON_DIRECTORY_INDEX.url ?? '')
      || !/^[a-f0-9]{64}$/u.test(PERSON_DIRECTORY_INDEX.sha256 ?? '')
      || !Number.isSafeInteger(PERSON_DIRECTORY_INDEX.bytes) || PERSON_DIRECTORY_INDEX.bytes < 1
      || !/^[a-f0-9]{64}$/u.test(PERSON_DIRECTORY_INDEX.directoryManifestSha256 ?? '')
      || !/^[a-f0-9]{64}$/u.test(PERSON_DIRECTORY_INDEX.sourceManifestSha256 ?? '')) {
      throw new TypeError('人物窄目录索引配置无效');
    }
    if (PERSON_DIRECTORY_INDEX.directoryManifestSha256 !== manifestSha256) {
      throw new TypeError('人物窄目录索引与目录清单版本不一致');
    }
    const transport = personDirectoryTransportCodec.personDirectoryTransportRequest(PERSON_DIRECTORY_INDEX, import.meta.url);
    const payload = await read(transport.url, transport.sha256, transport.bytes);
    const value = transport.compact
      ? (typeof personDirectoryTransportCodec.decodePersonDirectoryTransportAsync === 'function'
        ? await personDirectoryTransportCodec.decodePersonDirectoryTransportAsync(payload, PERSON_DIRECTORY_INDEX)
        : personDirectoryTransportCodec.decodePersonDirectoryTransport(payload, PERSON_DIRECTORY_INDEX))
      : payload;
    if (value?.schemaVersion !== PERSON_DIRECTORY_INDEX.schemaVersion
      || value.directoryManifestSha256 !== manifestSha256
      || value.sourceManifestSha256 !== PERSON_DIRECTORY_INDEX.sourceManifestSha256
      || !Array.isArray(value.rows)
      || !value.workIdsByCanonical || typeof value.workIdsByCanonical !== 'object'
      || !value.searchKeysByCanonical || typeof value.searchKeysByCanonical !== 'object') {
      throw new TypeError('人物窄目录索引格式无效');
    }
    if (typeof runtime?.loadManifest !== 'function') throw new TypeError('全量作品清单 pin 不可用');
    const runtimeManifest = await runtime.loadManifest();
    const runtimeManifestSha256 = await hash(new TextEncoder().encode(JSON.stringify(runtimeManifest)));
    if (runtimeManifestSha256 !== PERSON_DIRECTORY_INDEX.sourceManifestSha256) {
      throw new TypeError('人物窄目录索引与全量作品清单版本不一致');
    }
    if (!Number.isSafeInteger(value.counts?.persons)
      || value.rows.length !== value.counts.persons
      || Object.keys(value.workIdsByCanonical).length !== value.rows.length) {
      throw new TypeError('人物窄目录索引计数无效');
    }
    return value;
  });
  let personById = null;
  let personByCanonical = null;
  let personBySourceId = null;
  let workMetadataById = new Map();
  let yearsByCanonical = new Map();
  let workIdsByCanonical = new Map();
  let resolvedPersonNames = new Map();
  let catalogByPresentation = new Map();
  let companyById = null;

  function sourceName(row) {
    // The summary is produced from the source entity. VNDB canonical rows are
    // therefore authoritative for identity; aliases remain separate labels.
    return text(row?.name) || text(row?.displayName) || '未命名人物';
  }
  function releasedYear(work) {
    if (typeof releaseDateInfo !== 'function') return null;
    const info = releaseDateInfo(work?.releaseDate);
    if (info?.kind !== 'released') return null;
    return releaseYear(info.releaseDate ?? info.date ?? work?.releaseDate);
  }
  function displayName(row) {
    const explicitValue = resolvedPersonNames.get(row?.canonicalEntityId)
      ?? resolvedPersonNames.get(row?.entityId);
    const explicit = typeof explicitValue === 'string' ? explicitValue : explicitValue?.displayName;
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    const canonical = sourceName(row);
    return text(row?.displayName) || canonical;
  }
  function companyIdForWork(work) {
    const raw = text(work?.brandId ?? work?.companyId);
    if (!raw || !companyById) return null;
    const candidate = raw.replace(/^egs:brand:/u, '');
    if (companyById.has(candidate)) return candidate;
    for (const [id, row] of companyById) {
      if ((row.sourceIds ?? []).some(value => text(value) === raw || text(value) === `egs:brand:${candidate}`)) return id;
    }
    return null;
  }
  const imageUrlCache = new Map();
  function imageUrl(path) {
    if (!path || !assetBase) return null;
    if (imageUrlCache.has(path)) return imageUrlCache.get(path);
    try { const url = resolveAssetUrl(path, assetBase); imageUrlCache.set(path, url); return url; } catch { return null; }
  }
  function sourceCharacterName(relation) {
    const id = relation?.bangumiCharacterId ?? relation?.vndbCharacterId ?? relation?.characterId;
    const keys = relation?.bangumiCharacterId
      ? [String(id), `bangumi:${id}`]
      : relation?.vndbCharacterId ? [`vndb:${id}`, String(id)] : [String(id ?? '')];
    for (const key of keys) {
      const value = characterNames?.get?.(key) ?? characterNames?.[key];
      const name = typeof value === 'string' ? value : value?.name;
      if (text(name)) return text(name);
    }
    return null;
  }
  function familyKey(workId) {
    const direct = representativeFamilyByWorkId?.get?.(String(workId));
    if (direct) return `family:${direct}`;
    const family = presentationFamilies?.familyForWork?.(String(workId));
    return family?.presentationWorkId ? `family:${family.presentationWorkId}` : `work:${workId}`;
  }

  async function loadDirectory() {
    return once('person-ui', async () => {
      // The generated index carries the same summary rows plus resolved work
      // IDs, display-name overrides, hidden variants and trusted search keys.
      // It is optional so an older install can continue through the original
      // four-file path when the index is absent, stale or rejected.
      const compact = await loadPersonDirectoryIndex().catch(() => null);
      let source;
      let relationSource = null;
      let catalog = null;
      let loadedNames = null;
      if (compact) {
        source = compact.rows;
        workIdsByCanonical = new Map();
        // The pinned generator already emits de-duplicated string IDs.  Keep
        // the same linear normalization pass, but give the page a chance to
        // process input and paint between groups of people.
        const compactEntries = Object.entries(compact.workIdsByCanonical);
        for (let index = 0; index < compactEntries.length; index += 1) {
          const [canonical, ids] = compactEntries[index];
          workIdsByCanonical.set(canonical, Array.isArray(ids)
            ? ids.map(value => String(value)).filter(Boolean) : []);
          if (shouldYieldDirectoryBatch(index)) await yieldDirectoryTask();
        }
      } else {
        [source, relationSource, catalog, loadedNames] = await Promise.all([
          file('directory/person-summary.json').then(value => value.rows), file('relations/persons.json'), runtime.loadCatalog(),
          typeof loadPersonNames === 'function' ? loadPersonNames() : null
        ]);
        catalogByPresentation = new Map([...catalog.byId].map(([presentationId, value]) => [String(presentationId), String(value.defaultEgsWorkId ?? '')]));
        workIdsByCanonical = new Map();
        for (let index = 0; index < source.length; index += 1) {
          const row = source[index];
          const canonical = row.canonicalEntityId;
          const direct = relationSource.workRelations?.[canonical] ?? [];
          const presentations = relationSource.presentationRelations?.[canonical] ?? [];
          const ids = [...direct.map(value => String(value)), ...presentations.flatMap(value => {
            const presentationId = String(value ?? '');
            if (/^egs:[1-9][0-9]*$/u.test(presentationId)) return [presentationId.slice(4)];
            const fallback = catalogByPresentation.get(presentationId);
            return fallback ? [fallback] : [];
          })].filter(Boolean);
          workIdsByCanonical.set(canonical, [...new Set(ids)]);
          if (shouldYieldDirectoryBatch(index)) await yieldDirectoryTask();
        }
      }
      // Avoid the intermediate nested-array flatten plus second Set.  This is
      // equivalent for the hash-pinned index and keeps only one work-ID set
      // alive while preparing the worker metadata request.
      const allWorkIds = [];
      const allWorkIdSet = new Set();
      let workGroupIndex = 0;
      for (const ids of workIdsByCanonical.values()) {
        for (const value of ids ?? []) {
          const workId = String(value);
          if (!workId || allWorkIdSet.has(workId)) continue;
          allWorkIdSet.add(workId); allWorkIds.push(workId);
        }
        if (shouldYieldDirectoryBatch(workGroupIndex++)) await yieldDirectoryTask();
      }
      if (typeof readWorkMetadata === 'function' && allWorkIds.length) {
        const loaded = await readWorkMetadata(allWorkIds);
        workMetadataById = new Map((loaded ?? []).map(work => [String(work.workId), work]));
      }
      // Preserve the old detail-boundary semantics without copying the full
      // 34k-entry metadata Map.  Detail hydration may append rare IDs later;
      // representative rows only consult IDs present at directory load time.
      const directoryMetadataIds = new Set(workMetadataById.keys());
      if (loadedNames) {
        resolvedPersonNames = loadedNames?.get instanceof Function
          ? loadedNames
          : loadedNames instanceof Map ? loadedNames : new Map(Object.entries(loadedNames ?? {}));
      }
      yearsByCanonical = new Map();
      // Work facts are shared by thousands of people; resolve dates, family
      // identities once per work.  Representative-work ranking is deferred
      // until a landing row actually asks for representativeWorks: building
      // and sorting this second index for all 53,075 rows was a cold-start
      // cost even when the directory was only searched or filtered.
      // Keep the same metadata snapshot that the eager implementation used;
      // detail-route hydration can append rare relation IDs later, and those
      // must not change an already-created directory row's representatives.
      // Keep metadata-derived years for exact behavior: releaseDateInfo
      // excludes future dates and TBD placeholders. Static summary bounds
      // cannot replace that date-aware projection.
      const yearByWork = new Map();
      let metadataIndex = 0;
      for (const [id, work] of workMetadataById) {
        yearByWork.set(id, releasedYear(work));
        if (shouldYieldDirectoryBatch(metadataIndex++)) await yieldDirectoryTask();
      }
      const activityByCanonical = new Map();
      const activityBounds = [];
      let activityIndex = 0;
      for (const [canonical, ids] of workIdsByCanonical) {
        const years = [];
        for (const id of ids) {
          const year = yearByWork.get(id);
          if (year !== null && year !== undefined) years.push(year);
        }
        let firstYear = null, lastYear = null;
        for (const year of years) {
          if (firstYear === null || year < firstYear) firstYear = year;
          if (lastYear === null || year > lastYear) lastYear = year;
        }
        yearsByCanonical.set(canonical, years);
        activityByCanonical.set(canonical, {years, firstYear, lastYear});
        activityBounds.push({firstYear, lastYear});
        if (shouldYieldDirectoryBatch(activityIndex++)) await yieldDirectoryTask();
      }
      const axis = resolvePersonActivityBounds(activityBounds);
      // Reuse the exact loadDirectory year snapshot for representative rows;
      // recomputing release dates inside getters could cross a mutable date
      // boundary and diverge from the original directory snapshot.
      const directoryYear = workId => yearByWork.get(workId);
      let allSearchKeysPrecomputed = compact !== null;
      const records = new Array(source.length);
      for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
        const row = source[sourceIndex];
        // The pinned compact rows already contain the name projection.  The
        // fallback path must retain its explicit name-map precedence, while
        // the compact path avoids two Map lookups and repeated trim work for
        // every one of the 53,075 rows.
        const canonicalName = compact
          ? (text(row.name) || text(row.displayName) || '未命名人物')
          : sourceName(row);
        const activity = activityByCanonical.get(row.canonicalEntityId);
        const names = activity?.years ?? yearsByCanonical.get(row.canonicalEntityId) ?? [];
        const firstYear = activity?.firstYear ?? null;
        const lastYear = activity?.lastYear ?? null;
        const projectedDisplayName = compact
          ? (text(row.displayName) || canonicalName)
          : displayName(row);
        const record = {
          ...row,
          entityId: row.entityId,
          canonicalName,
          displayName: projectedDisplayName,
          aliases: Array.isArray(row.aliases) ? row.aliases : [],
          hiddenNameVariants: row.hiddenNameVariants
            ?? resolvedPersonNames.get(row.canonicalEntityId)?.hiddenNameVariants ?? [],
          roles: row.roles ?? {},
          workCount: row.workCount ?? 0,
          totalCredits: row.totalCredits ?? 0,
          credits: [],
          firstYear, lastYear,
          spanLabel: formatPersonActivitySpan(firstYear, lastYear),
          representativeCharacters: [], coActors: [], coCompanies: []
        };
        Object.defineProperty(record, FULL_WIKI_DIRECTORY_RECORD, {
          configurable: false, enumerable: false, writable: false, value: true
        });
        const precomputedSearchKeys = compact?.searchKeysByCanonical?.[row.canonicalEntityId];
        if (Array.isArray(precomputedSearchKeys)
          && typeof precomputedSearchKeys[0] === 'string'
          && typeof precomputedSearchKeys[1] === 'string') {
          Object.defineProperty(record, PRECOMPUTED_PERSON_SEARCH_KEYS, {
            configurable: false, enumerable: false, writable: false,
            value: Object.freeze({ searchKey: precomputedSearchKeys[0], pinyinSearchKey: precomputedSearchKeys[1] })
          });
          Object.defineProperties(record, {
            // These accessors preserve the public enumerable search fields
            // without allocating the wrapper object used by fallback rows.
            searchKey: { configurable: true, enumerable: true, get: readPrecomputedSearchKey },
            pinyinSearchKey: { configurable: true, enumerable: true, get: readPrecomputedPinyinSearchKey }
          });
        } else {
          allSearchKeysPrecomputed = false;
        }
        // Keep the historical enumerable field shape while deferring the
        // expensive value.  Object spread does not invoke these accessors in
        // the normal directory path because person-search copies descriptors;
        // filter options and the opt-in diagnostic spread still read the
        // getters and therefore retain the old fields and values.
        let cachedNameVariants;
        let cachedActivity;
        let cachedRepresentativeWorks;
        Object.defineProperties(record, {
          nameVariants: {
            enumerable: true, configurable: true,
            get: () => cachedNameVariants ??= (Array.isArray(row.nameVariants) ? row.nameVariants : row.aliases ?? [])
              .map(value => typeof value === 'string' ? { name: value } : value).filter(value => text(value?.name))
          },
          activity: {
            enumerable: true, configurable: true,
            get: () => cachedActivity ??= buildPersonDirectoryActivity(names, axis)
          },
          representativeWorks: {
            enumerable: true, configurable: true,
            get: () => cachedRepresentativeWorks ??= (() => {
              // Rank only this person's works.  The previous implementation
              // sorted all 34k works to assign global ranks before sorting a
              // visible person's subset; the comparator is identical, so a
              // local sort preserves representative-work order with much
              // less cold CPU and no change to family de-duplication.
              const candidates = [];
              for (const workId of workIdsByCanonical.get(row.canonicalEntityId) ?? []) {
                const work = directoryMetadataIds.has(workId) ? workMetadataById.get(workId) : null;
                const year = work ? directoryYear(workId) : null;
                if (work && (year !== null || work.releaseDate === undefined)) candidates.push(work);
              }
              candidates.sort((left, right) => Number(right.bangumiVoteCount ?? -1) - Number(left.bangumiVoteCount ?? -1)
                || idCollator.compare(text(left.workId), text(right.workId)));
              const directoryFamilies = new Set();
              return candidates.filter(work => {
                  const key = familyKey(work.workId);
                  if (directoryFamilies.has(key)) return false;
                  directoryFamilies.add(key); return true;
                }).slice(0, 3).map(work => ({
                  workId: String(work.workId), title: work.displayTitle ?? work.title ?? `作品 ${work.workId}`,
                  bangumiScore: Number.isFinite(work.bangumiScore) ? work.bangumiScore : null,
                  bangumiVoteCount: number(work.bangumiVoteCount), imageUrl: imageUrl(work.projectedThumbnailPath ?? work.coverPath)
                }));
            })()
          }
        });
        records[sourceIndex] = record;
        if (shouldYieldDirectoryBatch(sourceIndex)) await yieldDirectoryTask();
      }
      const seenEntityIds = new Set();
      for (let index = 0; index < records.length; index += 1) {
        const row = records[index];
        if (!/^per_[A-Za-z0-9]+$/u.test(row.entityId) || seenEntityIds.has(row.entityId)) {
          throw new TypeError('人物目录身份重复或无效');
        }
        seenEntityIds.add(row.entityId);
        if (shouldYieldDirectoryBatch(index)) await yieldDirectoryTask();
      }
      // Restore the original landing order: works credited, then source name.
      // The generated summary is canonicalEntityId ordered and must not leak
      // that storage order into the UI.
      const compareDirectoryRecords = (left, right) => Number(right.workCount ?? 0) - Number(left.workCount ?? 0)
        || compareNames(left.displayName ?? left.canonicalName, right.displayName ?? right.canonicalName)
        || text(left.entityId).localeCompare(text(right.entityId), 'en');
      const sortedRecords = await sortDirectoryRecords(records, compareDirectoryRecords);
      personById = new Map();
      personByCanonical = new Map();
      for (let index = 0; index < sortedRecords.length; index += 1) {
        const row = sortedRecords[index];
        personById.set(row.entityId, row);
        personByCanonical.set(row.canonicalEntityId, row);
        if (shouldYieldDirectoryBatch(index)) await yieldDirectoryTask();
      }
      return { records: sortedRecords, activityAxis: axis, lazySearch: true, searchKeysPrecomputed: allSearchKeysPrecomputed };
    });
  }

  function ensurePersonSourceIndex() {
    if (personBySourceId) return personBySourceId;
    personBySourceId = new Map();
    for (const row of personById?.values?.() ?? []) {
      for (const sourceId of [row.canonicalEntityId, ...(row.sourceIds ?? [])]) {
        const key = text(sourceId);
        if (key && !personBySourceId.has(key)) personBySourceId.set(key, row);
      }
    }
    return personBySourceId;
  }

  // Staff/cast records can carry a source person ID while the person route
  // uses the stable per_... ID. Resolve only explicit source identities; do
  // not infer a match from display text.
  async function resolvePersonIdentity(sourcePersonId) {
    await loadDirectory();
    const key = text(sourcePersonId);
    const person = personById.get(key) ?? personByCanonical.get(key) ?? ensurePersonSourceIndex().get(key);
    return person ? { entityId: person.entityId, displayName: person.displayName,
      canonicalName: person.canonicalName, canonicalEntityId: person.canonicalEntityId } : null;
  }

  async function loadPersonRelationIndex() {
    return once('person-relations-index', async () => {
      await loadDirectory();
      const byWork = new Map();
      for (const [canonical, workIds] of workIdsByCanonical) {
        for (const workId of workIds ?? []) {
          const bucket = byWork.get(String(workId)) ?? new Set();
          bucket.add(canonical); byWork.set(String(workId), bucket);
        }
      }
      return { byWork };
    });
  }

  function relationWorkIds(relation, catalog) {
    if (relation?.egsWorkId) return [String(relation.egsWorkId)];
    const fallback = catalog.byId.get(relation?.presentationWorkId)?.defaultEgsWorkId;
    return fallback ? [String(fallback)] : [];
  }

  async function workMetadataFor(ids) {
    const uniqueIds = [...new Set(ids.map(value => String(value)).filter(Boolean))];
    const missing = uniqueIds.filter(id => !workMetadataById.has(id));
    if (missing.length && typeof readWorkMetadata === 'function') {
      const loaded = await readWorkMetadata(missing);
      for (const work of loaded ?? []) workMetadataById.set(String(work.workId), work);
    }
    return uniqueIds.map(id => workMetadataById.get(id)).filter(Boolean);
  }

  const characterRoleWeight = role => {
    const value = String(role ?? '');
    return ['main', 'primary', 'メイン', '主角'].includes(value) ? 2
      : ['side', 'sub', 'サブ', '配角'].includes(value) ? 1 : 0;
  };

  // The directory summary intentionally stays cheap: it contains 53,075
  // people, so reading every person's work cast here would turn the landing
  // page into a full character-data load.  The view calls this port only for
  // the visible page.  Keep both the person result and each work cast cached;
  // once() removes rejected promises, which makes a transient failure safely
  // retryable on the next render.
  async function personCastRows(id) {
    await loadDirectory();
    const summary = personById.get(String(id));
    if (!summary || !loadPersonCast) return [];
    return once(`person-cast:${summary.entityId}`, async () => {
      const [rows, names, catalog, availableImages] = await Promise.all([
        loadPersonCast(summary.canonicalEntityId),
        characterNames ? Promise.resolve(characterNames) : loadCharacterNames(), runtime.loadCatalog(),
        loadCharacterAvailability ? loadCharacterAvailability() : Promise.resolve(null)
      ]);
      characterNames = names;
      const workIds = rows.map(row => catalog.byId.get(row.presentationWorkId)?.defaultEgsWorkId).filter(Boolean).map(String);
      const works = new Map((await workMetadataFor(workIds)).map(work => [String(work.workId), work]));
      return rows.flatMap(row => {
        const workId = String(catalog.byId.get(row.presentationWorkId)?.defaultEgsWorkId ?? '');
        const work = works.get(workId); if (!work) return [];
        const display = characterDisplayName({sourceIds:row.sourceIds, originalNameCandidate:row.originalName, displayName:row.name}, names, row.name);
        return [{...row, name:display.name, originalName:display.originalName, workId,
          imageAvailable: availableImages?.has(row.characterId) ?? row.imageAvailable,
          title:work.displayTitle ?? work.title, releaseDate:work.releaseDate,
          bangumiVoteCount:work.bangumiVoteCount}];
      });
    });
  }

  async function loadRepresentativeCharacters(id, { limit = 3 } = {}) {
    await loadDirectory();
    const summary = personById.get(String(id));
    if (!summary) return [];
    if (loadPersonCast) {
      const selected = await once(`person-ranked-cast:${summary.entityId}`, async () => {
        // Select a wider candidate window first; some early source rows have
        // no public image while later VNDB rows for the same person do.
        const rows = selectRepresentativeCharacters(await personCastRows(id), 16);
        const images = loadCharacterImages ? await loadCharacterImages(rows.map(row => row.characterId)) : null;
        return rows.map((row, index) => ({...row, imageUrl:images?.get?.(row.characterId)?.url ?? row.imageUrl ?? null, _imageRank: images?.get?.(row.characterId)?.url ? 0 : 1, _imageOrder:index}))
          .sort((a, b) => a._imageRank - b._imageRank || a._imageOrder - b._imageOrder)
          .map(({_imageRank, _imageOrder, ...row}) => row).slice(0, 4);
      });
      return selected.slice(0, Math.max(0, Math.min(4, limit)));
    }
    const personId = summary.entityId;
    const rows = await once(`person-representative:${personId}`, async () => {
      if (!characterNames) {
        try { characterNames = await loadCharacterNames(); }
        catch (error) { console.warn('角色中文名暂不可用，保留来源名称', error); characterNames = {}; }
      }
      const relations = await runtime.loadEntityRelations('persons', summary.canonicalEntityId);
      const catalog = await runtime.loadCatalog();
      const identityKeys = new Set([personId, summary.canonicalEntityId, ...(summary.sourceIds ?? [])].map(value => String(value)));
      const byWork = new Map();
      for (const relation of relations?.workRelations ?? []) {
        if (relation?.roleCode !== 'voice-actor') continue;
        const characterId = relation.bangumiCharacterId ?? relation.vndbCharacterId ?? relation.characterId ?? null;
        if (!characterId) continue;
        for (const workId of relationWorkIds(relation, catalog)) {
          const key = String(workId);
          const bucket = byWork.get(key) ?? [];
          bucket.push({ relation, characterId: String(characterId) });
          byWork.set(key, bucket);
        }
      }
      const orderedWorks = [...byWork].map(([workId, entries]) => ({
        workId, entries, work: workMetadataById.get(workId)
      })).sort((left, right) =>
        Number(right.entries.reduce((best, entry) => Math.max(best, characterRoleWeight(entry.relation.characterRole)), 0))
          - Number(left.entries.reduce((best, entry) => Math.max(best, characterRoleWeight(entry.relation.characterRole)), 0))
        || Number(right.work?.bangumiVoteCount ?? -1) - Number(left.work?.bangumiVoteCount ?? -1)
        || text(left.workId).localeCompare(text(right.workId), 'en'));
      // Four works is enough to find three distinct accepted roles while
      // keeping a single visible page bounded even for prolific voice actors.
      const candidates = orderedWorks.slice(0, 4);
      const results = typeof loadWorkCharacters === 'function'
        ? await Promise.allSettled(candidates.map(({ workId }) => once(`work-characters:${workId}`, () => loadWorkCharacters(workId))))
        : [];
      if (results.length && results.every(result => result.status === 'rejected')) {
        throw results[0].reason ?? new Error('代表角色资料暂时不可用');
      }
      const output = [];
      const seen = new Set();
      const push = (character, workId, work, fallback = null) => {
        const key = String(character?.characterId ?? character?.id ?? fallback?.characterId ?? '');
        if (!key || seen.has(key) || output.length >= 16) return;
        seen.add(key);
        const imagePath = character?.image?.assetPath ?? character?.assetPath ?? null;
        const image = character?.image?.url ?? character?.imageUrl ?? imageUrl(imagePath)
          ?? (characterImageById?.get?.(key)?.assetPath ? imageUrl(characterImageById.get(key).assetPath) : null);
        output.push({ characterId: key,
          sourceIds: character?.sourceIds,
          name: character?.characterName ?? character?.name ?? fallback?.name ?? `角色 ${key}`,
          imageUrl: image, workId: String(workId),
          title: work?.displayTitle ?? work?.title ?? fallback?.title ?? `作品 ${workId}`,
          role: character?.role ?? fallback?.relation?.characterRole ?? null });
      };
      for (let index = 0; index < results.length && output.length < 16; index++) {
        const result = results[index];
        const candidate = candidates[index];
        if (result.status !== 'fulfilled') continue;
        const cast = Array.isArray(result.value?.cast) ? result.value.cast : [];
        const accepted = cast.filter(character => (character.actors ?? []).some(actor => identityKeys.has(String(actor.personId))));
        for (const character of accepted.sort((left, right) => characterRoleWeight(right.role) - characterRoleWeight(left.role))) {
          const fallback = candidate.entries.find(entry => String(entry.characterId) === String(character.characterId));
          push(character, candidate.workId, candidate.work, fallback);
        }
      }
      // A loaded work roster is authoritative. Never pad a short roster with
      // raw source IDs: those can refer to the same canonical role again.
      if (typeof loadWorkCharacters !== 'function') for (const candidate of candidates) {
        for (const entry of candidate.entries) {
          const name = sourceCharacterName(entry.relation) ?? entry.relation.characterName ?? entry.relation.sourceRoleDetailName;
          const namespace = entry.relation.bangumiCharacterId ? 'bangumi' : entry.relation.vndbCharacterId ? 'vndb' : entry.relation.source;
          push({ characterId: `${namespace}:${entry.characterId}`, name }, candidate.workId, candidate.work, entry);
          if (output.length >= 16) break;
        }
        if (output.length >= 16) break;
      }
      return output;
    });
    const size = Number.isSafeInteger(limit) ? Math.max(0, Math.min(4, limit)) : 3;
    const ordered = selectRepresentativeCharacters(rows);
    return ordered.slice(0, size);
  }

  async function loadPerson(id) {
    await loadDirectory();
    const summary = personById.get(id);
    if (!summary) return null;
    if (!characterNames) {
      try { characterNames = await loadCharacterNames(); }
      catch (error) { console.warn('角色中文名暂不可用，保留来源名称', error); characterNames = {}; }
    }
    const relations = await runtime.loadEntityRelations('persons', summary.canonicalEntityId);
    const catalog = await runtime.loadCatalog();
    const raw = relations?.workRelations ?? [];
    const workIds = [...new Set(raw.flatMap(relation => relationWorkIds(relation, catalog)))];
    const works = new Map((await workMetadataFor(workIds)).map(work => [String(work.workId), work]));
    const credits = [];
    for (const relation of raw) {
      for (const workId of relationWorkIds(relation, catalog)) {
        const work = works.get(String(workId));
        if (!work) continue;
        const characterId = relation.bangumiCharacterId ?? relation.vndbCharacterId ?? relation.characterId ?? null;
        const characterName = sourceCharacterName(relation) ?? relation.characterName ?? relation.sourceRoleDetailName;
        credits.push({ ...relation, workId: String(workId), title: work.displayTitle ?? work.title,
          displayTitle: work.displayTitle ?? work.title, releaseDate: work.releaseDate ?? '',
          roleCode: relation.roleCode ?? 'unknown',
          creditType: relation.roleCode === 'voice-actor' ? 'character-voiced-by' : 'work-credits-person',
          characterId, characterName, bangumiScore: work.bangumiScore,
          bangumiVoteCount: work.bangumiVoteCount,
          workThumbnailPath: work.projectedThumbnailPath ?? work.coverPath ?? null });
      }
    }
    const historicalCredits = credits.filter(credit => releasedYear(works.get(credit.workId)) !== null);
    const years = [...new Set(historicalCredits.map(credit => credit.workId))].map(workId => releasedYear(works.get(workId))).filter(Boolean);
    const counts = new Map();
    for (const year of years) counts.set(year, (counts.get(year) ?? 0) + 1);
    const peak = Math.max(1, ...counts.values());
    const firstYear = years.length ? Math.min(...years) : null;
    const lastYear = years.length ? Math.max(...years) : null;
    const axis = (await loadDirectory()).activityAxis;
    const activity = buildPersonDirectoryActivity(years, axis);

    const relationIndex = await loadPersonRelationIndex();
    const coCounts = new Map();
    for (const workId of workIds) {
      for (const canonical of relationIndex.byWork.get(String(workId)) ?? []) {
        if (canonical === summary.canonicalEntityId) continue;
        const peer = personByCanonical.get(canonical);
        if (peer) coCounts.set(peer.entityId, (coCounts.get(peer.entityId) ?? 0) + 1);
      }
    }
    const getCoActors = () => [...coCounts].map(([personId, count]) => {
      const peer = personById.get(personId);
      return { personId, count, name: peer?.displayName ?? peer?.canonicalName ?? '未命名人物' };
    }).sort((left, right) => right.count - left.count || compareNames(left.name, right.name)).slice(0, 8);

    await loadCompanies();
    const companyCounts = new Map();
    for (const workId of workIds) {
      const companyId = companyIdForWork(works.get(String(workId)));
      if (companyId) companyCounts.set(companyId, (companyCounts.get(companyId) ?? 0) + 1);
    }
    const getCoCompanies = () => [...companyCounts].map(([companyId, count]) => ({
      companyId, count, name: text(companyById.get(companyId)?.name) || '未收录会社'
    })).sort((left, right) => right.count - left.count || compareNames(left.name, right.name)).slice(0, 5);

    const representativeWorks = [];
    const seenFamilies = new Set();
    [...new Map(historicalCredits.map(credit => [credit.workId, credit])).values()]
      .map(credit => { const work = works.get(credit.workId); return {
        workId: credit.workId, title: work?.displayTitle ?? work?.title ?? credit.displayTitle ?? credit.title,
        releaseDate: work?.releaseDate ?? credit.releaseDate ?? '',
        median: number(work?.median), voteCount: number(work?.voteCount),
        bangumiScore: Number.isFinite(work?.bangumiScore) ? work.bangumiScore : null,
        bangumiVoteCount: number(work?.bangumiVoteCount),
        imageUrl: imageUrl(work?.projectedThumbnailPath ?? work?.coverPath)
      }; }).sort((left, right) => Number(right.bangumiVoteCount ?? -1) - Number(left.bangumiVoteCount ?? -1)
        || text(left.workId).localeCompare(text(right.workId), 'en')
        || compareNames(left.title, right.title)).some(work => {
          const key = familyKey(work.workId);
          if (seenFamilies.has(key)) return false;
          seenFamilies.add(key); representativeWorks.push(work); return representativeWorks.length >= 3;
        });

    const [representativeCharacters, timelineCharacters] = await Promise.all([
      loadRepresentativeCharacters(id, { limit: 4 }), loadPersonCast ? personCastRows(id) : Promise.resolve(null)
    ]);
    const canonicalCharacters = new Map();
    const ambiguousCharacters = new Set();
    const bindCharacter = (source, key, character) => {
      if (!key) return;
      const id = `${timelineCharacters ? character.presentationWorkId + ':' : ''}${source}:${key}`;
      if (canonicalCharacters.has(id) && canonicalCharacters.get(id).characterId !== character.characterId) ambiguousCharacters.add(id);
      else canonicalCharacters.set(id, character);
    };
    for (const character of timelineCharacters ?? representativeCharacters) {
      bindCharacter('canonical', character.characterId, character);
      bindCharacter('vndb', character.sourceIds?.vndbCharacterId, character);
      for (const id of character.sourceIds?.egsCharacterIds ?? []) bindCharacter('egs', id, character);
      for (const row of character.sourceIds?.bangumi ?? []) bindCharacter('bangumi', row.characterId, character);
    }
    for (const credit of credits) {
      const keys = [credit.bangumiCharacterId && `bangumi:${credit.bangumiCharacterId}`,
        credit.vndbCharacterId && `vndb:${credit.vndbCharacterId}`,
        credit.characterId && `canonical:${credit.characterId}`,
        credit.characterId && `${credit.source}:${credit.characterId}`];
      const scopedKeys = keys.filter(Boolean).map(key => `${timelineCharacters ? credit.presentationWorkId + ':' : ''}${key}`);
      const resolved = scopedKeys.filter(key => !ambiguousCharacters.has(key)).map(key => canonicalCharacters.get(key)).filter(Boolean);
      if (resolved.length && new Set(resolved.map(row => row.characterId)).size === 1) {
        credit.sourceCharacterId = credit.characterId;
        credit.characterId = resolved[0].characterId;
        credit.characterName = resolved[0].name;
        credit.characterRole = resolved[0].role ?? credit.characterRole;
      }
    }

    const roleWorkKeys = new Map();
    for (const credit of credits) {
      const role = credit.creditType === 'character-voiced-by' ? 'voice-actor' : String(credit.roleCode ?? 'unknown');
      const bucket = roleWorkKeys.get(role) ?? new Set(); bucket.add(credit.workId); roleWorkKeys.set(role, bucket);
    }
    const roles = Object.fromEntries([...roleWorkKeys].map(([role, ids]) => [role, ids.size]));
    return { ...summary, credits, totalCredits: credits.length, workCount: summary.workCount ?? new Set(workIds.map(familyKey)).size, editionCount: works.size,
      roles, primaryRole: summary.primaryRole ?? Object.entries(roles).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'unknown',
      firstYear, lastYear, spanLabel: formatPersonActivitySpan(firstYear, lastYear), activity,
      activityYears: firstYear === null || lastYear === null ? [] : Array.from({length:lastYear - firstYear + 1}, (_, index) => {
        const year = firstYear + index, count = counts.get(year) ?? 0;
        return {year, count, percent:Math.round(count / peak * 100)};
      }),
      representativeWorks, representativeCharacters, timelineCast: timelineCharacters ?? [], getCoActors, getCoCompanies,
      coActors: getCoActors(), coCompanies: getCoCompanies() };
  }

  async function loadCompanies() {
    return once('company-ui', async () => {
      const rows = (await file('directory/company-summary.json')).rows;
      const aliases = row => (row.sourceIds ?? []).filter(value => /^egs:brand:[1-9][0-9]*$/u.test(value)).map(value => value.split(':')[2]).sort((a, b) => Number(a) - Number(b));
      const id = row => aliases(row)[0] ?? row.canonicalEntityId;
      companyById = new Map(rows.map(row => [id(row), row]));
      if (companyById.size !== rows.length) throw new TypeError('会社目录身份重复');
      return restoreCompanySummary(rows.map(row => ({ companyId: id(row), companyIdAliases: aliases(row), canonicalEntityId: row.canonicalEntityId,
        brandName: row.name, searchAliases: row.aliases ?? [], searchText: [row.name, ...(row.aliases ?? [])].join('\n').normalize('NFKC').toLocaleLowerCase('ja-JP'),
        workCount: row.workCount ?? 0, releaseYearStart: row.firstYear ?? null, releaseYearEnd: row.lastYear ?? null,
        totalVoteCount: row.totalVoteCount ?? null, averageVoteCount: row.averageVoteCount ?? null, avatar: row.avatar ?? null,
        fallbackWorkId: row.fallbackWorkId ?? null, fallbackCoverPath: row.fallbackCoverPath ?? null })));
    });
  }
  async function companyWorkIds(id, sort) {
    await loadCompanies();
    const row = companyById?.get(id); if (!row) return [];
    const index = await file('relations/companies.json');
    const catalog = await runtime.loadCatalog();
    const defaults = new Map([...catalog.byId].map(([pid, value]) => [pid, value.defaultEgsWorkId]));
    const ids = resolveCompanyWorkIds(index, row.canonicalEntityId, defaults);
    const works = [...(await loadWorks(ids)).values()];
    return sortCatalog(works, sort?.sortKey ?? 'releaseDate', sort?.direction ?? 'asc').map(work => work.workId);
  }
  return Object.freeze({ loadDirectory, loadPerson, loadRepresentativeCharacters, loadCompanies, companyWorkIds, resolvePersonIdentity,
    personIndex: { load: async () => normalizePersonWorkIndexAsync(await file('indexes/person-work-index.json')) } });
}

import { buildPersonRecords } from './person-workspace-records.js';
import { filterPersonsBySearch, withCjkPersonSearchKey } from './person-search.js';
import { syncHeadingCount } from './ui-page-heading.js';

// Owns person projection/cache state. Navigation, selection and shared work data
// remain with their existing owners and enter through explicit ports.
export function createPersonWorkspaceController({
  coreRuntime = null, performanceRuntime = null, workIds, worksById, readWorkMetadata = null,
  model, loadCharacterImages, onHydrated = () => {}, publishDiagnostic = null,
  logger = console
}) {
  let records = null, activityAxis = null, sourceState = null;
  let directoryPending = null, hydrationPending = null, workMetadata = null;
  const detailCache = new Map();

  function project(images) {
    const result = buildPersonRecords(sourceState, {
      ...model, worksById: workMetadata ?? worksById
    }, images);
    records = result.records;
    activityAxis = result.activityAxis;
  }
  function publish(hydrated = false) {
    if (!publishDiagnostic) return;
    publishDiagnostic({ activityAxis, hydrated, records: records.map(person => ({
      ...person, coActors: person.getCoActors?.() ?? person.coActors ?? [],
      coCompanies: person.getCoCompanies?.() ?? person.coCompanies ?? []
    })) });
  }
  function hydrate() {
    if (hydrationPending !== null) return;
    hydrationPending = Promise.resolve().then(loadCharacterImages).then(images => {
      if (images && sourceState) {
        project(images);
        publish(true);
        onHydrated();
      } else publish(true);
    }).catch(() => undefined); // Optional images do not poison the text directory.
  }
  async function prepareDirectory() {
    if (performanceRuntime !== null) {
      try {
        const directory = await performanceRuntime.loadDirectory();
        activityAxis = directory.activityAxis;
        records = directory.records.map(withCjkPersonSearchKey);
        return records;
      } catch (error) {
        // Retry the configured source; never switch to a different legacy snapshot.
        logger.warn('person directory temporarily unavailable; retry the configured source', error);
        throw error;
      }
    }
    sourceState = await coreRuntime.load();
    if (readWorkMetadata && workMetadata === null) {
      const ids = [...new Set(sourceState.records.flatMap(person =>
        (person.credits ?? []).map(credit => String(credit.workId ?? ''))
      ).filter(id => workIds.has(id)))];
      workMetadata = new Map((await readWorkMetadata(ids)).map(work => [work.workId, work]));
    }
    project(null);
    publish();
    hydrate();
    return records;
  }
  function loadDirectory() {
    if (!coreRuntime && !performanceRuntime) return Promise.resolve([]);
    if (records !== null) return Promise.resolve(records);
    if (!directoryPending) {
      const request = prepareDirectory();
      directoryPending = request;
      const release = () => { if (directoryPending === request) directoryPending = null; };
      request.then(release, release);
    }
    return directoryPending;
  }
  async function loadPerson(personId, summary) {
    if (detailCache.has(personId)) return detailCache.get(personId);
    if (performanceRuntime === null) return summary;
    let detail;
    try { detail = await performanceRuntime.loadPerson(personId); }
    catch (error) {
      logger.warn('person detail temporarily unavailable; summary remains visible', error);
      throw error;
    }
    let resolved = detail ?? summary;
    if (readWorkMetadata && resolved?.credits?.length) {
      const ids = [...new Set(resolved.credits.map(credit => String(credit.workId ?? '')).filter(id => workIds.has(id)))];
      const metadata = new Map((await readWorkMetadata(ids)).map(work => [work.workId, work]));
      resolved = { ...resolved, credits: resolved.credits.map(credit => {
        const work = metadata.get(String(credit.workId));
        return { ...credit, workThumbnailPath: work?.projectedThumbnailPath ?? work?.coverPath ?? null };
      }) };
    }
    if (detail) detailCache.set(personId, resolved);
    return resolved;
  }
  function render({ elements, view, query, selectedPersonId, syncSearchClears }) {
    const { root, search, count, list, empty } = elements;
    if (search.value !== query) search.value = query;
    syncSearchClears();
    if (!view) return;
    const loading = root.querySelector('#person-directory-loading');
    if (!records) {
      root.setAttribute('aria-busy', 'true');
      if (loading) loading.hidden = false;
      count.textContent = '加载中…';
      list.replaceChildren();
      empty.hidden = true;
      return;
    }
    root.setAttribute('aria-busy', 'false');
    if (loading) loading.hidden = true;
    const persons = filterPersonsBySearch(records, query);
    syncHeadingCount(root.querySelector('#person-directory-total'), records.length, '位人物');
    view.render({ persons, totalPersonCount: records.length, selectedPersonId: selectedPersonId ?? null, activityAxis });
  }
  return Object.freeze({ loadDirectory, loadPerson, render,
    get records() { return records; }, get activityAxis() { return activityAxis; }
  });
}

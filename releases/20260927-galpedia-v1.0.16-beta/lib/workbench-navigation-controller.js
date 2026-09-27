import { createWorkspaceSession } from './workspace-session.js';
import { parseSelectionShare } from './share-selection.js';
import { formatUiLocationHash, parseUiLocationHash } from './ui-location-state.js';

export function projectUiLocation({ state, person, company, workId, subject, workPage }) {
  if (person.open) return { page: 'persons', personId: person.id,
    query: person.query, role: person.role, pageNumber: person.page };
  if (company.open) return company.id !== null ? { page: 'companies', companyId: company.id }
    : { page: 'companies', query: company.query, sort: company.sort, hasImage: company.hasImage, pageNumber: company.page };
  if (state.workspaceMode === 'ranking') return { page: 'ranking', subject };
  if (workId !== null) return { page: 'works', workId };
  return { page: 'works', query: state.filterState.titleQuery,
    sort: `${state.filterState.sortKey}-${state.filterState.sortDirection}`, pageNumber: workPage };
}

// The only workbench history writer. Page adapters apply their existing state;
// this controller owns ordering, URL suppression and asynchronous handoff.
export function createWorkbenchNavigationController({
  locationRef, historyRef, snapshot, isHome, isHomeRoute, invalidate,
  home, ranking, companies, persons, works, render, onError = () => {}
}) {
  const session = createWorkspaceSession();
  let applying = false, inFlight = null;
  function begin(key) {
    const ticket = session.begin(key);
    applying = false;
    invalidate();
    return ticket;
  }
  function update(method = 'replaceState') {
    if (!['replaceState', 'pushState'].includes(method)) throw new TypeError('Invalid history method');
    if (applying || (isHome() && method === 'replaceState')) return false;
    const url = new URL(locationRef.href);
    url.hash = formatUiLocationHash(snapshot()).slice(1);
    historyRef[method]({}, '', url.href);
    return true;
  }
  function clearShareHash() {
    const url = new URL(locationRef.href); url.hash = '';
    historyRef.replaceState({}, '', url.href);
  }
  function apply() {
    if(inFlight?.hash===locationRef.hash&&inFlight.ticket.isCurrent())return inFlight.promise;
    const ticket=begin('location'),hash=locationRef.hash;
    const promise=applyRoute(ticket,hash);
    const entry={ticket,hash,promise};inFlight=entry;
    const release=()=>{if(inFlight===entry)inFlight=null;};promise.then(release,release);
    return promise;
  }
  async function applyRoute(generation, sourceHash) {
    const current = () => generation.isCurrent() && locationRef.hash === sourceHash;
    if (parseSelectionShare(locationRef) !== null) return false;
    if (isHomeRoute()) { home(); return true; }
    const route = parseUiLocationHash(sourceHash);
    if (route === null) { update(); return false; }
    applying = true;
    try {
      if (route.page === 'ranking') {
        ranking.enter(route); await render(); return true;
      }
      if (route.page === 'companies') {
        companies.enter(route); companies.setPage(route.pageNumber);
        await render();
        if (current() && route.companyId === null) companies.setPage(route.pageNumber);
        return true;
      }
      if (route.page === 'persons') {
        persons.enter(route); persons.show();
        await persons.ensureReady();
        if (current()) await persons.finish(route);
        return true;
      }
      if (route.workId !== null) {
        // A direct detail deep link needs one work shard, not a full result
        // query. Render the dialog from the pinned work reference first; the
        // normal list query remains unchanged for #works pages.
        works.enter(route);
        const work = works.find(route.workId);
        if (work) {
          await works.open(work);
          if (locationRef.hash.startsWith('#works/work/')) update();
        } else update();
        return true;
      }
      works.enter(route);
      await render();
      if (!current()) return true;
      works.setPage(route.pageNumber);
      return true;
    } catch(error) {
      // Leaving a failed route must not poison the new workspace or create an
      // unhandled rejection in hashchange/popstate listeners. Views own retry UI.
      if(current()){generation.fail(error);onError(error);}
      return false;
    } finally {
      if (generation.isCurrent()) applying = false;
    }
  }
  return Object.freeze({ begin, apply, update, clearShareHash,
    get applying() { return applying; }, dispose() { session.dispose(); applying = false; } });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const main=await read('../main.js'),boot=await read('../galpedia-boot.js');

test('shell route, handbook and focus observers use the same session contract',()=>{
  for(const lane of ['routeSession','helpSession','focusSession'])assert.match(boot,new RegExp(`const ${lane} = createWorkspaceSession`));
  assert.doesNotMatch(boot,/routeRequest|helpRequest/);
  assert.match(boot,/ticket\.scope\.add\(\(\) => \{ focusObserver\.disconnect\(\); clearTimeout\(focusTimeout\)/);
  assert.match(boot,/if \(!isHome\(\) && runtimeTicket/);
});
test('full runtime navigation invalidates pending UI before preparing the next route',()=>{
  const start=main.indexOf('function beginUiNavigation'),end=main.indexOf('async function applyUiLocation',start),block=main.slice(start,end);
  for(const lane of ['workbenchQuery','companyWorkspace','detailOpening'])assert.ok(block.includes(`${lane}.suspend()`));
  assert.match(block,/selectionView\.suspend\(\)/);
  assert.match(block,/cancelRankingPreload\(\)/);
  assert.doesNotMatch(block,/clearFilters|clearSelection|terminate|clearCache/);
  assert.match(main,/const generation = beginUiNavigation\('location'\)/);
});
test('direct person navigation and queued company navigation cannot repaint after leaving',()=>{
  assert.match(main,/await ensurePersonRuntime\(\);\s*if \(!navigation\.isCurrent\(\) \|\| !personDirectoryOpen\) return;/);
  assert.match(main,/if \(!navigation\.fail\(error\)\) return;/);
  assert.match(main,/const open = \(\) => \{\s*if \(!navigation\.isCurrent\(\)\) return;/);
  assert.match(main,/navigation\.scope\.add\(\(\) => window\.clearTimeout\(timer\)\)/);
});
test('workbench and detail late failures do not announce errors in the next workspace',async()=>{
  const query=await read('workbench-query-controller.js');
  assert.match(query,/if \(!generation\.isCurrent\(\)\) return stale\(interaction, 'superseded-error'\);\s*generation\.fail\(error\);\s*metrics\.cancel\(interaction, 'worker-error'\)/);
  assert.match(main,/queryResult\.status === 'error' && queryResult\.generation\.isCurrent\(\)/);
  assert.match(await read('work-detail-controller.js'),/if \(!sequence\.isCurrent\(\)\) return;\s*sequence\.fail\(error\);/);
  assert.match(main,/if \(elements\.detailsDialog\.open\) return;[^\n]*\n\s*workDetailStats\.suspend/);
});
test('private statistics request is cancelable; shared catalog and people loaders stay reusable',async()=>{
  const detailResources=await read('work-detail-resources-controller.js');
  assert.match(detailResources,/fetchImpl\(endpoint, \{ cache: 'default', credentials: 'omit', signal: request\.signal \}\)/);
  assert.match(main,/workDetailResources\.suspend\(\)/);
  for(const file of ['person-workspace-data.js','company-workspace-data.js','workbench-demand-data.js']){
    const source=await read(file);assert.doesNotMatch(source,/workspace-session|view-lifetime|routeSession|detailHydrationSession/);
  }
});
test('result and person views expose suspension without clearing persisted selection or ranking',async()=>{
  const selection=await read('../views/selection-view.js'),person=await read('../views/person-directory-view.js');
  assert.match(selection,/suspend\(\) \{\s*hydrationSession\.suspend\(\);\s*remotePagePending = false;/);
  assert.match(selection,/generation\.isCurrent\(\) \? onPageRequest/);
  assert.match(person,/suspend\(\) \{ invalidateDetailRequest\(\); \}/);
  assert.match(person,/dispose\(\) \{ detailSession\.dispose\(\); lifetime\.dispose\(\)/);
  assert.doesNotMatch(selection,/hydrationGeneration/);assert.doesNotMatch(person,/let detailRequest/);
});
test('command surface and early preview pair event registration with terminal cleanup',async()=>{
  const search=await read('galpedia-command-search.js'),landing=await read('workbench-landing.js');
  assert.doesNotMatch(search,/\.addEventListener\(/);
  assert.match(search,/lifetime\.add\(\(\) => \{ clearTimeout\(debounce\); queries\.dispose\(\); shortcuts\.remove/);
  assert.match(search,/const api = await ensureRuntime\(\);\s*if \(!token\.isCurrent\(\) \|\| !dialog\.open\) return;/);
  assert.match(landing,/if\(lifetime\.disposed\|\|isReady/);
  assert.match(landing,/session\.dispose\(\);lifetime\.dispose\(\)/);
});

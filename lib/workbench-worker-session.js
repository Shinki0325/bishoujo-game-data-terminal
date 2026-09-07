import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {createFilterWorkerClient} from './filter-worker-client.js';

let client=null,loaded=null,receiveData=null;
// The verified worker-owned path is the default for works. The explicit
// legacyWorkbench escape hatch retains the complete-loader compatibility path.
export const WORKBENCH_WORKER_OWNED = true;
export function ownedWorkbenchEnabled(locationRef=globalThis.location) {
  const localProbe=['localhost','127.0.0.1','[::1]'].includes(locationRef?.hostname)
    && new URLSearchParams(locationRef?.search??'').get('workerWorkbench')==='1';
  return (WORKBENCH_WORKER_OWNED||localProbe) && WORKBENCH_DEMAND.enabled && typeof Worker==='function'
    && /^#works(?:[/?]|$)/u.test(locationRef?.hash??'')
    && !new URLSearchParams(locationRef?.search??'').has('legacyWorkbench');
}
export function workbenchSourceDescriptor() {
  return {workbenchSource:{sha256:WORKBENCH_DEMAND.sha256,media:'on-demand-v1'},prepareSearch:true};
}
export function getOwnedWorkbenchClient() {
  return client??=createFilterWorkerClient({
    workerFactory:()=>new Worker(new URL('../workers/filter-worker.js?v=20260824-selection-source-sorting-v1',import.meta.url),{type:'module'}),
    timeoutMs:10000,initTimeoutMs:30000,onWorkbenchData:message=>receiveData?.(message)
  });
}
export function loadOwnedWorkbench() {
  return loaded??=new Promise((resolve,reject)=>{
    receiveData=resolve;
    getOwnedWorkbenchClient().init(workbenchSourceDescriptor()).catch(reject);
  }).catch(error=>{loaded=null;receiveData=null;throw error;});
}

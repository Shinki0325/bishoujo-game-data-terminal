import {createLoadCoordinator} from './load-coordinator.js';

// Explicit clicks only. No route, history, identity or view state is changed.
let intent=null;
export function holdWorkIntent(id){
  if(!/^[1-9][0-9]*$/u.test(String(id)))throw Error('作品准备身份无效');
  const ticket={id:String(id)};intent=ticket;
  return ()=>{if(intent===ticket)intent=null;};
}
export const pendingWorkIntent=()=>intent?.id??null;

// A session-local facade over the original verified loader, not another data
// source. Opening joins the earlier preparation; failed loads remain retryable.
export function createPreparedWorkLoader(loader){
  const coordinator=createLoadCoordinator({concurrency:2,backgroundConcurrency:1,maxEntries:2,maxCacheBytes:8*1024*1024});
  return Object.freeze({...loader,
    async load(id){
      const key=String(id);
      // Custom/local identities keep the original loader's compatibility and
      // validation path; only catalog edition IDs participate in preparation.
      if(!/^[1-9][0-9]*$/u.test(key))return loader.load(id);
      const model=await coordinator.read(key,()=>loader.load(key),{priority:'action'});
      // Each consumer keeps its own model, including view-local decorations.
      return structuredClone(model);
    }
  });
}

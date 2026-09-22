// Start the core download independently of the chart module dependency graph.
let pending;
export function beginStartupData(){
  if(!pending){
    pending=(async()=>{
      const response=await fetch(new URL('./full-data/manifest.json',import.meta.url),{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('全量快照清单加载失败');
      const manifest=await response.json();
      if(manifest.schemaVersion!=='galpedia-analysis-full-v1')throw Error('快照版本不兼容');
      const core=await fetch(new URL(manifest.packs.core.path,import.meta.url),{signal:AbortSignal.timeout(30000)});
      if(!core.ok)throw Error('资料加载失败，请重试：core');
      return {manifest,packed:await core.arrayBuffer()};
    })();
    // The app reports any failure once its own error UI is ready.
    pending.catch(()=>{});
  }
  return pending;
}

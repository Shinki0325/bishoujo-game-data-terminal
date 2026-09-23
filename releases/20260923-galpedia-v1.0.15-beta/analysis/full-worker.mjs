import {FullEngine,decodePack} from './full-data.mjs';
import {configureFields} from './model.mjs';
let engine,latest;
async function handle({id,type,value}){
  try{
    if(type==='init'){
      const {manifest,packed}=value;configureFields(manifest.fields);engine=new FullEngine(manifest);
      if(packed)engine.packs.core=await decodePack(manifest,'core',packed);
      const core=await engine.load('core');engine.coreIds=new Set(core.map(r=>r.id));
      postMessage({id,value:core.map(({id,company})=>({id,company}))});return;
    }
    latest=id;await new Promise(resolve=>setTimeout(resolve,30));
    if(id!==latest){postMessage({id,value:null});return;}
    const result=await engine.run(value);postMessage({id,value:result});
  }catch(error){postMessage({id,error:error.message});}
}
onmessage=({data})=>handle(data);

import {FullEngine} from './full-data.mjs';
import {configureFields} from './model.mjs';
let engine,latest;
async function handle({id,type,value}){
  try{
    if(type==='init'){configureFields(value.fields);engine=new FullEngine(value);postMessage({id,value:await engine.load('core')});return;}
    latest=id;await new Promise(resolve=>setTimeout(resolve,30));
    if(id!==latest){postMessage({id,value:null});return;}
    const result=await engine.run(value);postMessage({id,value:result});
  }catch(error){postMessage({id,error:error.message});}
}
onmessage=({data})=>handle(data);

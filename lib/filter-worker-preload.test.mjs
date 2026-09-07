import test from 'node:test';
import assert from 'node:assert/strict';
import {createFilterWorkerClient} from './filter-worker-client.js';

function fixture() {
  const workers=[];
  const client=createFilterWorkerClient({workerFactory(){
    const listeners=new Map();
    const worker={sent:[],stopped:false,
      addEventListener(type,fn){listeners.set(type,fn);},
      postMessage(message){this.sent.push(message);},
      terminate(){this.stopped=true;},
      emit(type,data){listeners.get(type)?.(type==='message'?{data}:{error:new Error('fixture failure')});}
    };
    workers.push(worker);return worker;
  }});
  return {client,workers};
}

test('preload creates one worker without sending data; init reuses it',async()=>{
  const {client,workers}=fixture();
  assert.equal(workers.length,0);
  client.preload();client.preload();
  assert.equal(workers.length,1);assert.deepEqual(workers[0].sent,[]);
  const pending=client.init({works:[]});
  assert.equal(workers.length,1);
  workers[0].emit('message',{id:workers[0].sent[0].id,type:'ready',workCount:0});
  assert.equal((await pending).status,'ready');client.terminate();
});

test('failure of speculative worker is recoverable at init',async()=>{
  const {client,workers}=fixture();client.preload();
  workers[0].emit('error');assert.equal(workers[0].stopped,true);
  const pending=client.init({works:[]});assert.equal(workers.length,2);
  workers[1].emit('message',{id:workers[1].sent[0].id,type:'ready',workCount:0});
  assert.equal((await pending).status,'ready');client.terminate();
});

test('terminated client cannot be preloaded again',()=>{
  const {client,workers}=fixture();client.terminate();
  assert.throws(()=>client.preload(),{code:'WORKER_TERMINATED'});assert.equal(workers.length,0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaEditController } from './media-edit-controller.js';
import { createMediaEditEnvironment } from '../views/media-edit-environment.js';

const base={title:'自定义测试',blob:new Blob(['image']),width:64,height:64};
const work={workId:'1',title:'作品',coverWidth:64,coverHeight:64};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(overrides={}) {
  const log=[];
  const store=Object.fromEntries(['putCustom','putStickerEdit','putReplacement','deleteCustom','deleteReplacement','clearStickerEdit'].map(name=>[name,async record=>log.push([name,record])]));
  store.editableFor=async()=>null;
  const environment={decodeBlob:async()=>({image:{},width:64,height:64,release:()=>log.push(['release-base'])}),
    loadStickerImages:async()=>({images:new Map(),release:()=>log.push(['release-assets'])}),
    loadEditor:async()=>({open:async options=>({...options,compositeBlob:new Blob(['composite']),document:{...options.document,layers:[{kind:'test'}]}})}),
    blobForUrl:async()=>base.blob,cancel:()=>log.push(['cancel'])};
  const options={store,environment,previewUrlForWork:async()=>'/image',authorityThumbnailPathForWork:()=> 'authority.webp',
    registerCustomWork:record=>log.push(['register',record]),onMediaChanged:async(...args)=>log.push(['changed',...args]),
    closePreview:()=>log.push(['close']),createId:()=> 'custom-local-test',...overrides};
  return {log,store,environment,controller:createMediaEditController(options)};
}

test('custom image creation stores before registration and rolls storage back if registration fails',async()=>{
  const f=fixture();await f.controller.createCustom(base);
  assert.deepEqual(f.log.map(row=>row[0]),['putCustom','register','changed']);
  assert.equal(f.log[1][1].localMediaKind,'custom');
  const broken=fixture({registerCustomWork(){throw Error('capacity');}});
  await assert.rejects(broken.controller.createCustom(base),/capacity/);
  assert.deepEqual(broken.log.map(row=>row[0]),['putCustom','deleteCustom']);
});
test('replacement authority is retained and restore publishes only after storage succeeds',async()=>{
  const f=fixture();await f.controller.replace(work,base);
  assert.equal(f.log[0][1].authorityThumbnailPath,'authority.webp');
  await f.controller.restore(work);
  assert.deepEqual(f.log.map(row=>row[0]),['putReplacement','changed','deleteReplacement','changed','close']);
  f.store.putReplacement=async()=>{throw Error('quota');};f.log.length=0;
  await assert.rejects(f.controller.replace(work,base),/quota/);assert.deepEqual(f.log,[]);
});
test('public sticker edits preserve source and release both image sets',async()=>{
  const f=fixture();assert.equal(await f.controller.editWork(work),true);
  const saved=f.log.find(row=>row[0]==='putStickerEdit')[1];
  assert.equal(saved.stickerSource,'public');assert.equal(saved.authorityThumbnailPath,'authority.webp');
  assert.equal(f.log.filter(row=>row[0]==='release-base').length,1);
  assert.equal(f.log.filter(row=>row[0]==='release-assets').length,1);
  assert.deepEqual(f.log.at(-1),['changed','1',{closePreview:true}]);
});
test('empty public and private sticker edits restore the correct base',async()=>{
  for(const privateBase of [false,true]) {
    const f=fixture();
    f.environment.loadEditor=async()=>({open:async options=>({...options,document:{...options.document,layers:[]}})});
    if(privateBase) f.store.editableFor=async()=>({baseBlob:base.blob,metadata:{stickerDocument:{}},stickerDocument:{baseWidth:64,baseHeight:64,layers:[]}});
    await f.controller.editWork(work);
    assert.equal(f.log.find(row=>row[0]==='clearStickerEdit')[1].restorePublic,!privateBase);
  }
});
test('cancel during preparation cannot open a late editor; concurrent edits cannot release each other',async()=>{
  const f=fixture(),pending=defer();f.environment.decodeBlob=()=>pending.promise;
  f.environment.loadEditor=async()=>assert.fail('late editor opened');
  const task=f.controller.editCrop({...base,baseBlob:base.blob});
  await assert.rejects(f.controller.editCrop({...base,baseBlob:base.blob}),/正在使用/);
  f.controller.cancel();pending.resolve({image:{},release:()=>f.log.push(['released'])});
  assert.equal(await task,null);assert.deepEqual(f.log,[['cancel'],['released']]);
});
test('editor cancellation and asset failure do not save; decoded base is always released',async()=>{
  const f=fixture();f.environment.loadEditor=async()=>({open:async()=>null});
  assert.equal(await f.controller.editWork(work),false);
  assert.deepEqual(f.log.map(row=>row[0]),['release-base','release-assets']);
  f.log.length=0;f.environment.loadStickerImages=async()=>{throw Error('asset');};
  await assert.rejects(f.controller.editWork(work),/asset/);
  assert.deepEqual(f.log,[['release-base']]);
  await assert.rejects(fixture({store:null}).controller.createCustom(base),/存储不可用/);
});
test('browser media adapter revokes failed decodes and partially loaded texture assets',async()=>{
  const revoked=[],requested=[];let id=0,decodes=0;
  const windowRef={URL:{createObjectURL:()=>`blob:${++id}`,revokeObjectURL:url=>revoked.push(url)},File,
    Image:class{naturalWidth=64;naturalHeight=64;async decode(){if(++decodes===2)throw Error('decode');}},
    fetch:async url=>{requested.push(url);return {ok:true,blob:async()=>new Blob(['image'],{type:'image/webp'})};}};
  const env=createMediaEditEnvironment({windowRef,documentRef:{},announce:assert.fail});
  await assert.rejects(env.loadStickerImages(),/decode/);
  assert.deepEqual(revoked,['blob:2','blob:1']);
  assert.ok(requested.every(url=>url.includes('/assets/stickers/')&&!url.includes('/views/assets/')));
});

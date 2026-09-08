import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionSharingController } from './selection-sharing-controller.js';
import { createBrowserClipboard } from './browser-clipboard.js';
import { parseSelectionShare, decodeSelectionShare } from './share-selection.js';

test('link generation retains version and IDs and is independent from clipboard capability',async()=>{
  const calls=[],api=createSelectionSharingController({locationRef:{href:'https://example.test/#works'},datasetVersion:'v1',
    nativeShare:async data=>calls.push(['share',data]),copy:async text=>(calls.push(['copy',text]),true),announce:(...args)=>calls.push(['announce',...args]),logError:()=>assert.fail('unexpected error')});
  assert.equal(await api.share(['1','2']),true);
  assert.deepEqual(decodeSelectionShare(parseSelectionShare(new URL(calls[1][1]))).workIds,['1','2']);
  assert.equal(calls[0][1].url,calls[1][1]);assert.equal(calls.at(-1)[2],'success');
});
test('native share cancellation still follows the established copy path; other errors are reported',async()=>{
  for(const name of ['AbortError','NotAllowedError']){
    const calls=[],api=createSelectionSharingController({locationRef:{href:'https://example.test'},datasetVersion:'v1',nativeShare:async()=>{throw Object.assign(Error('denied'),{name});},
      copy:async()=>false,announce:(...args)=>calls.push(['announce',...args]),logError:()=>calls.push(['error'])});
    assert.equal(await api.share(['1']),false);assert.equal(calls.some(c=>c[0]==='error'),name!=='AbortError');assert.equal(calls.at(-1)[2],'warning');
  }
});
test('empty selections do not invoke browser APIs or announce success',async()=>{
  const fail=()=>assert.fail('unexpected effect'),api=createSelectionSharingController({locationRef:{href:'https://example.test'},datasetVersion:'v1',nativeShare:fail,copy:fail,announce:fail,logError:fail});
  assert.equal(await api.share([]),false);assert.equal(await api.share(null),false);
});
function clipboardFixture({native,exec=true,selectThrows=false}={}){
  const calls=[],textarea={style:{},setAttribute:(...v)=>calls.push(['attribute',...v]),select:()=>{calls.push(['select']);if(selectThrows)throw Error('select failed');},remove:()=>calls.push(['remove'])};
  const api=createBrowserClipboard({navigatorRef:native?{clipboard:{writeText:native}}:{},documentRef:{
    createElement:tag=>(calls.push(['create',tag]),textarea),body:{append:n=>calls.push(['append',n])},execCommand:kind=>{calls.push(['exec',kind]);if(exec==='throw')throw Error('copy denied');return exec;}
  }});return {api,calls,textarea};
}
test('native clipboard success does not create a hidden textarea',async()=>{
  let copied;const f=clipboardFixture({native:async text=>{copied=text;}});assert.equal(await f.api.copy('url'),true);assert.equal(copied,'url');assert.deepEqual(f.calls,[]);
});
test('clipboard permission denial falls back and always removes temporary selection',async()=>{
  const f=clipboardFixture({native:async()=>{throw Error('denied');}});assert.equal(await f.api.copy('url'),true);assert.equal(f.textarea.value,'url');assert.deepEqual(f.calls.at(-1),['remove']);
});
test('legacy clipboard false/throw/select failure returns false and leaves no temporary element',async()=>{
  for(const options of [{exec:false},{exec:'throw'},{selectThrows:true}]){
    const f=clipboardFixture(options);assert.equal(await f.api.copy('url'),false);assert.deepEqual(f.calls.at(-1),['remove']);
  }
});

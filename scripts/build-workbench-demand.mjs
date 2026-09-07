import {readFile,writeFile,mkdir,realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {WORKBENCH_SCHEMA,WORKBENCH_COLUMNS,serializeWorkbench,reviveWorkbench,workbenchSourcePins} from '../lib/workbench-demand-data.js';
import {DATA_REVISION} from '../lib/runtime-config.js';
import {encodeWorkbenchTable} from '../lib/workbench-table.js';
import {createQueryIndex,createSearchTextCarrier} from '../lib/query-index.js';
// Reuse the actual validated runtime preparation, not a second copy of its source-merge rules.
// Browser tooling is supplied by the local verification environment, not a production dependency.
const {chromium}=await import(process.env.GALPEDIA_PLAYWRIGHT_URL??'file:///C:/Users/linru/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root=resolve(fileURLToPath(new URL('..',import.meta.url))),out=resolve(root,'runtime-data/workbench-demand');
// The preview data/ path may be a junction into an immutable release.
// Generated payloads must remain in a separate, physical source directory.
for(const path of [resolve(root,'runtime-data'),out]) {
 const stat=await lstat(path).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
 if(stat?.isSymbolicLink())throw new Error('Refusing generated output through a junction: '+path);
}
await mkdir(out,{recursive:true});
if((await realpath(out)).toLowerCase()!==out.toLowerCase())throw new Error('Generated output resolves outside the candidate directory');
const base=process.env.GALPEDIA_PREVIEW_ORIGIN??'http://127.0.0.1:4178';
const browser=await chromium.launch({headless:true,executablePath:process.env.GALPEDIA_CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
let prepared,firstIds;
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/main.js*',async route=>{
   const res=await route.fetch();let text=await res.text();const marker='  // Workbench export boundary: all legacy inputs have passed their original validators.';
   if(!text.includes(marker))throw new Error('Workbench export boundary missing');
   text=text.replace(marker,`  globalThis.__capturedWorkbench = JSON.stringify(preparedWorkbench, (_key,value) => value instanceof Map || (value && typeof value.get === 'function' && typeof value.entries === 'function') ? {__map:[...value.entries()]} : value);\n${marker}`);
   await route.fulfill({response:res,body:text});
 });
 await page.goto(base+'/?legacyWorkbench=1#works');await page.locator('.selection-card').first().waitFor({timeout:60000});
 if(errors.length)throw new Error(errors.join('\n'));
 prepared=JSON.parse(await page.evaluate(()=>globalThis.__capturedWorkbench),reviveWorkbench);
 firstIds=await page.locator('.selection-card').evaluateAll(cards=>cards.map(card=>card.dataset.workId));
}finally{await browser.close();}
const {ratedDisplayWorks:works,sample,catalogSource,sampleSource,...context}=prepared;
if(works.length!==context.populationContract.runtime.workIds.length||firstIds.some(id=>!works.some(w=>w.workId===id)))throw new Error('Export identity mismatch');
delete context.workData;
// Drop duplicate lookup projections; consumers need the already-validated binding rows only.
if(context.bangumiPublicBindings)context.bangumiPublicBindings={bindings:context.bangumiPublicBindings.bindings};
delete context.confirmedBangumiImportBindings;
context.enrichment=context.enrichment?{companyAliasesById:context.enrichment.companyAliasesById,companyPinyinById:context.enrichment.companyPinyinById}:null;
context.catalogSource={sha256:catalogSource.sha256,value:{snapshot:catalogSource.value.snapshot}};
context.sampleSource={schemaVersion:sampleSource.schemaVersion,snapshot:sampleSource.snapshot};
const {works:ignored,backendIndexes,...sampleHeader}=sample;
delete sampleHeader.brands;
await mkdir(out,{recursive:true});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function emit(name,value){const bytes=Buffer.from(JSON.stringify(value,serializeWorkbench));const sha256=hash(bytes),path=name+'.'+sha256.slice(0,16)+'.json';await writeFile(resolve(out,path),bytes);return {path,sha256,bytes:bytes.length};}
const fallbackMedia=Object.fromEntries(works.filter(w=>!w.projectedThumbnailPath).map(w=>[w.workId,{coverPath:w.coverPath,thumbnailPath:w.thumbnailPath,previewPath:w.previewPath,coverFallback:w.coverFallback}]));
const searchText=createSearchTextCarrier(createQueryIndex({works,knownFilterIds:sample.filters.map(f=>f.filterId),brands:context.brands,workAliasesById:context.workAliasesById,workPinyinById:context.workPinyinById,companyAliasesById:context.enrichment?.companyAliasesById,companyPinyinById:context.enrichment?.companyPinyinById}));
const searchTextFile=await emit('search-text',searchText);
const bootstrap=await emit('bootstrap',{schema:WORKBENCH_SCHEMA,columns:WORKBENCH_COLUMNS,table:encodeWorkbenchTable(works,WORKBENCH_COLUMNS),fallbackMedia,sample:sampleHeader,context});
const blockSize=16,shards=[];
for(let i=0;i<works.length;i+=blockSize)shards.push(await emit('cards-'+i/blockSize,works.slice(i,i+blockSize)));
const byId=new Map(works.map(w=>[w.workId,w]));
const firstPage={...await emit('first-page',firstIds.map(id=>byId.get(id))),ids:firstIds};
const sourceDigest=hash(Buffer.from(JSON.stringify({context,sample:sampleHeader,works},serializeWorkbench)));
const manifest={schema:WORKBENCH_SCHEMA,dataRevision:`wb-${sourceDigest}`,sourcePins:workbenchSourcePins(),sourceDigest,count:works.length,blockSize,bootstrap,searchText:searchTextFile,shards,firstPage};
const bytes=Buffer.from(JSON.stringify(manifest));await writeFile(resolve(out,'manifest.json'),bytes);
const config=`// Derived from validated public runtime inputs. Data revision is independent of UI commits.\nexport const WORKBENCH_DEMAND = Object.freeze(${JSON.stringify({enabled:true,manifestPath:'../runtime-data/workbench-demand/manifest.json',sha256:hash(bytes)})});\n`;
const current=await readFile(resolve(root,'lib/workbench-demand-config.js'),'utf8');
await writeFile(resolve(out,'config.patch'),'*** Begin Patch\n*** Update File: '+resolve(root,'lib/workbench-demand-config.js').replaceAll('\\','/')+'\n@@\n'+current.trimEnd().split('\n').map(l=>'-'+l).join('\n')+'\n'+config.trimEnd().split('\n').map(l=>'+'+l).join('\n')+'\n*** End Patch');
await writeFile(resolve(out,'build-proof.json'),JSON.stringify({dataRevision:DATA_REVISION,sourceDigest,catalogSha256:catalogSource.sha256,count:works.length,bootstrapBytes:bootstrap.bytes,shardBytes:shards.reduce((n,s)=>n+s.bytes,0),firstPageCount:firstIds.length,firstPageBytes:firstPage.bytes,note:'Real legacy runtime validators completed; header/family projection also completed before capture accepted. No source data or old release overwritten.'},null,2));
console.log(JSON.stringify({count:works.length,bootstrapBytes:bootstrap.bytes,firstPageCount:firstIds.length,firstPageBytes:firstPage.bytes,manifestSha256:hash(bytes)}));

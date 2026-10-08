import {createCoverSafetyIndex} from './work-cover-safety.js';
import {WORK_COVER_SAFETY} from './work-cover-safety-config.js';
// Version-bound public data. Static, revision-bound, publicly admitted fields only.
const root=new URL('../runtime-data/company-experience-v1/',import.meta.url);
const cache=new Map();let indexPromise;
const index=()=>indexPromise??=(fetch(new URL('manifest.json',root)).then(r=>{if(!r.ok)throw Error('资料索引不可用');return r.json();}).catch(e=>{indexPromise=null;throw e;}));
export const bucket=value=>{let h=2166136261;for(const c of new TextEncoder().encode(String(value)))h=Math.imul(h^c,16777619)>>>0;return(h%256).toString(16).padStart(2,'0');};
export async function loadPublicPart(name){
 if(cache.has(name))return cache.get(name);
 const promise=(async()=>{
  const manifest=await index(),file=manifest.files[name];if(!file)return {};
  const response=await fetch(new URL(name,root));if(!response.ok)throw Error('资料分片暂不可用');
  const bytes=await response.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(bytes.byteLength!==file.bytes||hash!==file.sha256)throw Error('资料版本不匹配');
  return JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text());
 })().catch(e=>{cache.delete(name);throw e;});cache.set(name,promise);if(cache.size>32)cache.delete(cache.keys().next().value);return promise;
}
const covers=createCoverSafetyIndex({config:WORK_COVER_SAFETY,sourceManifest:index});
export async function resolvePublicImageSafety(url){
 const parsed=new URL(url,document.baseURI);let path=parsed.pathname;
 if(parsed.origin==='https://raw.githubusercontent.com'&&path.startsWith('/Shinki0325/bishoujo-game-cover-assets/main/'))path=path.slice('/Shinki0325/bishoujo-game-cover-assets/main'.length);
 else if(!['https://assets.bishojo.date','https://wiki-assets.bishojo.date'].includes(parsed.origin))return {status:'unknown',family:url,url};
 const row=await covers.lookup(path)??(await loadPublicPart('safety/'+bucket(path)+'.json.gz'))[path];
 return row?{status:row[0],family:row[1],asset:row[2],url}:{status:'unknown',family:url,url};
}

import {resolveCompanyWorkIds} from './full-wiki-company-relations.js';
import {WORKBENCH_DEMAND} from './workbench-demand-config.js';
import {readWorkbenchFile,validateWorkbenchManifest,decodeWorkbenchPayload} from './workbench-demand-data.js';
import {createFullWikiDirectories} from './full-wiki-directories.js';

let pending;
export function loadFullWikiCompanyWorkspace() {
  pending ??= (async()=>{
    const url=new URL(WORKBENCH_DEMAND.manifestPath,import.meta.url);
    const manifest=validateWorkbenchManifest(await readWorkbenchFile(url,WORKBENCH_DEMAND.sha256));
    const body=await readWorkbenchFile(new URL(manifest.bootstrap.path,url),manifest.bootstrap.sha256);
    const data=decodeWorkbenchPayload(body,manifest,{includePersonCatalog:false});
    if(!data.fullWiki)throw new TypeError('Full company directory binding missing');
    const directoryUrl=new URL('../data/terminal-wiki-directory-v1/directory-manifest.json',import.meta.url);
    const directory=await readWorkbenchFile(directoryUrl,data.fullWiki.directoryManifest.sha256);
    if(directory.sourceManifestSha256!==data.fullWiki.sourceManifestSha256)throw new TypeError('Company/work authority mismatch');
    const relations=directory.files.find(d=>d.path==='relations/companies.json');
    if(!relations)throw new TypeError('Company work relations missing');
    const index=await readWorkbenchFile(new URL(relations.path,directoryUrl),relations.sha256);
    const directories=createFullWikiDirectories({manifestUrl:directoryUrl,manifestSha256:data.fullWiki.directoryManifest.sha256});
    const model=await directories.loadCompanies();
    const ids=new Set(data.ratedDisplayWorks.map(w=>w.workId));
    const defaults=new Map();
    for(const w of data.ratedDisplayWorks)if(!defaults.has(w.workGroupId))defaults.set(w.workGroupId,w.workId);
    for(const f of data.presentationFamiliesSource.value.families)defaults.set(f.presentationWorkId,f.defaultWorkId);
    const workIdsByCompany=new Map();
    for(const c of model.companies){
      const related=resolveCompanyWorkIds(index,c.canonicalEntityId,defaults);
      if(related.some(id=>!ids.has(id)))throw new TypeError('Unknown company work reference');
      workIdsByCompany.set(c.companyId,new Set(related));
    }
    return {...model,works:data.ratedDisplayWorks,workIdsByCompany};
  })().catch(error=>{pending=null;throw error;});
  return pending;
}

import {createWorkDetailView as createDetail} from '../views/work-detail-view.js';
import {createWorkVersionView as createVersions} from '../views/work-version-view.js';
import {createWorkDetailCreditsView as createCredits} from '../views/work-detail-credits-view.js';
let detail,versions,credits,detailOptions,versionOptions,earlyCleanup;
export function setEarlyWorkCleanup(fn){earlyCleanup=fn;}
export function takeoverWorkDetail(){earlyCleanup?.();earlyCleanup=null;}
export function createWorkDetailView(options){
 detailOptions=options;
 return detail??=createDetail({...options,partitionFilters:(...a)=>detailOptions.partitionFilters(...a)});
}
export function createWorkVersionView(options){
 versionOptions=options;
 return versions??=createVersions({...options,familyForWork:(...a)=>versionOptions.familyForWork(...a),onSelectWork:(...a)=>versionOptions.onSelectWork(...a)});
}
export function createWorkDetailCreditsView(options){return credits??=createCredits(options);}

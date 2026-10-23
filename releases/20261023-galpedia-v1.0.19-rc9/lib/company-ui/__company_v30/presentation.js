import {loadCompanyCredits} from '../../public-experience-client.js';
import {companyIdentity,loadCompanyDisplay} from '../../company-display-registry.js';
export {companyIdentity,companyName,companyRoleCounts} from '../../company-display-registry.js';
export async function projectDirectory(payload){const [{summaries}]=await Promise.all([import('../__company_v41/runtime-config.js'),loadCompanyDisplay()]);return {...payload,companies:payload.companies.map(c=>{c={...c,...(summaries[c.companyId]||{})};const n=companyIdentity(c.companyId);if(!n)return c;return {...c,brandName:n.originalName||c.brandName,originalBrandName:c.brandName,bangumiNameId:n.bangumiId,searchAliases:[...new Set([...(c.searchAliases||[]),c.brandName,n.name])],searchText:[c.searchText,c.brandName,n.name].join('\n').normalize('NFKC').toLocaleLowerCase('ja-JP')};})};}
import {companyRoleCounts} from '../../company-display-registry.js';
export function roleLabels(mask){const labels=[];if(mask&1)labels.push('制作');if(mask&2)labels.push('发行');return labels.length?labels:['参与记录'];}
export function companyRoleLabels(id){const c=companyRoleCounts(id);return roleLabels((c[1]?1:0)|(c[2]?2:0));}
const requests=new Map();
export function companyCredits(id){id=String(id);if(!requests.has(id)){const promise=loadCompanyCredits(id).then(rows=>new Map(rows.map(([workId,...values])=>[workId,values]))).catch(e=>{requests.delete(id);throw e;});requests.set(id,promise);}return requests.get(id);}

import {knownCompanyName} from './company-name-fallbacks.js';
const names=new Map(),counts=new Map();
let full;
export function registerCompanyDisplay(rows){for(const [id,n,c] of rows){names.set(String(id),n);counts.set(String(id),c);}}
export const companyIdentity=id=>names.get(String(id))??null;
export const companyName=(id,fallback)=>companyIdentity(id)?.originalName||knownCompanyName(id,fallback);
export const companyRoleCounts=id=>counts.get(String(id))??[0,0,0,0,0];
export function loadCompanyDisplay(){return full??=import('./company-ui/__company_v30/display-data.js').then(m=>{registerCompanyDisplay(Object.keys(m.roleCounts).map(id=>[id,m.names[m.nameAliases[id]||id]??null,m.roleCounts[id]]));for(const id of Object.keys(m.names))if(!names.has(id))names.set(id,m.names[id]);for(const [alias,id]of Object.entries(m.nameAliases))names.set(alias,m.names[id]??null);return m;}).catch(e=>{full=null;throw e;});}

let scopeReader;
export const registerCompanyScopeReader=reader=>{scopeReader=reader;};
export const precomputedCompanyScope=(id,role)=>scopeReader?.(id,role)??null;

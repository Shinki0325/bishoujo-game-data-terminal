import {names,nameAliases} from './display-data.js';
import {knownCompanyName} from '../../company-name-fallbacks.js';
export const companyIdentity=id=>names[nameAliases[String(id)]||String(id)]||null;
export const companyName=(id,fallback)=>companyIdentity(id)?.originalName||knownCompanyName(id,fallback);

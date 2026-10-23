import {COMPANY_NAME_FALLBACKS} from './company-name-fallbacks-config.js';

// Repair a missing display name only; never infer company identity from a name.
export function knownCompanyName(id, fallback) {
  id=String(id??'');
  if (fallback && fallback!=='未收录会社' && fallback!==`未收录会社 (${id})`) return fallback;
  return COMPANY_NAME_FALLBACKS[id] || fallback;
}
export function withKnownCompanyName(work) {
  if (!work) return work;
  const brandName=knownCompanyName(work.brandId,work.brandName);
  return brandName===work.brandName ? work : {...work,brandName};
}

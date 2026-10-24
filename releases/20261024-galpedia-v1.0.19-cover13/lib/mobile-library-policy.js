// Mobile browsing has its own route owner; unknown/shared/advanced states stay in the workbench.
export const mobileLibraryViewport=()=>globalThis.matchMedia?.('(max-width: 899px)').matches===true;
export function mobileLibraryRoute(hash=globalThis.location?.hash??''){
 if(!mobileLibraryViewport()||!/^#works(?:\?|$)/u.test(hash))return false;
 const p=new URLSearchParams(hash.split('?')[1]??'');
 return [...p.keys()].every(k=>['query','sort','page','filters'].includes(k))&&!globalThis.location?.search?.includes('legacyWorkbench');
}

export function mobileLibraryFilters(hash=globalThis.location?.hash??''){
 const raw=new URLSearchParams(hash.split('?')[1]??'').get('filters');
 if(!raw)return null;
 const value=JSON.parse(raw);
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('筛选条件格式不正确');
 return value;
}

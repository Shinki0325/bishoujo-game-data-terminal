// Identity projection is an optimization, never an independent identity source.
export function createCompanyIdentityLoader({descriptor,sourceDirectorySha256,read,fallback}) {
  let pending;
  return () => pending ??= Promise.resolve().then(async () => {
    if (descriptor?.sourceDirectorySha256 !== sourceDirectorySha256) return fallback();
    try {
      const value=await read(descriptor);
      if(value?.schema!=='galpedia-company-identities-v1'||value.sourceDirectorySha256!==sourceDirectorySha256
        ||!Array.isArray(value.companies)||value.companies.length!==descriptor.count)throw Error('会社身份索引版本无效');
      const ids=new Set(),owners=new Map();
      const companies=value.companies.map(row=>{
        if(typeof row?.companyId!=='string'||!row.companyId||ids.has(row.companyId)||!Array.isArray(row.companyIdAliases))throw Error('会社身份重复或缺失');
        ids.add(row.companyId);
        for(const alias of [row.companyId,...row.companyIdAliases]){
          if(typeof alias!=='string'||!alias||(owners.has(alias)&&owners.get(alias)!==row.companyId))throw Error('会社别名归属冲突');
          owners.set(alias,row.companyId);
        }
        return Object.freeze({companyId:row.companyId,companyIdAliases:Object.freeze([...row.companyIdAliases])});
      });
      return Object.freeze({companies:Object.freeze(companies)});
    } catch {
      // Missing, corrupt or unavailable derived data uses the authoritative
      // directory. If that also fails, propagate and permit a later retry.
      return fallback();
    }
  }).catch(error=>{pending=null;throw error;});
}

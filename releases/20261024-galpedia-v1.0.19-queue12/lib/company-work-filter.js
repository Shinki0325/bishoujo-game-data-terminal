// Sparse edition membership is shared by aliases; never allocate one full
// catalog-sized bitmap for every company in the directory.
export function compileCompanyWorkPositions(works, payload) {
  if(payload?.schema!=='galpedia-company-work-filter-v1'||!Array.isArray(payload.aliases)||!Array.isArray(payload.relations))throw new TypeError('invalid company work projection');
  const positions=new Map(works.map((w,i)=>[w.workId,i])),canonical=new Map(),aliases=new Map();
  if(positions.size!==works.length)throw new TypeError('duplicate work ID');
  for(const [id,ids]of payload.relations){
    if(typeof id!=='string'||canonical.has(id)||!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new TypeError('invalid company membership');
    canonical.set(id,Object.freeze(ids.map(workId=>{if(!positions.has(workId))throw new TypeError('unknown company work ID');return positions.get(workId);}))); 
  }
  for(const [alias,id]of payload.aliases){
    if(typeof alias!=='string'||aliases.has(alias)||!canonical.has(id))throw new TypeError('invalid company alias');
    aliases.set(alias,canonical.get(id));
  }
  for(const id of canonical.keys())if(!aliases.has(id))throw new TypeError('missing canonical alias');
  return aliases;
}

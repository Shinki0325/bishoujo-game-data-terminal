import { resolveAssetUrl, PRIMARY_COVER_ASSET_BASE } from './asset-url-core.js';

const SCORE_FIELDS = ['median', 'voteCount', 'egsScore', 'vndbScore', 'vndbVoteCount', 'bangumiScore', 'bangumiVoteCount', 'bangumiRating'];
const coverPath = work => {
  const path = work?.projectedThumbnailPath ?? work?.coverPath ?? null;
  return path && !path.includes('cover-unavailable') ? path : null;
};

// Static person details use the current edition-keyed card projection. Work-level
// credits remain work-level; a navigation target is not an edition credit.
export function projectPersonWorkMetadata(person, works, { coverUrlFor = path => resolveAssetUrl(path, PRIMARY_COVER_ASSET_BASE) } = {}) {
  const byId = new Map(works.map(work => [String(work.workId), work]));
  const project = (row, representative = false) => {
    if (!row.workId || (!representative && row.scope && row.scope.status !== 'confirmed')) return row;
    const work = byId.get(String(row.workId));
    if (!work) throw Error('人物关联作品资料缺失：' + row.workId);
    const path = coverPath(work), title = work.displayTitle || work.title || row.displayTitle || row.title;
    return { ...row, title: representative ? title : (work.title || row.title), displayTitle: title,
      brandId: work.brandId ?? null, brandName: work.brandName ?? null,
      ...Object.fromEntries(SCORE_FIELDS.map(key => [key, work[key] ?? null])),
      workThumbnailPath: path,
      ...(row.work ? { work: { ...row.work, ...work, ...Object.fromEntries(SCORE_FIELDS.map(key => [key, work[key] ?? null])) } } : {}),
      ...(representative ? { releaseDate: row.participationScope === 'work' ? '' : (work.releaseDate || row.releaseDate || '') } : {}),
      ...(representative ? { imageUrl: path ? coverUrlFor(path) : null } : {}) };
  };
  return { ...person, credits: (person.credits ?? []).map(row => project(row)),
    representativeWorks: (person.representativeWorks ?? []).map(row => project(row, true)) };
}

async function loadCurrentWorks(ids,{summaries=true,signal}={}) {
  const { splitWorkCards } = await import('./work-full-cards.js');
  const source = splitWorkCards();
  if (!source) throw Error('人物作品资料入口不可用');
  if(summaries){
    try{return await (await import('./person-work-metadata-small.js')).loadSmallPersonWorkMetadata(ids,source,{signal});}
    catch(error){if(signal?.aborted||error.name==='AbortError')throw error;}
  }
  return loadPersonWorkBatches(ids,source,{summaries:false,signal});
}

// Adjacent work IDs may be in unrelated shards. Group by the reader's verified
// SHA route so a long career does not repeatedly evict/reload the same buckets.
export async function loadPersonWorkBatches(ids,source,{cryptoRef=globalThis.crypto,summaries=false,signal}={}) {
  const checkCurrent=()=>{if(signal?.aborted)throw new DOMException('人物读取已取消','AbortError');};
  checkCurrent();
  const manifest=await source.manifest();
  const pinned=typeof manifest.sha256Routes==='string'
    &&manifest.sha256Routes.length===manifest.workIds.length*2
    &&/^[a-f0-9]+$/u.test(manifest.sha256Routes)
    ?new Map(manifest.workIds.map((id,i)=>[id,manifest.sha256Routes.slice(i*2,i*2+2)])):null;
  const keyed=await Promise.all(ids.map(async id=>({id,key:pinned?.get(id)
    ??new Uint8Array(await cryptoRef.subtle.digest('SHA-256',new TextEncoder().encode('egs:'+id)))[0].toString(16).padStart(2,'0')})));
  keyed.sort((a,b)=>a.key.localeCompare(b.key));
  const read=summaries&&source.getSummaries?ids=>source.getSummaries(ids):ids=>source.get(ids);
  const rows=new Map();
  for(let start=0;start<keyed.length;start+=48){
    checkCurrent();
    for(const row of await read(keyed.slice(start,start+48).map(item=>item.id)))rows.set(String(row.workId),row);
  }
  return ids.map(id=>{const row=rows.get(id);if(!row)throw Error('人物关联作品资料缺失：'+id);return row;});
}

export async function hydratePersonWorkMetadata(person, { loadWorks = null, coverUrlFor, signal } = {}) {
  const credits = (person.credits ?? []).filter(row => !row.scope || row.scope.status === 'confirmed');
  const ids = [...new Set([...credits, ...(person.representativeWorks ?? [])].map(row => String(row.workId ?? '')).filter(Boolean))];
  // Nested work models are a compatibility boundary: preserve every field
  // through the full-card reader if any caller carries a complete nested work.
  const nested=[...credits,...(person.representativeWorks??[])].some(row=>row.work);
  const read=loadWorks??(ids=>loadCurrentWorks(ids,{summaries:!nested,signal}));
  return projectPersonWorkMetadata(person, ids.length ? await read(ids) : [], { coverUrlFor });
}

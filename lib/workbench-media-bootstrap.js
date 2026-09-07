import {decodeWorkbenchTable,encodeWorkbenchTable} from './workbench-table.js';

// Build-time only: query/search columns remain exact. Cards own their images;
// keep only the highest-vote cover per company for its initial directory tile.
export function createMediaDeferredBootstrap(body) {
  if(body.mediaMode||!body.table)throw new TypeError('expected a complete column bootstrap');
  const works=decodeWorkbenchTable(body.table,body.columns,body.table.length);
  const best=new Map();
  for(const work of works){
    if(body.fallbackMedia?.[work.workId])Object.assign(work,body.fallbackMedia[work.workId]);
    const previous=best.get(work.brandId);
    if(!previous||(Number(work.voteCount)||0)>(Number(previous.voteCount)||0))best.set(work.brandId,work);
  }
  const mediaFields=['projectedThumbnailPath','coverPath','thumbnailPath'];
  const fallbackMedia=Object.fromEntries([...best.values()].map(work=>[work.workId,
    Object.fromEntries(mediaFields.filter(key=>work[key]!==undefined).map(key=>[key,work[key]]))]));
  const slim=works.map(work=>({...work,projectedThumbnailPath:null,projectedPreviewPath:null}));
  return {...body,mediaMode:'on-demand-v1',table:encodeWorkbenchTable(slim,body.columns),fallbackMedia};
}

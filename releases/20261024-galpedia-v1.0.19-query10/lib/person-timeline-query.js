import { releaseDateSortCompare } from './work-release-date.js';
const modes=['all','characters','songs','vocal','music','scenario','artwork'];
export const normalizePersonTimelineSearch=value=>String(value??'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu,' ').trim();
export function comparePersonTimeline(a,b,{key='releaseDate',direction='desc',scoped=false}={}){
  if(scoped&&Boolean(a.workId||a.nativeReleaseIdentity)!==Boolean(b.workId||b.nativeReleaseIdentity))return a.workId||a.nativeReleaseIdentity?-1:1;
  const aw=a.work??a,bw=b.work??b;
  const av=key==='releaseDate'?(a.releaseDate??aw.releaseDate??''):aw[key],bv=key==='releaseDate'?(b.releaseDate??bw.releaseDate??''):bw[key];
  if(key==='releaseDate')return releaseDateSortCompare(av,bv,{direction})||String(a.workId??'').localeCompare(String(b.workId??''),'en');
  const am=av===null||av===undefined||av==='',bm=bv===null||bv===undefined||bv==='';
  if(am!==bm)return am?1:-1;
  let result=typeof av==='number'&&typeof bv==='number'?bv-av:String(bv??'').localeCompare(String(av??''),'zh-Hans');
  if(direction==='asc')result*=-1;
  return result||String(a.workId??'').localeCompare(String(b.workId??''),'en')||String(a.displayTitle??a.title??'').localeCompare(String(b.displayTitle??b.title??''),'zh-Hans');
}
export function queryPersonTimeline(index,{mode='all',year='',search='',key='releaseDate',direction='desc'}={}){
  if(!modes.includes(mode)||!['releaseDate','median','voteCount','bangumiVoteCount','bangumiScore','title'].includes(key)
    ||!['asc','desc'].includes(direction))throw Error('人物年表查询无效');
  const terms=normalizePersonTimelineSearch(search).split(' ').filter(Boolean);
  const rows=index.rows[mode].filter(r=>(!year||String(r.year)===String(year))&&terms.every(term=>r.search.includes(term)))
    .sort((a,b)=>comparePersonTimeline(a,b,{key,direction,scoped:index.scoped}));
  const groups=[],byKey=new Map();
  for(const row of rows){
    let group=row.foldKey?byKey.get(row.foldKey):null;
    if(!group){group={ids:[]};groups.push(group);if(row.foldKey)byKey.set(row.foldKey,group);}
    group.ids.push(row.id);
  }
  return {totalRecords:rows.length,totalWorks:new Set(rows.map(r=>r.workIdentity||r.workId||r.id)).size,groups};
}

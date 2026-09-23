export const VOTE_SOURCES=Object.freeze([
  {key:'votes',score:'median',label:'EGS'},
  {key:'bangumiVotes',score:'bangumi',label:'Bangumi'},
  {key:'vndbVotes',score:'vndb',label:'VNDB'}
]);
export function ratingSources(state,fields=[]){
  if(state.voteSource&&state.voteSource!=='auto')return VOTE_SOURCES.filter(s=>s.key===state.voteSource);
  const scores=VOTE_SOURCES.filter(s=>fields.includes(s.score));
  return scores.length?scores:VOTE_SOURCES.filter(s=>fields.includes(s.key)).length?VOTE_SOURCES.filter(s=>fields.includes(s.key)):[VOTE_SOURCES[0]];
}
export const ratingActive=s=>s.voteFilterMode==='percentile'?s.voteTrimPercent>0:s.minVotes>0;
export function ratingLabel(s,fields=[]){
  if(!ratingActive(s))return '评分人数：不限';
  const source=ratingSources(s,fields).map(v=>v.label).join('、');
  return source+(s.voteFilterMode==='percentile'?' 人数低端 '+s.voteTrimPercent+'% 去尾':' ≥ '+s.minVotes+' 人');
}
const identity=row=>row.entityKind==='appearance'?row.workId:row.id;
const valid=n=>Number.isFinite(n)&&n>=0;
// Compute a common cutoff before grouping, once per work rather than per character.
// Equal vote counts stay together; the removed percentage may differ from the requested tail.
export function filterRatings(rows,state,fields=[]){
  const population=[...new Map(rows.map(r=>[identity(r),r])).values()],sources=ratingSources(state,fields);
  const active=ratingActive(state)&&!rows.some(r=>r.entityKind==='character');
  const thresholds=sources.map(source=>{
    const values=population.map(r=>r[source.key]).filter(valid).sort((a,b)=>a-b);
    const position=(values.length-1)*(state.voteTrimPercent??0)/100,lo=Math.max(0,Math.floor(position));
    const cutoff=state.voteFilterMode==='percentile'?(values.length?values[lo]+(values[Math.min(lo+1,values.length-1)]-values[lo])*(position-lo):null):state.minVotes;
    return {...source,cutoff,known:values.length,missing:population.length-values.length};
  });
  const passes=r=>thresholds.every(t=>t.cutoff!==null&&valid(r[t.key])&&r[t.key]>=t.cutoff);
  const kept=active?rows.filter(passes):rows,keptWorks=new Set(kept.map(identity));
  return {rows:kept,summary:{active,mode:state.voteFilterMode??'count',percent:state.voteTrimPercent??10,thresholds,before:rows.length,after:kept.length,excluded:rows.length-kept.length,worksBefore:population.length,worksAfter:keptWorks.size,worksExcluded:population.length-keptWorks.size,missing:active?population.filter(r=>sources.some(t=>!valid(r[t.key]))).length:0}};
}

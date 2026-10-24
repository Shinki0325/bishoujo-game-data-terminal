// Presentation ranking only. Never adds evidence or changes filter membership.
const common=new Set(['theme-romance','tone-comedy','tone-slice-of-life','tone-moving','tone-moe','setting-school','setting-modern-japan','season-four','structure-linear','structure-branching','structure-multiple-endings','structure-other-perspectives','relation-friendship']);
const defining=new Set(['tone-nakige','tone-utsuge','tone-healing','relation-family','audience-otome','relation-girls-love','relation-boys-love','structure-kinetic','structure-multiple-protagonists','theme-music','theme-sports','theme-detective','theme-survival','theme-mecha-combat','setting-post-apocalyptic']);
function score(tag){
 const id=tag.filterId;
 const meaning=id.startsWith('season-')?0.4:common.has(id)?0.6:id.startsWith('gameplay-')||id.startsWith('plot-')?4:defining.has(id)?3.6:2.7;
 // Rarity breaks ties within semantic bands; a rare incidental tag cannot win alone.
 const count=Number.isFinite(tag.displayWorkCount)?Math.max(100,tag.displayWorkCount):10000;
 return meaning+Math.max(0,Math.min(0.8,Math.log10(10000/count)*0.4));
}
export function representativeCardTags(tags,limit=4){
 const remaining=tags.filter(t=>t.filterEnabled!==false&&!['adult','character'].includes(t.detailGroupId));
 const selected=[],groups=new Map();
 while(remaining.length&&selected.length<limit){
  remaining.sort((a,b)=>(score(b)-(groups.get(b.groupId)??0)*0.8)-(score(a)-(groups.get(a.groupId)??0)*0.8)||(a.displayOrder??0)-(b.displayOrder??0));
  const tag=remaining.shift();
  selected.push(tag);groups.set(tag.groupId,(groups.get(tag.groupId)??0)+1);
 }
 return selected;
}

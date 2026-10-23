// Presentation groups are not canonical aliases. Source archives, measurements,
// credits and stage identities remain separate, even when one card is shown.
// Shirobana / Shiroka: VNDB c92094 / c102751; source names and story-stage
// evidence retained in reports/galpedia-representative-op-20261021.
const APPEARANCE_GROUPS = [
  {id:'hokenshitsu-shirobana',primary:'c92094',members:['c92094','c102751'],
    labels:{c102751:'白花（しろか）· 过去篇'},spoiler:true}
];
const native = row => row.sourceIds?.vndbCharacterId
  || String(row.characterId||row.identity||'').match(/(?:^|:)char_(?:vndb_)?(c\d+)$/u)?.[1];
export function groupCharacterAppearances(rows) {
  let output=[...rows];
  for(const rule of APPEARANCE_GROUPS){
    const members=output.filter(row=>rule.members.includes(native(row)));
    const main=members.find(row=>native(row)===rule.primary);
    if(!main||members.length<2)continue;
    const stages=members.filter(row=>row!==main);
    const grouped={...main,displayAppearanceGroup:rule.id,
      displayAppearanceMembers:members,
      appearanceStages:[...(main.appearanceStages??[]),...stages.map(row=>({...row,
        label:rule.labels[native(row)]||row.characterName||row.name,spoiler:rule.spoiler}))]};
    output=output.flatMap(row=>row===main?[grouped]:stages.includes(row)?[]:[row]);
  }
  return output;
}
const roleRank = row => ['main','primary','メイン','主角'].includes(row.role)?0
  :['side','sub','サブ','配角'].includes(row.role)?1:2;
const visibleValue = raw => {
  const value=raw&&typeof raw==='object'?raw.value:raw;
  return value!==null&&value!==undefined&&String(value).trim()!==''
    && !/^(?:unknown|n\/a|不明|不詳|未公開|暂无|未公表)$/iu.test(String(value).trim());
};
const profileCount=row=>Object.entries(row.metadata??{})
  .filter(([key,value])=>key!=='sex'&&visibleValue(value)&&!value?.spoiler).length
  +(row.profileFacts??[]).filter(f=>!f.spoiler&&visibleValue(f.value)).length;
const image=row=>Boolean(row.image?.url||row.genericImage?.url||row.imageUrl);
export function orderCharacterCards(rows) {
  return rows.map((row,index)=>({row,index})).sort((a,b)=>roleRank(a.row)-roleRank(b.row)
    ||Number(image(b.row))-Number(image(a.row))
    ||profileCount(b.row)-profileCount(a.row)||a.index-b.index).map(x=>x.row);
}

import {analysisGrain,filterPopulation,plottedFields} from './model.mjs';

// IDs are source identities; a matching display name never merges characters.
export function characterRows(core,packs,s,manifest){
  const grain=analysisGrain(s),fields=manifest.fields.filter(f=>f.character),columns=manifest.characterColumns;
  const primary=core.filter(r=>r.primary).map(r=>({...r,...(packs.tags?.[r.id]?Object.fromEntries(['tags','genre','platform'].map((key,i)=>[key,packs.tags[r.id][i]])):{}),...(packs.people?.rows[r.id]??{})}));
  const population=filterPopulation(primary,{...s,search:'',recordFilter:null,...(grain==='appearance'?{minVotes:0,voteFilterMode:'count'}:{})});
  const works=new Map(population.rows.map(r=>[r.presentationId,r]));
  const entities=packs.characterEntities??{},relations=new Map();
  for(const edition of core){
    const work=works.get(edition.presentationId);if(!work)continue;
    for(const c of packs.characters?.[edition.id]??[]){
      const id=c[0],key=JSON.stringify([id,work.presentationId]);
      let rel=relations.get(key);if(!rel){rel={id,work,casts:[]};relations.set(key,rel);}rel.casts.push(c);
    }
  }
  const qualified=[...relations.values()].filter(r=>s.characterScope==='primary'?r.casts.some(c=>c[1]==='primary'):s.characterScope==='female'?entities[r.id]?.sex==='f':true);
  const make=(id,entity,kind)=>({id,title:entity.name??id,originalTitle:entity.originalName??entity.name??id,characterId:id,characterName:entity.name??id,entityKind:kind,characterCount:1,characterValid:{},characterExcluded:{},tags:[],genre:[],platform:null,year:null,median:null,votes:null});
  const rows=[];
  if(grain==='character'){
    const unique=new Map();
    for(const rel of qualified){let r=unique.get(rel.id);if(!r){const entity=entities[rel.id]??{};r=make(rel.id,entity,'character');r.workIds=[];r.presentationIds=[];r.workTitles=[];
      for(const f of fields){const value=entity[f.id]??null;r[f.id]=f.type==='category'?(value===null?[]:[f.id==='birthdayMonth'?value+'月':String(value)]):value;r.characterValid[f.id]=value===null?0:1;r.characterExcluded[f.id]=entity.invalid?.includes(f.id)?1:0;}
      unique.set(rel.id,r);}
      r.workIds.push(rel.work.id);r.presentationIds.push(rel.work.presentationId);r.workTitles.push(rel.work.title);
    }
    for(const row of unique.values())rows.push(row);
  }else{
    const invalidAt=columns.indexOf('invalid'),scopedAt=columns.indexOf('scoped');
    for(const rel of qualified){const entity=entities[rel.id]??{},r={...rel.work,...make(rel.id,entity,'appearance'),...Object.fromEntries(Object.entries(rel.work).filter(([k])=>!['id','title','originalTitle'].includes(k)))};
      r.id='appearance:'+JSON.stringify([rel.id,rel.work.presentationId]);r.workId=rel.work.id;r.workTitle=rel.work.title;r.workIds=[rel.work.id];r.presentationIds=[rel.work.presentationId];r.workTitles=[rel.work.title];
      for(const f of fields){const at=columns.indexOf(f.id),specific=rel.casts.filter(c=>c[scopedAt]?.includes(f.id)),source=specific.length?specific:rel.casts;
        const values=[...new Set(source.map(c=>c[at]).filter(v=>v!==null&&v!==undefined))];const invalid=values.length>1||source.some(c=>c[invalidAt]?.includes(f.id));
        const value=!invalid&&values.length===1?values[0]:null;r[f.id]=f.type==='category'?(value===null?[]:[f.id==='birthdayMonth'?value+'月':String(value)]):value;r.characterValid[f.id]=value===null?0:1;r.characterExcluded[f.id]=invalid?1:0;
      }
      rows.push(r);
    }
  }
  return {rows,summary:{grain,...(grain==='character'?{ratingFilter:{...population.summary,characterScope:true}}:{}),characterCount:new Set(rows.map(r=>r.characterId)).size,relationCount:qualified.length,workCount:works.size,charFields:fields.map(f=>f.id).filter(id=>plottedFields(s).includes(id))}};
}

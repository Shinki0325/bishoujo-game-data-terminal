import {preparePresentationFamiliesSidecar} from './presentation-families.js';
import {CREDIT_SCOPE} from './credit-scope-config.js';

// Keep complete connected version groups, including reviewed moves between
// families. Only materialize the groups actually requested by a person view.
export function createPersonFamilyLookup(value,options){
  const allowed=new Set(options.workIds),parent=new Map();
  const root=id=>{if(!parent.has(id))parent.set(id,id);let r=id;while(parent.get(r)!==r)r=parent.get(r);while(parent.get(id)!==id){const next=parent.get(id);parent.set(id,r);id=next;}return r;};
  const join=ids=>{ids=ids.filter(id=>allowed.has(id));if(!ids.length)return;const r=root(ids[0]);for(const id of ids)parent.set(root(id),r);};
  const byPresentation=new Map();
  for(const f of value.families){join(f.catalogMemberWorkIds);byPresentation.set(f.presentationWorkId,f.catalogMemberWorkIds);}
  for(const[id,o]of Object.entries({...CREDIT_SCOPE.editionOverrides,...CREDIT_SCOPE.familyCorrections})){
    if(!Object.hasOwn(value.workToPresentationWorkId,id))continue;
    join([id,...(o.relatedMembers??[]).map(m=>m.workId).filter(id=>Object.hasOwn(value.workToPresentationWorkId,id)),...(byPresentation.get(o.presentationWorkId)??[])]);
  }
  const groups=new Map();
  const group=id=>{const key=root(id);if(!groups.has(key))groups.set(key,{ids:[],mapping:{},families:[]});return groups.get(key);};
  for(const[id,target]of Object.entries(value.workToPresentationWorkId)){
    if(!allowed.has(id))throw Error('人物版本关系包含未知作品');
    const g=group(id);g.ids.push(id);g.mapping[id]=target;
  }
  for(const f of value.families){if(!f.catalogMemberWorkIds.length)throw Error('人物版本族没有成员');group(f.catalogMemberWorkIds[0]).families.push(f);}
  const prepared=new Map();
  return Object.freeze({
  projectVisibleWorks(works,projection){
    // Include each whole connected group, never only matching editions: review
    // moves and defaults must retain exactly the original folding semantics.
    const selected=new Map();
    for(const work of works)if(parent.has(String(work.workId))){const key=root(String(work.workId));if(groups.has(key))selected.set(key,groups.get(key));}
    const scope=[...selected.values()];
    const subset={...value,families:scope.flatMap(g=>g.families),workToPresentationWorkId:Object.assign({},...scope.map(g=>g.mapping))};
    return preparePresentationFamiliesSidecar(subset,{...options,workIds:scope.flatMap(g=>g.ids)}).projectVisibleWorks(works,projection);
  },familyForWork(id){
    id=String(id);if(!parent.has(id))return null;const key=root(id),g=groups.get(key);if(!g)return null;
    if(!prepared.has(key))prepared.set(key,preparePresentationFamiliesSidecar({...value,families:g.families,workToPresentationWorkId:g.mapping},{...options,workIds:g.ids}));
    return prepared.get(key).familyForWork(id);
  }});
}

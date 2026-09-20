import {restoreState} from './model.mjs';

export const DRAFT_KEY='galpedia-workbench-draft-v1';
const clone=value=>JSON.parse(JSON.stringify(value));
export class Timeline{
  past=[];future=[];
  record(snapshot){this.past.push(clone(snapshot));if(this.past.length>50)this.past.shift();this.future=[];}
  undo(current){if(!this.past.length)return null;this.future.push(clone(current));return this.past.pop();}
  redo(current){if(!this.future.length)return null;this.past.push(clone(current));return this.future.pop();}
}
export function readDraft(raw,data){
  try{
    const draft=JSON.parse(raw);
    if(draft?.schemaVersion!==DRAFT_KEY||draft.releaseId!==data.releaseId||draft.catalogSha256!==data.catalogSha256||!draft.state||typeof draft.state!=='object'||Array.isArray(draft.state))return null;
    const ids=new Set(data.rows.map(r=>r.id));
    return {...draft,state:restoreState(draft.state),name:typeof draft.name==='string'?draft.name.slice(0,80):'',
      selection:Array.isArray(draft.selection)?[...new Set(draft.selection.filter(id=>ids.has(id)))]:[],
      ui:draft.ui&&typeof draft.ui==='object'?draft.ui:{}};
  }catch{return null;}
}

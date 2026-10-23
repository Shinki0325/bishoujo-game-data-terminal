import {STORAGE_KEY, importState, exportState} from './state.js';

export function fullWikiStateStorage(storage,{sample,workIds,workGroupByEditionWorkId,localWorks=[]}) {
  const filters=[...sample.filters,...(sample.genreFilters??[]),...(sample.platformFilters??[])];
  const groups={...workGroupByEditionWorkId,...Object.fromEntries(localWorks.map(w=>[w.workId,w.workGroupId||w.workId]))};
  const authority={sampleId:sample.sampleId,workIds:[...workIds,...localWorks.map(w=>w.workId)],
    workGroupByEditionWorkId:groups,filterIds:[...new Set(filters.map(f=>f.filterId))],
    attributeGroupByFilterId:Object.fromEntries(filters.filter(f=>['game-type','platform','length'].includes(f.groupId)).map(f=>[f.filterId,f.groupId]))};
  return {
    getItem(key) {
      const raw=storage.getItem(key);if(key!==STORAGE_KEY||raw===null)return raw;
      try {
        const source=JSON.parse(raw);
        if(source.sampleId===sample.sampleId)return raw;
        const priorGroups={...groups};
        for(const ref of source.selectedWorkRefs??[])priorGroups[ref.editionWorkId]=ref.workGroupId;
        const previous=importState(raw,{...authority,sampleId:source.sampleId,workGroupByEditionWorkId:priorGroups});
        const migrated={...previous,sampleId:sample.sampleId,
          selectedWorkRefs:previous.selectedWorkIds.map(id=>({editionWorkId:id,workGroupId:groups[id]}))};
        const value=exportState(importState(JSON.stringify(migrated),authority));
        // Keep the previous valid record until the user changes the board.
        try {if(storage.getItem(STORAGE_KEY+':before-full-wiki-v7')===null)storage.setItem(STORAGE_KEY+':before-full-wiki-v7',raw);} catch {}
        return value;
      } catch { return raw; }
    },
    setItem:(key,value)=>storage.setItem(key,value),
    removeItem:key=>storage.removeItem(key)
  };
}

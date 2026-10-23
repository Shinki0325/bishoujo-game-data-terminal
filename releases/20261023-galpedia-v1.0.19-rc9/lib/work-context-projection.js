// Work-scoped enrichment cannot add a performance or change an edition identity.
export function applyWorkContext(model, context) {
  if (!context || context.presentationWorkId !== model.presentationWorkId) return model;
  const cast = (model.cast ?? []).map(character => {
    const extra = context.characters?.[character.sourceIds?.vndbCharacterId];
    if (!extra) return character;
    const bindings = [...(character.sourceIds?.bangumi ?? [])];
    const binding = extra.sourceBinding;
    if (!bindings.some(x => x.characterId === binding.characterId && x.subjectId === binding.subjectId)) bindings.push(binding);
    const descriptions = [...(character.descriptions ?? [])];
    for (const entry of extra.descriptions ?? []) {
      if (!descriptions.some(x => x.source === entry.source && x.sourceCharacterId === entry.sourceCharacterId && x.sourceWorkId === entry.sourceWorkId)) descriptions.push(entry);
    }
    return {...character,characterName:extra.characterName,originalCharacterName:extra.originalCharacterName,
      characterNameSource:'bangumi',sourceIds:{...character.sourceIds,bangumi:bindings},descriptions,
      profileFacts:[...(character.profileFacts ?? []),...(extra.profileFacts ?? []).filter(x=>!(character.profileFacts ?? []).some(y=>JSON.stringify(x)===JSON.stringify(y)))]};
  });
  // Enrich only native anchors already present on this character. Ambiguous
  // same-subject identities remain untouched until their identity is reviewed.
  const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, '');
  const enriched = cast.map(character => {
    const anchors = character.sourceIds?.bangumi ?? [];
    // Sanitizing a description already identified by native ID does not
    // require resolving whether two source profiles describe the same person.
    const sanitized = (character.descriptions ?? []).map(d => {
      if (d.source !== 'bangumi') return d;
      for (const a of anchors) {
        if (String(a.characterId) !== String(d.sourceCharacterId)) continue;
        const fresh = context.sourceCharacters?.[a.subjectId]?.[a.characterId]?.descriptions
          ?.find(x => x.source === d.source && String(x.sourceCharacterId) === String(d.sourceCharacterId));
        if (fresh) return fresh;
      }
      return d;
    });
    if (sanitized.some((d,i)=>d !== character.descriptions[i])) character = {...character,descriptions:sanitized};
    const subjects = new Map();
    for (const a of anchors) {
      const ids = subjects.get(String(a.subjectId)) ?? new Set();
      ids.add(String(a.characterId)); subjects.set(String(a.subjectId), ids);
    }
    const entries = anchors.filter(a => subjects.get(String(a.subjectId)).size === 1)
      .map(a => ({anchor:a, data:context.sourceCharacters?.[a.subjectId]?.[a.characterId]})).filter(x=>x.data);
    if (!entries.length) return character;
    const names = [...new Set(entries.map(x=>x.data.nameCn).filter(Boolean))];
    const rename = names.length === 1 && entries.some(x=>norm(x.data.name) === norm(character.characterName));
    const descriptions = [...(character.descriptions ?? [])];
    const profileFacts = [...(character.profileFacts ?? [])];
    for (const {data} of entries) {
      for (const d of data.descriptions ?? []) {
        // Refresh this exact native profile so corrected spoiler segmentation
        // also repairs legacy descriptions. Other providers stay intact.
        const index = descriptions.findIndex(x=>x.source === d.source && String(x.sourceCharacterId) === String(d.sourceCharacterId));
        if (index < 0) descriptions.push(d);
        else descriptions[index] = d;
      }
      for (const fact of data.profileFacts ?? []) {
        if (!profileFacts.some(x=>x.source === fact.source && String(x.sourceCharacterId) === String(fact.sourceCharacterId) && x.label === fact.label && x.value === fact.value)) profileFacts.push(fact);
      }
    }
    const metadata = {...character.metadata};
    const fields = new Set(entries.flatMap(x=>Object.keys(x.data.metadata ?? {})));
    for (const field of fields) {
      if (metadata[field] !== undefined) continue;
      const values = entries.map(x=>x.data.metadata?.[field]).filter(Boolean);
      if (new Set(values.map(x=>JSON.stringify(x.value))).size === 1) metadata[field] = values[0];
    }
    return {...character, ...(Object.keys(metadata).length ? {metadata} : {}), ...(rename ? {characterName:names[0], originalCharacterName:character.originalCharacterName || character.characterName, characterNameSource:'bangumi'} : {}), descriptions, profileFacts};
  });
  const labels={age:'年龄',height:'身高',weight:'体重',bust:'胸围',waist:'腰围',hip:'臀围',cupSize:'罩杯'};
  const scoped = enriched.map(character => {
    const metadata={...character.metadata};let profileFacts=[...(character.profileFacts??[])];
    const attributes=[];const stageEntries=[];
    for(const cid of character.sourceIds?.egsCharacterIds??[]) {
      const phases=context.characterStages?.[cid];
      if(phases?.length)stageEntries.push(...phases.map(p=>({...p,sourceCharacterId:cid})));
      for(const [field,records] of Object.entries(context.egsAppearanceAttributes?.[cid]??{})) {
        attributes.push({source:'egs',sourceCharacterId:cid,sourceWorkId:context.editionId,field,records});
        const usable=records.filter(x=>!['unknown','held'].includes(x.valueKind));
        const values=new Set(usable.map(x=>x.normalizedValue??(['text','range'].includes(x.valueKind)?x.value:null)));
        // Unknown/suspect source scalars never become invented measurements.
        if(usable.length!==records.length) {
          profileFacts=profileFacts.filter(x=>!(x.source==='egs'&&String(x.sourceCharacterId)===String(cid)&&String(x.sourceWorkId)===String(context.editionId)&&x.label?.startsWith(labels[field])));
          if(metadata[field]?.source==='egs'&&records.some(x=>String(x.value)===String(metadata[field].value)))delete metadata[field];
        }
        const single=values.size===1 && !values.has(null) && !values.has(undefined) && usable.length===records.length && records.every(x=>!x.spoiler);
        // Old enrichment flattened multiple source stages into contradictory
        // "this edition" facts. Keep the scoped records without guessing stage names.
        if(!single) {
          const ambiguousStage=new Set(records.map(x=>x.stage)).size>1 && new Set(records.map(x=>x.value??x.normalizedValue)).size>1;
          if(ambiguousStage || records.some(x=>x.spoiler)) {
            profileFacts=profileFacts.filter(x=>!(x.source==='egs' && String(x.sourceCharacterId)===String(cid) && String(x.sourceWorkId)===String(context.editionId) && x.label?.startsWith(labels[field])));
            if(metadata[field]?.source==='egs')delete metadata[field];
          }
          continue;
        }
        const value=[...values][0];
        if(metadata[field]==null) metadata[field]={value,valueKind:usable[0].valueKind??'scalar',source:'egs',sourceWorkId:context.editionId,sourceCharacterId:cid};
      }
    }
    let descriptions=character.descriptions??[];
    if(stageEntries.length) {
      const ids=new Set(stageEntries.map(s=>String(s.sourceCharacterId)));
      const belongs=x=>x.source==='egs'&&ids.has(String(x.sourceCharacterId))&&String(x.sourceWorkId)===String(context.editionId);
      descriptions=descriptions.filter(x=>!belongs(x));
      profileFacts=profileFacts.filter(x=>!belongs(x));
      // Attributes differing by phase live with that phase, not in the main profile.
      for(const field of new Set(stageEntries.flatMap(p=>Object.keys(p.metadata??{})))) {
        const values=new Set(stageEntries.map(p=>JSON.stringify(p.metadata?.[field]?.value)));
        if((values.size>1||stageEntries.some(p=>p.spoiler))&&metadata[field]?.source==='egs')delete metadata[field];
      }
      if(stageEntries.length===1&&!stageEntries[0].spoiler)descriptions.push(...stageEntries[0].descriptions);
    }
    return {...character,metadata,profileFacts,descriptions,appearanceAttributes:attributes,appearanceStages:stageEntries.length>1||stageEntries.some(p=>p.spoiler)?stageEntries:[]};
  });
  const missingStates=(model.missingStates??[]).filter(x=>!(cast.length && x==='confirmed-character-relation-missing') && x!=='current-runtime-cover-unavailable');
  return {...model,cast:scoped,missingStates,relatedSongs:context.relatedSongs??[]};
}

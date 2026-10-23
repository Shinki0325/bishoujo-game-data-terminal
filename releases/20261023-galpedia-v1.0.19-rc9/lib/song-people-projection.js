// One entry per known identity within one song and one responsibility.
// Source records and credited aliases remain available; never merge by name.
export function groupSongPeople(entries) {
  const result=[], groups=new Map();
  for(const input of entries ?? []) {
    const person=input.sourcePersonId==='egs:creator:30988' ? {...input,name:'不详',creditedName:'不詳',personId:undefined,entityKind:'source-placeholder'} : input;
    const key=person.personId || person.sourcePersonId;
    if(!key){result.push({...person});continue;}
    let group=groups.get(key);
    if(!group){group={...person,creditedNames:[],sourceCredits:[]};groups.set(key,group);result.push(group);}
    const name=person.creditedName || person.name;
    if(name && !group.creditedNames.includes(name))group.creditedNames.push(name);
    group.sourceCredits.push(person);
  }
  return result;
}

// Group display cards, not source records or edition identities. Equal titles
// alone are never sufficient. Keep all original records for version links.
export function groupSongCards(songs = []) {
  const stable = value => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const groups = new Map(), result = [];
  for (const song of songs) {
    const {recordedEditionId, recordedEditionDate, sourceReferences, scope, ...identity} = song;
    const {editionIds, ...scopeMeaning} = scope ?? {};
    const anchored = typeof song.songId === 'string' && song.songId.trim()
      && (typeof song.source === 'string' && song.source.trim() || /^[a-z][a-z0-9-]*:song:\S+$/iu.test(song.songId));
    const displayIdentity=song.displayGroupId?{...identity,songId:song.displayGroupId,
      credits:Object.fromEntries(Object.entries(identity.credits||{}).map(([role,people])=>[role,people.map(({sourceReference,...person})=>person)]))}:identity;
    const key = anchored
      ? JSON.stringify(stable({...displayIdentity, scope: scopeMeaning})) : null;
    let card = key ? groups.get(key) : null;
    if (!card) {
      card = {song, records: []}; result.push(card);
      if (key) groups.set(key, card);
    }
    card.records.push(song);
  }
  return result;
}

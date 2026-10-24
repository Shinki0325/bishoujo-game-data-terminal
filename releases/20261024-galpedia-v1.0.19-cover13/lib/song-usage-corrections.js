import { SONG_USAGE_CORRECTIONS, SONG_DISPLAY_EQUIVALENCES } from './song-usage-corrections-config.js';

function displayEquivalence(song,workId){
  const rule=SONG_DISPLAY_EQUIVALENCES.find(r=>r.workId===String(workId)&&r.title===song.title&&r.songIds.includes(song.songId));
  if(!rule||JSON.stringify(song.categories)!==JSON.stringify(rule.categories))return song;
  if(song.creditSignature&&!rule.creditSignatures.includes(song.creditSignature))return song;
  const member=rule.members.find(m=>m.songId===song.songId);
  const refs=[...(song.sourceReferences||[]),...Object.values(song.credits||{}).flat().map(c=>c.sourceReference).filter(Boolean)];
  if(!member.references.every(wanted=>refs.some(r=>r.provider===wanted.provider&&r.recordId===wanted.recordId&&r.snapshotSha256===wanted.snapshotSha256)))return song;
  if(song.credits){
    const signatures=Object.entries(song.credits).flatMap(([role,people])=>people.map(p=>role+':'+p.sourcePersonId)).sort();
    if(JSON.stringify(signatures)!==JSON.stringify(rule.creditSignatures))return song;
  }
  if(song.displayGroupId===rule.id)return song;
  return {...song,displayGroupId:rule.id};
}

export function correctSongUsage(song, workId) {
  song=displayEquivalence(song,workId);
  const rule=SONG_USAGE_CORRECTIONS.find(r=>r.workId===String(workId)&&r.songId===song.songId&&r.title===song.title);
  if(!rule||JSON.stringify(song.categories)!==JSON.stringify(rule.expectedCategories))return song;
  return {...song,sourceCategories:[...song.categories],categories:[...rule.categories],usageResolution:rule.id};
}

export function correctSongCredit(credit) {
  if(credit.relationType!=='song-credited-person')return credit;
  const editionIds=credit.workId?[String(credit.workId)]:credit.scope?.status==='confirmed'?credit.scope.editionIds:[];
  if(editionIds?.length!==1)return credit;
  const song={songId:credit.songId,title:credit.songTitle,categories:credit.songCategories,sourceReferences:credit.sourceReferences,creditSignature:credit.roleCode+':'+credit.sourcePersonId};
  const corrected=correctSongUsage(song,editionIds[0]);
  return corrected===song?credit:{...credit,songCategories:corrected.categories,
    ...(corrected.usageResolution?{sourceSongCategories:corrected.sourceCategories,usageResolution:corrected.usageResolution}:{}),
    ...(corrected.displayGroupId?{displayGroupId:corrected.displayGroupId}:{})};
}

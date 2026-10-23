import { SONG_COLLABORATIONS } from './song-collaboration-config.js';
import { createResourceRequest } from './resource-request.js';

export function createSongCollaborationClient({config=SONG_COLLABORATIONS,fetchImpl=globalThis.fetch,cryptoRef=globalThis.crypto}={}) {
  const request=createResourceRequest({fetchImpl}), cache=new Map();
  const hash=async bytes=>Array.from(new Uint8Array(await cryptoRef.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  return async personId=>{
    if(config===SONG_COLLABORATIONS){try{return await (await import('./person-work-metadata-small.js')).loadSmallPersonPeers(personId,config.revision);}catch{/* Retain the full pinned relation source on an unavailable projection. */}}
    const bucket=String(parseInt((await hash(new TextEncoder().encode(personId)))[0],16)%4);
    if(!cache.has(bucket)) {
      const d=config.shards[bucket];
      if(!d||!/^peers-[0-3]\.json\.gz$/.test(d.path)||!Number.isSafeInteger(d.bytes)||d.bytes<1||d.bytes>4*1024*1024||!Number.isSafeInteger(d.rawBytes)||d.rawBytes<1||d.rawBytes>16*1024*1024||!/^[a-f0-9]{64}$/.test(d.sha256))throw Error('歌曲合作索引描述无效');
      const job=request(new URL(d.path,new URL(config.baseUrl,import.meta.url)),{label:'歌曲合作',validationKey:`${config.revision}:${d.sha256}`,validate:async bytes=>{
        if(bytes.byteLength!==d.bytes||await hash(bytes)!==d.sha256)throw Error('歌曲合作索引摘要不符');
        const reader=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();let size=0;const chunks=[];
        try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>d.rawBytes)throw Error('歌曲合作索引超出预算');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
        if(size!==d.rawBytes)throw Error('歌曲合作索引解压长度不符');
        const raw=new Uint8Array(size);let offset=0;for(const c of chunks){raw.set(c,offset);offset+=c.length;}
        const value=JSON.parse(new TextDecoder().decode(raw));
        if(value.schema!=='galpedia-song-collaborations-v1'||value.revision!==config.revision||!value.rows)throw Error('歌曲合作索引修订不符');
        return value.rows;
      }}).catch(error=>{cache.delete(bucket);throw error;});cache.set(bucket,job);
    }
    return (await cache.get(bucket))[personId]??{vocal:[],music:[]};
  };
}
export const loadSongCollaborations=createSongCollaborationClient();

export function songCollaborationMode(person, credits) {
  const primary=person.primaryRole;
  const songCredits=credits.filter(c=>c.relationType==='song-credited-person'&&['vocalist','lyrics','composition','arrangement'].includes(c.roleCode));
  if(person.directoryRole!=='music'&&primary==='voice-actor')return null;
  if(person.directoryRole!=='music'&&!songCredits.length)return null;
  if(primary==='vocalist')return 'vocal';
  if(!['lyrics','composition','arrangement'].includes(primary)){
    const vocals=new Set(),creators=new Set();
    songCredits.forEach((c,i)=>(c.roleCode==='vocalist'?vocals:creators).add(c.songId??c.creditId??i));
    if(vocals.size&&vocals.size>=creators.size)return 'vocal';
  }
  return 'music';
}

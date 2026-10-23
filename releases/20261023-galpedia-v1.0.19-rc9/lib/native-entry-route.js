export const nativeEntryHref=id=>'#entries/'+encodeURIComponent(id);
export function nativeEntryId(hash=globalThis.location?.hash??'') {
  if(!hash.startsWith('#entries/'))return null;
  try{const id=decodeURIComponent(hash.slice(9));return /^(?:bangumi:(?:subject|person):[0-9]+|vndb:release:r[1-9][0-9]*:v[1-9][0-9]*)$/.test(id)?id:null;}catch{return null;}
}
let current=null,serial=0,returnHash='#home',previousHash=globalThis.location?.hash??'#home';
export async function syncNativeEntryRoute() {
  const hash=location.hash,id=nativeEntryId(hash),token=++serial;
  if(id&&nativeEntryId(previousHash)===null)returnHash=previousHash||'#home';
  previousHash=hash;
  if(current){const old=current;current=null;old.close();}
  if(!id)return;
  const {openNativeEntry}=await import('../views/native-entry-view.js');
  if(token!==serial||location.hash!==hash)return;
  const dialog=await openNativeEntry(id,{stillCurrent:()=>token===serial&&location.hash===hash,onClose:()=>{if(token===serial&&location.hash===hash)location.hash=returnHash;}});
  if(token===serial&&dialog?.isConnected)current=dialog;
}

// 访客生日收藏按角色分别存储；不连接账户、不自动上传。
export const BIRTHDAY_FAVORITES_PREFIX='galpedia:birthday-favorites:v1:';
const validId=id=>typeof id==='string'&&/^char_[a-zA-Z0-9_-]{1,100}$/.test(id);
const aliases=c=>[...new Set([c.id,...(c.memberIds||[])])].filter(validId);
const newer=(a,b)=>!b||a.updatedAt>b.updatedAt||a.updatedAt===b.updatedAt&&a.id>b.id;
function validate(r){
  if(!r||r.schemaVersion!==1||r.kind!=='character-birthday'||!validId(r.id)||!Array.isArray(r.memberIds)||r.memberIds.length>1000||!r.memberIds.every(validId)||typeof r.name!=='string'||r.name.length>500||typeof r.birthday!=='string'||!/^\d{2}-\d{2}$/.test(r.birthday)||typeof r.deleted!=='boolean'||!Number.isSafeInteger(r.updatedAt)||r.updatedAt<0)throw Error('invalid birthday favorite');
  const [m,d]=r.birthday.split('-').map(Number),date=new Date(Date.UTC(2000,m-1,d));
  if(date.getUTCMonth()+1!==m||date.getUTCDate()!==d)throw Error('invalid birthday');
  return r;
}
export function createBirthdayFavorites(getStorage=()=>globalThis.localStorage,clock=()=>Date.now()){
  let records=[],byAlias=new Map();
  function load(){
    const storage=getStorage(),next=[],index=new Map();
    for(let i=0;i<storage.length;i++){
      const key=storage.key(i);if(!key?.startsWith(BIRTHDAY_FAVORITES_PREFIX))continue;
      const raw=storage.getItem(key);if(raw===null)continue;
      const r=validate(JSON.parse(raw));if(key!==BIRTHDAY_FAVORITES_PREFIX+r.id)throw Error('favorite identity mismatch');
      next.push(r);for(const id of aliases(r))if(newer(r,index.get(id)))index.set(id,r);
    }
    records=next;byAlias=index;
  }
  function latest(c){let found;for(const id of aliases(c)){const r=byAlias.get(id);if(r&&newer(r,found))found=r;}return found;}
  function has(c){return latest(c)?.deleted===false;}
  function set(c,saved){
    load();
    const r=validate({schemaVersion:1,kind:'character-birthday',id:c.id,memberIds:aliases(c),name:c.name,birthday:c.birthday,deleted:!saved,updatedAt:Math.max(clock(),(latest(c)?.updatedAt||0)+1)});
    // 先持久化，再变更内存与界面；失败时不伪装为已保存。
    getStorage().setItem(BIRTHDAY_FAVORITES_PREFIX+r.id,JSON.stringify(r));
    records=records.filter(old=>old.id!==r.id);records.push(r);
    for(const id of aliases(r))if(newer(r,byAlias.get(id)))byAlias.set(id,r);
    return r;
  }
  // 未来账户显式导入使用的访客快照，保留取消收藏的墓碑与原角色 ID。
  function snapshot(){return {schemaVersion:1,kind:'character-birthday',scope:'guest-local',records:records.map(r=>({...r,memberIds:[...r.memberIds]}))};}
  return {load,has,set,snapshot};
}

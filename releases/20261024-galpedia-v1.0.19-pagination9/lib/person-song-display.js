import { canonicalRole } from './credit-role-policy.js';
import { creditResponsibilityNotes } from './credit-responsibility.js';

const ROLES=['vocalist','lyrics','composition','arrangement','music','songs'];
const key=value=>String(value).normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase();
function category(prefix) {
  const value=prefix.normalize('NFKC').trim();
  const parts=value.split(/\s*(?:[、・&＆/]|\band\b)\s*/iu);
  if(parts.length>1){
    const labels=parts.map(category);
    if(labels.every(Boolean))return labels.join(' / ');
    if(labels.slice(0,-1).some(Boolean))return null;
  }
  const match=value.match(/^(?:(\d+(?:st|nd|rd|th))\s*)?(OP|ED)(?:曲|テーマ|s)?$/iu);
  if(match)return [match[2].toUpperCase(),match[1]?.match(/^\d+/u)?.[0]].filter(Boolean).join(' ');
  if(/^(?:INS|Insert songs?|挿入歌|插入歌)$/iu.test(value))return '插入歌';
  if(/^(?:主題歌|主题歌|テーマ(?:ソング|曲)?|Theme songs?)$/iu.test(value))return '主题歌';
  if(/^(?:イメージソング|image[\s-]*songs?|印象曲|IM)$/iu.test(value))return '印象曲';
  if(/^(?:Opening(?: theme| song)?|オープニング(?:テーマ|曲|主題歌)?)$/iu.test(value))return 'OP';
  if(/^(?:Ending(?: theme| song)?|エンディング(?:テーマ|曲|主題歌)?)$/iu.test(value))return 'ED';
  if(/^(?:Main theme|メインテーマ|主题曲)$/iu.test(value))return '主题曲';
  if(/^(?:Character songs?|キャラソン|角色歌)$/iu.test(value))return '角色歌';
  const numbered=value.match(/^(OP|ED)(?:曲)?\s*(\d+)$/iu);
  if(numbered)return numbered[1].toUpperCase()+' '+numbered[2];
  // Keep the complete route/platform/character qualifier visible. This is a
  // typography conversion, not evidence for binding a song to another edition.
  const qualified=value.match(/^(.+?)(OP|ED)(?:曲|テーマ)?$/iu)
    || value.match(/^(.+?)(イメージソング|image[\s-]*song|印象曲|挿入歌|插入歌|Insert song)$/iu);
  if(qualified){
    const qualifier=qualified[1].trim();
    if(/[a-z]$/iu.test(qualified[1])&&/^(op|ed)$/u.test(qualified[2]))return null;
    if(/[、,;；()（）/]/u.test(qualifier)||/\b(?:and|or|BGM|composition|arrangement|lyrics|for|not|except|unused)\b|作[詞词曲]|[編编]曲|歌唱|担当/iu.test(qualifier))return null;
    const kind=category(qualified[2]);
    return qualifier+(/[a-z0-9:：]$/iu.test(qualifier)?' ':'')+kind;
  }
  return null;
}

function usage(value){
  const label=category(value)||value;
  const match=label.match(/^(.*?)(OP|ED)(?: (\d+))?$/u);
  if(match)return {label,base:match[2],qualified:Boolean(match[1]||match[3])};
  for(const base of ['插入歌','印象曲','主题歌','角色歌','主题曲'])if(label.endsWith(base))return {label,base,qualified:label!==base};
  return {label,base:label,qualified:false};
}

function compatibleCategory(existing,incoming){
  const a=usage(existing),b=usage(incoming);
  return a.label===b.label || (a.base===b.base&&!(a.qualified&&b.qualified))
    || (['主题歌','主题曲'].includes(a.base)&&['主题歌','主题曲'].includes(b.base)&&!a.qualified&&!b.qualified)
    || (['主题歌','主题曲'].includes(b.base)&&!b.qualified&&['OP','ED'].includes(a.base))
    || (['主题歌','主题曲'].includes(a.base)&&!a.qualified&&['OP','ED'].includes(b.base));
}

// A usage and a recording description are separate dimensions. Only broad
// descriptions may be enriched; OP/ED and differing route qualifiers remain
// unresolved unless a reviewed source rule explicitly settles them.
export function reconcileSongCategories(existing,incoming){
  const split=values=>[...new Set(values.flatMap(v=>(category(v)||v).split(' / ')))];
  const a=split(existing),b=split(incoming);
  const broad=v=>['歌曲','ボーカルソング','収録曲'].includes(v);
  // An OP arrangement describes the source composition, not an opening scene.
  // Preserve that description when an explicit credit supplies its actual use.
  const recordingDescription=v=>['OPアレンジ','EDアレンジ','アレンジ','アレンジVer.'].includes(v);
  const character=v=>v==='角色歌';
  const known=v=>['OP','ED','插入歌','印象曲','主题歌'].includes(usage(v).base);
  const compatible=(x,y)=>compatibleCategory(x,y)||broad(x)||broad(y)||recordingDescription(x)||recordingDescription(y)
    ||(character(x)&&known(y))||(character(y)&&known(x));
  // Explicit compound assertions can add uses when they overlap a known use.
  // They cannot override an existing use with a disjoint claim.
  const firmA=a.filter(v=>!broad(v)&&!character(v)&&!recordingDescription(v)),firmB=b.filter(v=>!broad(v)&&!character(v)&&!recordingDescription(v));
  if(firmA.length&&firmB.length&&!firmA.some(x=>firmB.some(y=>compatible(x,y))))return null;
  let merged=[...a];
  for(const v of b){
    if(merged.some(x=>x===v))continue;
    const u=usage(v);
    const specific=merged.some(x=>compatibleCategory(x,v)&&usage(x).qualified&&!u.qualified);
    if(specific)continue;
    if(['主题歌','主题曲'].includes(u.base)&&merged.some(x=>['OP','ED'].includes(usage(x).base)))continue;
    merged=merged.filter(x=>!broad(x)&&!(compatibleCategory(x,v)&&!usage(x).qualified&&!character(x)));
    merged.push(v);
  }
  return merged;
}

// Complete, explicit statements only. Unparsed prose remains as notes; a
// display row never manufactures a song identity or a credit.
export function parseSongNote(note) {
  note=note.replace(/｢/gu,'「').replace(/｣/gu,'」');
  // One explicitly titled song may carry a trailing responsibility or credited
  // name. Preserve it visibly; never assign a trailing duty across several songs.
  let detail='';
  const quotes=[...note.matchAll(/「[^」]+」|『[^』]+』|"[^"\r\n]+"|“[^”]+”/gu)];
  if(quotes.length===1){
    const last=quotes[0],end=last.index+last[0].length,tail=note.slice(end).trim();
    const duties=tail.split(/\s*(?:&|,|and|・|、)\s*/iu);
    const labels={composition:'作曲',arrangement:'编曲',lyrics:'作词',chorus:'合声','作曲':'作曲','編曲':'编曲','作詞':'作词','コーラス':'合声'};
    const credited=tail.match(/^\((?:as|credited as|under (?:the )?name|credited under) ([^()]+)\)$/iu);
    if(tail&&duties.every(d=>Object.hasOwn(labels,d.toLowerCase())))detail=duties.map(d=>labels[d.toLowerCase()]).join(' / ');
    else if(credited)detail='署名：'+credited[1];
    if(detail)note=note.slice(0,end);
  }
  const pattern=/([^「『"“]*?)(?:「([^」]+)」|『([^』]+)』|"([^"\r\n]+)"|“([^”]+)”)/gu;
  const result=[];let end=0,match;
  while((match=pattern.exec(note))){
    if(match.index!==end)return null;
    const prefix=match[1].replace(/^[\s、,;；]+/u,'').replace(/^and\s+/iu,'').trim();
    const label=category(prefix)||(!prefix||/^(?:and|&)$/iu.test(prefix)?result.at(-1)?.category:null);
    if(!label)return null;
    result.push({title:match[2]||match[3]||match[4]||match[5],category:label,categories:label.split(' / '),...(detail?{detail}: {})});end=pattern.lastIndex;
  }
  // A qualifier may apply to all subsequent songs: preserve the compound prose
  // rather than silently make the following bare usage apply to every version.
  if(result.some((c,i)=>!c.categories.some(v=>usage(v).qualified)&&result.slice(0,i).some(previous=>previous.categories.some(v=>usage(v).qualified))))return null;
  return result.length&&!note.slice(end).trim()?result:null;
}

export function personSongDisplay(structuredSongs=[],credits=[]) {
  const songs=structuredSongs.map(song=>({...song,categories:[...song.categories],roleCodes:[...song.roleCodes],displayNotes:[],displayDetails:[]}));
  const byRole=new Map(),notes=[];
  for(const credit of credits){const role=canonicalRole(credit.roleCode);if(!byRole.has(role))byRole.set(role,[]);byRole.get(role).push(credit);}
  for(const [role,facts] of byRole)for(const note of creditResponsibilityNotes(facts)){
    const parsed=ROLES.includes(role)?parseSongNote(note):null;
    if(!parsed){notes.push({roleCode:role,text:note});continue;}
    const matches=parsed.map(clause=>songs.filter(s=>s.songId&&key(s.title)===key(clause.title)&&s.roleCodes.includes(role)));
    const reconciled=matches.map(candidates=>candidates.length===1?reconcileSongCategories(candidates[0].categories,
      parsed.filter((clause,i)=>matches[i].length===1&&matches[i][0]===candidates[0]).flatMap(clause=>clause.categories)):null);
    // Do not add a third display row to ambiguous same-name song IDs, or turn
    // conflicting source usages into an apparently independent extra song.
    if(matches.some((candidates,i)=>candidates.length>1 || (candidates.length===1&&reconciled[i]===null))){
      notes.push({roleCode:role,text:note});continue;
    }
    for(const [index,clause] of parsed.entries()){
      const candidates=matches[index];
      const only=candidates.length===1?candidates[0]:null;
      const compatible=only&&reconciled[index];
      if(compatible){
        only.categories=compatible;
        only.displayNotes.push(note);if(clause.detail&&!only.displayDetails.includes(clause.detail))only.displayDetails.push(clause.detail);continue;
      }
      const previous=songs.find(s=>!s.songId&&key(s.title)===key(clause.title)&&s.categories[0]===clause.category);
      if(previous){if(!previous.roleCodes.includes(role))previous.roleCodes.push(role);previous.displayNotes.push(note);if(clause.detail&&!previous.displayDetails.includes(clause.detail))previous.displayDetails.push(clause.detail);}
      else songs.push({title:clause.title,categories:[...clause.categories],roleCodes:[role],displayNotes:[note],displayDetails:clause.detail?[clause.detail]:[],displayOnly:true});
    }
  }
  return {songs,notes};
}

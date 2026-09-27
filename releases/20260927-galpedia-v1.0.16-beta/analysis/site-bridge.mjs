import {readContext,saveContext,releaseOf,selectedWorkIds,groupLabel} from './site-context.mjs';
export function incomingContext(){const token=new URL(location.href).searchParams.get('context');return token?{token,value:readContext(token,releaseOf(import.meta.url))}:null;}
export function contextState(c){const groups=c.groups,keys=groups.map(g=>groupLabel(g,groups));return {chart:groups.length?'line':'histogram',x:groups.length?'year':'median',y:'median',color:'none',grain:'work',minVotes:0,yearFrom:1900,yearTo:2100,binWidth:5,sourceContext:c,seriesField:groups.length?'contextGroup':'none',groupMode:groups.length?'manual':'auto',groupSelections:{contextGroup:keys},top:30};}
const button=(label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);return b;};
export function mountSiteBridge(api,ingress){
 const bar=document.createElement('div');bar.className='analysis-context-bar';bar.id='analysis-context';
 const label=document.createElement('span');const action=button('在作品库查看',()=>{try{const rows=api.rows(),ids=selectedWorkIds(rows);if(!ids.length)return api.toast('当前没有可查看的作品。');const token=saveContext({target:'works',release:releaseOf(import.meta.url),label:'工作台选中结果',workIds:ids,groups:[],analysisUrl:'/analysis/'+location.search});api.save();location.assign('/#works?analysis='+token);}catch(e){api.toast(e.message);}});action.id='analysis-open-works';bar.append(label,action);
 if(ingress?.value.back){const back=button('返回原列表',()=>{try{const c=ingress.value,token=saveContext({...c,target:'return'}),url=new URL(c.back.url,location.origin);url.hash+=(url.hash.includes('?')?'&':'?')+'analysisReturn='+token;api.save();location.assign(url.href);}catch(e){api.toast(e.message);}});back.id='analysis-return-source';bar.append(back);}
 document.querySelector('.comparison-heading').after(bar);
 const sync=()=>{const c=api.state().sourceContext;label.textContent=c?'来自：'+c.label+' · '+c.workIds.length.toLocaleString()+' 个来源版本':'与作品库联动';const ids=selectedWorkIds(api.rows());action.textContent='在作品库查看 '+ids.length.toLocaleString()+' 部作品';action.disabled=!ids.length;};sync();return {sync};
}

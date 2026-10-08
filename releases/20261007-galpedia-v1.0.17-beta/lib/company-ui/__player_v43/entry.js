import {initializeDirectoryHeaders} from '../__player_v51/directory-header.js';
initializeDirectoryHeaders();
// 原型入口优先展示高分代表作；每次路由只处理一次，不抢用户后续页签操作。
let route='';
function enter(){
 const current=location.hash;if(!current.startsWith('#companies/company/')||current===route)return;
 const id=decodeURIComponent(current.split('/').pop());
 if(!document.querySelector(`.company-card-v20[data-ready-company="${CSS.escape(id)}"]`))return;
 const other=document.querySelector('.company-card-v20')?.dataset.readyRole==='other';
 const button=document.getElementById(other?'cp-tab-works':'cp-tab-honors');if(!button)return;route=current;button.click();
}
const observer=new MutationObserver(enter);observer.observe(document.body,{childList:true,subtree:true});
addEventListener('hashchange',()=>{route='';enter();});enter();

import {companyRoleCounts} from '../__company_v30/presentation.js';
import {mountDirectoryHeader} from '../__player_v51/directory-header.js';

export function createDirectoryBrowse(root,{refresh}){
 const doc=root.ownerDocument,tools=root.querySelector('.company-directory-tools'),header=root.querySelector('.company-directory-header');
 const anchors=[],saved=[];
 const move=(node,parent)=>{if(!node)return;const anchor=doc.createComment('directory-home');node.before(anchor);anchors.push([node,anchor]);parent.append(node);};
 const row=doc.createElement('div');row.className='cd-browse-row';
 row.innerHTML='<div class="cd-role-tabs" role="group" aria-label="按会社职责浏览"><button type="button" data-ui="mode" data-directory-role="all" aria-pressed="true">全部</button><button type="button" data-ui="mode" data-directory-role="development" aria-pressed="false">制作</button><button type="button" data-ui="mode" data-directory-role="publishing" aria-pressed="false">发行</button><button type="button" data-ui="mode" data-directory-role="other" title="仅有其他关联、暂无制作或发行记录的会社" aria-pressed="false">其他关联</button></div><div class="cd-browse-controls"><details class="cd-filter"><summary>筛选</summary><div class="cd-filter-panel"><p>EGS 评分次数为收录版本在 EGS 的评分数累加，不含 Bangumi 或 VNDB；非去重玩家人数，不代表会社质量。数字沿用会社默认职责范围；职责按钮按会社参与记录筛选。</p></div></details></div>';
 const controls=row.querySelector('.cd-browse-controls'),panel=row.querySelector('.cd-filter-panel'),image=root.querySelector('#company-has-image'),sort=root.querySelector('#company-sort'),selection=root.querySelector('#company-selection-mode-toggle'),help=root.querySelector('#company-help-button');
 move(root.querySelector('.company-image-filter'),panel);move(root.querySelector('.company-sort-control'),controls);move(root.querySelector('.company-directory-action-controls'),controls);
 const status=doc.createElement('div');status.className='cd-result-row';status.innerHTML='<span class="cd-result-count" role="status"></span><button class="cd-image-chip" data-ui="utility" type="button" aria-label="移除仅有图片筛选">仅有图片 <span aria-hidden="true">×</span></button>';
 header.append(row,status);root.classList.add('cd-directory');
 const restoreHeader=mountDirectoryHeader(header,'company');
 if(help){saved.push([help,help.textContent]);help.textContent='说明';}
 for(const option of sort.options){saved.push([option,option.textContent]);option.textContent=({totalVoteCount:'EGS 评分次数',averageVoteCount:'EGS 版本平均次数',workCount:'收录作品数',releaseYearStart:'最早收录发售',brandName:'会社名称'})[option.value]||option.textContent;}
 let role='development';
 for(const button of row.querySelectorAll('[data-directory-role]'))button.setAttribute('aria-pressed',String(button.dataset.directoryRole===role));
 const filter=companies=>role==='all'?companies:companies.filter(c=>{const counts=companyRoleCounts(c.companyId);return role==='development'?counts[1]>0:role==='publishing'?counts[2]>0:!counts[1]&&!counts[2];});

 const onRole=e=>{const button=e.target.closest('[data-directory-role]');if(!button)return;role=button.dataset.directoryRole;for(const b of row.querySelectorAll('[data-directory-role]'))b.setAttribute('aria-pressed',String(b===button));refresh();};
 const removeImage=()=>{if(image?.checked)image.click();};
 row.addEventListener('click',onRole);status.querySelector('button').addEventListener('click',removeImage);
 const selectionLabel=()=>{if(!selection)return;const label=selection.getAttribute('aria-pressed')==='true'?'完成选择':'选择排榜';if(selection.textContent!==label)selection.textContent=label;};
 const observer=new MutationObserver(selectionLabel);if(selection)observer.observe(selection,{attributes:true,attributeFilter:['aria-pressed'],childList:true});selectionLabel();
 return {filter,get role(){return role;},sync(count){status.querySelector('.cd-result-count').textContent=`当前显示 ${count.toLocaleString('zh-CN')} 家`;status.querySelector('button').hidden=!image?.checked;selectionLabel();},dispose(){observer.disconnect();restoreHeader();row.removeEventListener('click',onRole);status.querySelector('button').removeEventListener('click',removeImage);for(const [node,anchor] of anchors){anchor.replaceWith(node);}for(const [node,label] of saved)node.textContent=label;row.remove();status.remove();root.classList.remove('cd-directory');}};
}

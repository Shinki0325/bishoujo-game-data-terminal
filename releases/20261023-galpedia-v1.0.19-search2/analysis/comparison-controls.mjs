import {field,groupField} from './model.mjs';
import {MAX_COMPARISON_GROUPS,comparisonKeys,parseComparisonList} from './comparison-selection.mjs';
const $=id=>document.getElementById(id);
const groupName=key=>({company:'会社',scenario:'剧本家'}[key]??field(key).short);
const make=(tag,text,id)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(id)e.id=id;return e;};
export class ComparisonControls {
  constructor(getResult,onChange){
    this.getResult=getResult;this.onChange=onChange;this.visible=40;
    $('group-search').addEventListener('input',()=>{this.visible=40;this.renderChoices();});
    $('clear-groups').addEventListener('click',()=>this.setKeys([]));
    const picker=$('comparison-picker');picker.querySelector('summary').firstChild.textContent='比较哪些组 ';
    picker.querySelector('p').textContent=`按所选顺序比较，最多 ${MAX_COMPARISON_GROUPS} 组；组间可有共同作品。`;
    picker.querySelector('summary').after($('group-mode-control'));
    const more=make('button','显示更多','more-groups');more.type='button';more.onclick=()=>{this.visible+=40;this.renderChoices();};$('group-choices').after(more);
    const status=make('p','','comparison-message');status.setAttribute('role','status');picker.append(status);
    const paste=make('button','批量粘贴名单','paste-groups');paste.type='button';paste.onclick=()=>this.openBatch();$('clear-groups').before(paste);
    const dialog=make('dialog',null,'comparison-batch');dialog.setAttribute('aria-labelledby','batch-title');
    dialog.innerHTML='<div class="dialog-top"><h2 id="batch-title">批量添加对照组</h2><button id="batch-close" type="button">关闭</button></div><p>每行一个完整名称，也支持制表符、分号分隔。先核对匹配结果，再加入已有名单。</p><textarea id="batch-names" aria-label="批量名单" rows="7"></textarea><div id="batch-summary" role="status"></div><ul id="batch-results"></ul><button id="batch-apply" type="button">加入已匹配项</button>';
    document.body.append(dialog);$('batch-close').onclick=()=>dialog.close();$('batch-names').oninput=()=>this.previewBatch();$('batch-apply').onclick=()=>{const parsed=this.previewBatch();if(parsed.added&&!parsed.overflow){this.setKeys(parsed.keys);dialog.close();}};
  }
  setKeys(keys){
    try{keys=comparisonKeys(keys);}catch(e){$('comparison-message').textContent=e.message;return;}
    $('comparison-message').textContent='';const {state:s}=this.getResult();return this.onChange({groupMode:'manual',groupSelections:{...s.groupSelections,[groupField(s)]:keys}});
  }
  async toggle(key){
    const keys=this.getResult().manualKeys;
    await this.setKeys(keys.includes(key)?keys.filter(k=>k!==key):[...keys,key]);
    [...$('group-choices').querySelectorAll('input')].find(el=>el.dataset.groupKey===key)?.focus({preventScroll:true});
  }
  openBatch(){this.batchField=groupField(this.getResult().state);$('batch-title').textContent='批量添加'+groupName(this.batchField);$('batch-names').value='';this.previewBatch();$('comparison-batch').showModal();$('batch-names').focus();}
  previewBatch(){
    const r=this.getResult(),parsed=parseComparisonList($('batch-names').value,r.availableGroups.map(g=>String(g.key)),r.manualKeys);
    const failed=parsed.rows.filter(v=>['missing','ambiguous'].includes(v.status)).length;
    $('batch-summary').textContent=`新增 ${parsed.added} 项 · 重复 ${parsed.rows.filter(v=>v.status==='duplicate').length} 项 · 未匹配或有歧义 ${failed} 项 · 合计 ${parsed.keys.length} / ${MAX_COMPARISON_GROUPS}`+(parsed.overflow?'。超过上限，请缩减名单后再添加；本次不会截取或部分添加。':failed?'。未匹配项不会加入，请核对下方结果。':'');
    $('batch-results').replaceChildren(...parsed.rows.map(v=>make('li',v.name+' — '+({add:'可添加',duplicate:'已选或重复，不重复添加',missing:'未找到完整名称',ambiguous:'同名有歧义，请使用列表中的准确名称'}[v.status]))));
    $('batch-apply').disabled=!parsed.added||parsed.overflow||this.batchField!==groupField(r.state);$('batch-apply').textContent=`加入 ${parsed.added} 个已匹配项`;return parsed;
  }
  render(){
    const r=this.getResult(),manual=r.groupOrder==='manual',key=groupField(r.state),available=Array.isArray(r.availableGroups)&&field(key)?.type==='category'&&key!=='birthdayMonth';$('comparison-picker').hidden=!available;
    if(!available)return;
    if(this.lastField!==key){$('group-search').value='';this.visible=40;this.lastField=key;$('comparison-message').textContent='';}
    $('comparison-picker').querySelector('summary').firstChild.textContent='比较哪些'+groupName(key)+' ';
    $('comparison-labels').textContent=manual?(r.manualKeys.length?r.manualKeys.slice(0,2).join('、')+(r.manualKeys.length>2?` 等 ${r.manualKeys.length} 组`:''):'尚未选择，点击添加'):'';$('comparison-count').textContent=manual?`已选 ${r.manualKeys.length} 组 · 编辑`:'自动选组 · 编辑';
    $('group-search').placeholder='搜索'+groupName(key);$('group-mode-control').firstChild.textContent='选择方式';
    $('group-mode').querySelector('[value=manual]').textContent='自己选择名单';
    for(const id of ['chosen-groups','group-choices','group-choices-note','more-groups'])$(id).hidden=!manual;
    $('group-search').closest('.comparison-toolbar').hidden=!manual;
    $('comparison-picker').querySelector('p').hidden=!manual;
    if(!manual)return;
    $('clear-groups').disabled=!r.manualKeys.length;
    $('chosen-groups').replaceChildren(...r.manualKeys.map((key,i)=>{
      const button=make('button',`${i+1}. ${key} ×`);button.type='button';button.setAttribute('aria-label','移除对照组 '+key);button.onclick=()=>this.toggle(key);return button;
    }));
    $('comparison-message').textContent=r.manualKeys.length>=MAX_COMPARISON_GROUPS?`已选满 ${MAX_COMPARISON_GROUPS} 组；请先移除再添加。`:'';
    this.renderChoices();
  }
  renderChoices(){
    const r=this.getResult();if(r.groupOrder!=='manual')return;
    const query=$('group-search').value.trim().toLocaleLowerCase(),choices=r.availableGroups.filter(g=>String(g.key).toLocaleLowerCase().includes(query));
    $('group-choices').replaceChildren(...choices.slice(0,this.visible).map(g=>{
      const label=make('label'),input=make('input'),name=make('span',g.key),count=make('small',g.count?g.count.toLocaleString()+' 条记录':'当前筛选无记录');
      label.className='group-choice';input.type='checkbox';input.dataset.groupKey=g.key;input.checked=r.manualKeys.includes(g.key);
      input.disabled=!input.checked&&r.manualKeys.length>=MAX_COMPARISON_GROUPS;input.setAttribute('aria-label','对照组 '+g.key);input.onchange=()=>this.toggle(g.key);label.append(input,name,count);return label;
    }));
    $('more-groups').hidden=choices.length<=this.visible;
    $('group-choices-note').textContent=!choices.length?'没有匹配的组名。':`匹配 ${choices.length} 组，显示 ${Math.min(this.visible,choices.length)} 组。无样本的所选组保留位置。`;
  }
}

import {field,groupField} from './model.mjs';
const $=id=>document.getElementById(id);

export class ComparisonControls {
  constructor(getResult,onChange){
    this.getResult=getResult;this.onChange=onChange;
    $('group-search').addEventListener('input',()=>this.renderChoices());
    $('clear-groups').addEventListener('click',()=>this.setKeys([]));
  }
  setKeys(keys){
    const {state:s}=this.getResult();this.onChange({groupSelections:{...s.groupSelections,[groupField(s)]:keys}});
  }
  toggle(key){
    const keys=this.getResult().manualKeys;
    this.setKeys(keys.includes(key)?keys.filter(k=>k!==key):[...keys,key].slice(0,12));
    [...$('group-choices').querySelectorAll('input')].find(el=>el.dataset.groupKey===key)?.focus({preventScroll:true});
  }
  render(){
    const r=this.getResult(),manual=r.groupOrder==='manual';$('comparison-picker').hidden=!manual;
    if(!manual)return;
    if(this.lastField!==groupField(r.state)){$('group-search').value='';this.lastField=groupField(r.state);}
    $('comparison-labels').textContent=' · '+r.manualKeys.join(' / ');
    $('comparison-count').textContent=`${r.manualKeys.length} / 12`;
    $('group-search').placeholder='搜索'+field(groupField(r.state)).short;
    $('clear-groups').disabled=!r.manualKeys.length;
    $('chosen-groups').replaceChildren(...r.manualKeys.map((key,i)=>{
      const button=document.createElement('button');button.textContent=`${i+1}. ${key} ×`;button.setAttribute('aria-label','移除对照组 '+key);
      button.addEventListener('click',()=>this.toggle(key));return button;
    }));
    this.renderChoices();
  }
  renderChoices(){
    const r=this.getResult();if(r.groupOrder!=='manual')return;
    const query=$('group-search').value.trim().toLocaleLowerCase();
    const choices=r.availableGroups.filter(g=>String(g.key).toLocaleLowerCase().includes(query));
    $('group-choices').replaceChildren(...choices.slice(0,40).map(g=>{
      const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span'),count=document.createElement('small');
      label.className='group-choice';input.type='checkbox';input.dataset.groupKey=g.key;input.checked=r.manualKeys.includes(g.key);
      input.disabled=!input.checked&&r.manualKeys.length>=12;input.setAttribute('aria-label','对照组 '+g.key);input.addEventListener('change',()=>this.toggle(g.key));
      name.textContent=g.key;count.textContent=g.count?g.count.toLocaleString()+' 个版本':'当前筛选无版本';label.append(input,name,count);return label;
    }));
    $('group-choices-note').textContent=!choices.length?'没有匹配的组名。':`匹配 ${choices.length} 组${choices.length>40?'，展示前 40 组，可继续输入缩小范围':''}。数量对应当前筛选；无样本的固定组保留位置。`;
  }
}

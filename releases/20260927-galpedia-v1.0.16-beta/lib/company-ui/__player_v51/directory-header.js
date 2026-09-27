// Shared header composition; preserve existing controls and their listeners.
export function mountDirectoryHeader(header,kind){
 if(!header||header.classList.contains('gh-header'))return ()=>{};
 const doc=header.ownerDocument,anchors=[],created=[];
 const move=(node,parent)=>{if(!node)return;const anchor=doc.createComment('header-home');node.before(anchor);anchors.push([node,anchor]);parent.append(node);};
 const make=(tag,cls)=>{const node=doc.createElement(tag);node.className=cls;created.push(node);return node;};
 const title=header.querySelector('.gp-page-heading');
 const search=header.querySelector('.search-field');
 const modes=header.querySelector(kind==='works'?'.catalog-primary-actions':kind==='company'?'.cd-role-tabs':'.person-directory-tabs');
 const status=kind==='works'?header.querySelector('.active-filter-state'):kind==='company'?header.querySelector('.cd-result-row'):make('div','gh-person-status');
 if(kind==='works')move(header.querySelector('.results-heading-count'),status);
 if(kind==='person'){
  const hint=make('span','gh-person-hint');hint.textContent='点击人物，查看角色与参与作品';status.append(hint);move(header.querySelector('#person-result-summary'),status);header.append(status);
 }
 const menu=kind==='person'?null:make('details','gh-tool-menu');
 const desktop=doc.defaultView.matchMedia('(min-width:900px)');
 const resize=()=>{if(menu)menu.open=desktop.matches;};
 if(menu){
  const summary=make('summary','gh-tool-trigger');summary.setAttribute('aria-label',kind==='works'?'作品筛选、排序与显示选项':'会社排序与筛选选项');summary.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7h16M4 17h16M9 4v6M15 14v6"/></svg><span>工具</span>';menu.append(summary);
  const actions=make('div','gh-actions');menu.append(actions);
  const source=header.querySelector(kind==='works'?'.catalog-controls':'.cd-browse-controls');
  for(const node of [...source.children])if(node!==search)move(node,actions);
  header.append(menu);
  resize();desktop.addEventListener('change',resize);
 }
 for(const [node,cls] of [[title,'gh-title'],[search,'gh-search'],[modes,'gh-modes'],[status,'gh-status']])node?.classList.add(cls);
 header.classList.add('gh-header');header.dataset.headerKind=kind;
 const onKey=e=>{if(e.key==='Escape'&&menu?.open&&!desktop.matches){e.stopPropagation();menu.open=false;menu.querySelector('summary').focus();}};
 const onOutside=e=>{if(menu?.open&&!desktop.matches&&!menu.contains(e.target))menu.open=false;};
 header.addEventListener('keydown',onKey);doc.addEventListener('pointerdown',onOutside);
 return ()=>{desktop.removeEventListener('change',resize);header.removeEventListener('keydown',onKey);doc.removeEventListener('pointerdown',onOutside);for(const [node,anchor] of anchors)anchor.replaceWith(node);for(const node of created)node.remove();for(const [node,cls] of [[title,'gh-title'],[search,'gh-search'],[modes,'gh-modes'],[status,'gh-status']])node?.classList.remove(cls);header.classList.remove('gh-header');delete header.dataset.headerKind;};
}

export function initializeDirectoryHeaders(){
 mountDirectoryHeader(document.querySelector('#catalog-results .results-toolbar'),'works');
 mountDirectoryHeader(document.querySelector('.person-directory-header'),'person');
}

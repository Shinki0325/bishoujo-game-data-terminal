// The drawer owns a draft and its previews, never the displayed result revision.
export function createFilterDraftSession({readApplied,render,preview,commit,delay=250}) {
  let open=false,draft=null,timer=null,revision=0,running=false,waiting=false,options={};
  const copy=value=>structuredClone(value);
  const invalidate=()=>{revision++;clearTimeout(timer);timer=null;waiting=false;};
  async function calculate(){
    timer=null;
    if(!open)return;
    if(running){waiting=true;return;}
    const ticket=revision,state=copy(draft),isCurrent=()=>open&&revision===ticket;
    running=true;
    try{const counts=await preview(state,options,isCurrent);if(isCurrent()&&counts?.status!=='stale')render(copy(draft),{status:'ready',...counts});}
    catch(error){if(isCurrent())render(copy(draft),{status:'error',error});}
    finally{running=false;if(waiting&&open){waiting=false;timer=setTimeout(calculate,0);}}
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(calculate,delay);}
  return Object.freeze({
    get isOpen(){return open;},
    state:()=>copy(draft),
    open(){invalidate();open=true;draft=copy(readApplied());render(copy(draft),{status:'loading'});schedule();},
    change(next){if(!open)return false;invalidate();draft=copy(next);render(copy(draft),{status:'loading'});schedule();return true;},
    requestCounts(nextOptions={}){if(!open)return;options=copy(nextOptions);invalidate();render(copy(draft),{status:'loading'});schedule();},
    apply(){if(!open)return false;const next=copy(draft);open=false;invalidate();commit(next);return true;},
    close(){open=false;invalidate();draft=null;},
    dispose(){open=false;invalidate();draft=null;}
  });
}

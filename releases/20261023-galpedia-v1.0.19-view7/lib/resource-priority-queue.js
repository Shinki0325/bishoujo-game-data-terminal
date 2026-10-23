// Preserve shared reads while letting current-page consumers overtake queued
// prefetch work. Running fetches stay bounded and are never duplicated.
export function createResourcePriorityQueue({concurrency=8,prefetchConcurrency=2}={}) {
  if(!Number.isSafeInteger(concurrency)||concurrency<1||!Number.isSafeInteger(prefetchConcurrency)||prefetchConcurrency<1||prefetchConcurrency>concurrency)throw Error('资源并发预算无效');
  const queue=[];let active=0,background=0,dropped=0;
  const current=job=>{job.consumers=job.consumers.filter(c=>c.isCurrent());return job.consumers.length>0;};
  const foreground=job=>job.consumers.some(c=>c.priority==='foreground');
  function pump(){
    for(let i=queue.length-1;i>=0;i--)if(!current(queue[i])){const [job]=queue.splice(i,1);job.dropped=true;dropped++;job.reject(new DOMException('资源请求已过期','AbortError'));}
    while(active<concurrency&&queue.length){
      let index=queue.findIndex(foreground);
      if(index<0){if(background>=prefetchConcurrency)break;index=0;}
      const [job]=queue.splice(index,1),isBackground=!foreground(job);job.started=true;active++;if(isBackground)background++;
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(()=>{active--;if(isBackground)background--;job.consumers=[];pump();});
    }
  }
  return Object.freeze({
    schedule(run,{priority='foreground',isCurrent=()=>true}={}){
      if(!['foreground','prefetch'].includes(priority)||typeof isCurrent!=='function')throw Error('资源优先级无效');
      const job={run,started:false,consumers:[{priority,isCurrent}]};job.promise=new Promise((resolve,reject)=>Object.assign(job,{resolve,reject}));
      queue.push(job);pump();
      return {promise:job.promise,join({priority='foreground',isCurrent=()=>true}={}){if(job.dropped)return false;if(!job.started){job.consumers.push({priority,isCurrent});pump();}return !job.dropped;}};
    },
    prune:pump,
    stats:()=>({active,background,queued:queue.length,dropped})
  });
}

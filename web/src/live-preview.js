// Keep only the newest edit while the preview worker is occupied. In particular,
// a slider drag must not enqueue dozens of obsolete geometry calculations.
export function createLivePreview({send,render,fail,pending,delay=40}){
 let latest=0,inFlight=null,next=null,timer=null;
 function pump(){if(inFlight||!next)return;const job=next;next=null;inFlight=job.id;send({type:'preview',...job});}
 return {
  schedule(design){const id=++latest;clearTimeout(timer);next=design?{id,design}:null;pending(!!design);if(design)timer=setTimeout(pump,delay);},
  receive(data){if(data.id!==inFlight)return;inFlight=null;if(data.id===latest){pending(false);if(data.type==='error')fail(data.message);else render(data.units);}clearTimeout(timer);pump();},
 };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {PROGRESS_KEY,loadProgress,saveProgress} from '../src/progress.js';
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};}
const entry={id:'one',quantity:2,design:{model:'sphere',name:'Koko',left:true,leftAdjust:{scale:125,x:4,y:2}}};
test('a new page session recovers the order and unfinished edit entirely from local storage',()=>{
 const local=storage(),draft={design:entry.design,quantity:'3',part:'leftAdjust',expanded:true,editingId:entry.id,editingSnapshot:structuredClone(entry),bulkNames:'Mía\nLupita'};
 assert.equal(saveProgress(local,[entry],draft),true);
 assert.deepEqual(loadProgress(local,storage()),{entries:[entry],draft});
});
test('all 100 individual designs survive reopening without the former 60-entry truncation',()=>{
 const local=storage(),entries=Array.from({length:100},(_,i)=>({...entry,id:String(i),quantity:1}));
 saveProgress(local,entries,null);assert.deepEqual(loadProgress(local).entries,entries);
});
test('existing orders and session-only drafts migrate without losing their settings',()=>{
 const local=storage(),session=storage(),draft={design:entry.design,quantity:'4',part:'leftAdjust'};
 local.setItem(PROGRESS_KEY,JSON.stringify({version:1,entries:[entry]}));session.setItem(PROGRESS_KEY+'-draft',JSON.stringify(draft));
 const recovered=loadProgress(local,session);assert.deepEqual(recovered.entries,[entry]);assert.deepEqual(recovered.draft.design,entry.design);
 saveProgress(local,recovered.entries,recovered.draft);assert.deepEqual(loadProgress(local,storage()),recovered);
});
test('persistent draft takes precedence over old session work and stale editing IDs recover as new drafts',()=>{
 const local=storage(),session=storage();
 session.setItem(PROGRESS_KEY+'-draft',JSON.stringify({design:{model:'name',name:'Old'}}));
 saveProgress(local,[],{design:entry.design,editingId:'deleted',editingSnapshot:entry});
 const {draft}=loadProgress(local,session);assert.deepEqual(draft.design,entry.design);assert.equal(draft.editingId,null);
});
test('malformed data and unavailable storage do not prevent the app from opening',()=>{
 const local=storage();local.setItem(PROGRESS_KEY,'{broken');assert.deepEqual(loadProgress(local),{entries:[],draft:null});
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('quota');}};
 assert.deepEqual(loadProgress(blocked),{entries:[],draft:null});assert.equal(saveProgress(blocked,[entry],null),false);
});
test('new ornament designs and their editable bow/name settings survive reopening',()=>{
 const local=storage();
 for(const model of ['paw','mouse']){
  const design={model,name:'Coco',nameAdjust:{scale:90,x:2,y:-1},bowAdjust:{scale:95,x:1,y:0},bow:false};
  saveProgress(local,[{id:model,quantity:2,design}],{design,part:'nameAdjust',quantity:'3'});
  const saved=loadProgress(local,storage());assert.equal(saved.entries[0].design.model,model);assert.deepEqual(saved.draft.design,design);
 }
});

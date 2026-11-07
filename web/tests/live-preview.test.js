import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivePreview} from '../src/live-preview.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test('a continuous slider drag renders the newest edit without queuing stale jobs',async()=>{
 const sent=[],rendered=[],busy=[];
 const queue=createLivePreview({send:x=>sent.push(x),render:x=>rendered.push(x),fail:assert.fail,pending:x=>busy.push(x),delay:0});
 queue.schedule({scale:100});await tick();
 for(let scale=101;scale<=150;scale++)queue.schedule({scale});
 await tick();assert.equal(sent.length,1);
 queue.receive({type:'preview',id:sent[0].id,units:'old'});
 assert.equal(rendered.length,0);assert.equal(sent.length,2);assert.equal(sent[1].design.scale,150);
 queue.receive({type:'preview',id:sent[1].id,units:'latest'});
 assert.deepEqual(rendered,['latest']);assert.equal(busy.at(-1),false);
});
test('clearing a name invalidates work in progress and errors allow the next edit',async()=>{
 const sent=[],rendered=[],errors=[];
 const queue=createLivePreview({send:x=>sent.push(x),render:x=>rendered.push(x),fail:x=>errors.push(x),pending:()=>{},delay:0});
 queue.schedule({name:'Koko'});await tick();queue.schedule(null);
 queue.receive({type:'preview',id:sent[0].id,units:'stale'});assert.equal(rendered.length,0);
 queue.schedule({name:'🎄'});await tick();queue.receive({type:'error',id:sent[1].id,message:'Unsupported'});
 assert.deepEqual(errors,['Unsupported']);
 queue.schedule({name:'Koko'});await tick();queue.receive({type:'preview',id:sent[2].id,units:'valid'});
 assert.deepEqual(rendered,['valid']);
});

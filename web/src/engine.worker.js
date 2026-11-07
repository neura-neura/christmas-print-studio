import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import {createGeometryEngine} from './geometry.js';
import {packItems,capacityFor,capacityForGroup} from './packing.js';
import {exportPlate,exportAll} from './export3mf.js';
let engine,assets,lastResult,unitById=new Map(),cache=new Map();
const options={width:256,height:256,margin:6,gap:3,maxItems:250,maxPlates:100};
async function initialize(urls){const [M,assetResponse,fontResponse]=await Promise.all([Module({locateFile:()=>wasmUrl}),fetch(urls.models),fetch(urls.font)]);if(!assetResponse.ok||!fontResponse.ok)throw new Error('No se pudieron cargar los modelos incluidos.');M.setup();assets=await assetResponse.json();engine=createGeometryEngine(M,assets,await fontResponse.arrayBuffer());}
const keyOf=d=>JSON.stringify(d);
function make(design){const key=keyOf(design);if(!cache.has(key)){cache.set(key,engine.generate(design));if(cache.size>60)cache.delete(cache.keys().next().value);}return cache.get(key);}
function processOrder(entries,requestId){let items=[],errors=[];unitById=new Map();const models={};
  for(const [index,entry] of entries.entries()){postMessage({type:'progress',id:requestId,current:index+1,total:entries.length});try{const generated=make(entry.design);models[entry.id]=generated;for(let copy=0;copy<entry.quantity;copy++){const groupId=`${entry.id}:${copy}`;for(const unit of generated){const item={...unit,id:`${groupId}:${unit.piece}`,groupId,entryId:entry.id,copy,model:entry.design.model||'sphere',color:entry.color};items.push(item);unitById.set(item.id,item);}}}catch(error){errors.push({id:entry.id,message:error.message});}}
  const layout=packItems(items,options);for(const reject of layout.rejected)if(!errors.some(e=>e.id===reject.entryId))errors.push({id:reject.entryId,message:reject.message||'El modelo no cabe en la A1.'});
  const capacities=layout.plates.map(plate=>entries.map(entry=>{const pieces=models[entry.id];if(!pieces)return {entryId:entry.id,count:0};try{return {entryId:entry.id,count:pieces.length>1?capacityForGroup(plate,pieces,options).count:capacityFor(plate,pieces[0],options).count};}catch{return {entryId:entry.id,count:0};}}));
  lastResult={...layout,errors,capacities};
  // Do not send expensive mesh arrays for every duplicate. Placements carry a
  // meshKey; the scene references a unique geometry table per design/piece.
  const geometries={};for(const [entryId,parts] of Object.entries(models))parts.forEach(unit=>{geometries[`${entryId}:${unit.piece}`]=unit;});
  const plates=layout.plates.map(plate=>({...plate,placements:plate.placements.map(({parts,...p})=>({...p,meshKey:`${p.entryId}:${p.piece}`}))}));
  postMessage({type:'order',id:requestId,result:{...layout,plates,errors,capacities,geometries,settings:options}});
}
self.onmessage=async ({data})=>{try{
 if(data.type==='init'){await initialize(data.urls);postMessage({type:'ready'});}
 else if(data.type==='preview'){const units=make(data.design);postMessage({type:'preview',id:data.id,units:units.map(({parts,...unit})=>unit)});}
 else if(data.type==='order'){if(!engine)throw new Error('El taller todavía está iniciando.');processOrder(data.entries,data.id);}
 else if(data.type==='export'){if(!lastResult||lastResult.errors.length)throw new Error('Corrige los modelos pendientes antes de descargar.');const binary=data.all?exportAll(lastResult.plates,unitById,assets.settings,options):exportPlate(lastResult.plates[data.index],unitById,assets.settings,{options,plateNumber:data.index+1});postMessage({type:'download',id:data.id,all:data.all,index:data.index,binary},[binary.buffer]);}
}catch(error){postMessage({type:'error',source:data.type,id:data.id,message:error.message||String(error)});}};

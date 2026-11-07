import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {unzipSync,strFromU8} from 'fflate';import Module from 'manifold-3d';import {createGeometryEngine} from '../src/geometry.js';import {packItems,validateLayout} from '../src/packing.js';import {exportPlate} from '../src/export3mf.js';
const M=await Module();M.setup();const data=JSON.parse(fs.readFileSync(new URL('../public/models/models.json',import.meta.url)));const font=fs.readFileSync(new URL('../public/models/CreamCakeBold.otf',import.meta.url));const engine=createGeometryEngine(M,data,font.buffer.slice(font.byteOffset,font.byteOffset+font.byteLength));
test('mixed production export includes each requested piece once with single-color profile',()=>{
 const entries=[{model:'photo',qty:1},{model:'sphere',name:'Lupita',qty:4},{model:'name',name:'MIA',qty:1}];let items=[];
 for(let i=0;i<entries.length;i++){const e=entries[i],units=engine.generate(e);for(let copy=0;copy<e.qty;copy++)units.forEach(u=>items.push({...u,id:`${i}:${copy}:${u.piece}`,groupId:`${i}:${copy}`}));}
 const options={margin:6,gap:3};const result=packItems(items,options);assert.equal(result.rejected.length,0);assert.equal(result.placed,7);assert.deepEqual(validateLayout(result.plates,options),[]);const map=new Map(items.map(x=>[x.id,x]));
 fs.mkdirSync(new URL('../../build/qa/web/',import.meta.url),{recursive:true});
 for(let i=0;i<result.plates.length;i++){
  const bytes=exportPlate(result.plates[i],map,data.settings,{options,plateNumber:i+1});const zip=unzipSync(bytes);const model=strFromU8(zip['3D/3dmodel.model']);const config=strFromU8(zip['Metadata/model_settings.config']);const p=JSON.parse(strFromU8(zip['Metadata/project_settings.config']));assert.equal((model.match(/<item /g)||[]).length,result.plates[i].placements.length);assert.equal(p.enable_support,'0');assert.equal(p.print_sequence,'by layer');assert.ok(config.includes('<plate>'));fs.writeFileSync(new URL(`../../build/qa/web/Placa_${i+1}.3mf`,import.meta.url),bytes);
 }
 fs.writeFileSync(new URL('../../build/qa/web/layout.json',import.meta.url),JSON.stringify(result,null,2));
});

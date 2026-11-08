import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import Module from 'manifold-3d';import {createGeometryEngine} from '../src/geometry.js';
const M=await Module();M.setup();const data=JSON.parse(fs.readFileSync(new URL('../public/models/models.json',import.meta.url)));const font=fs.readFileSync(new URL('../public/models/CreamCakeBold.otf',import.meta.url));const engine=createGeometryEngine(M,data,font.buffer.slice(font.byteOffset,font.byteOffset+font.byteLength));
function manifold(part){return new M.Manifold(new M.Mesh({numProp:3,vertProperties:new Float32Array(part.vertices.flat()),triVerts:new Uint32Array(part.faces.flat())}));}
test('browser WASM generates names proportionally with connected accents',()=>{for(const name of ['MIA','Lupita','Guadalupe','Íñigo']){const units=engine.generate({model:'name',name});assert.equal(units.length,1);const u=units[0];assert.ok(u.width<=200.001&&u.height<=100.001);const m=manifold(u.parts[0]);assert.equal(m.status(),'NoError');assert.ok(m.volume()>0);const cs=m.decompose();assert.equal(cs.length,1);cs.forEach(x=>x.delete());m.delete();if(name==='Lupita')assert.ok(u.width<175&&u.width>130);}});
test('photo unit includes connected frame/loop and separate back',()=>{const us=engine.generate({model:'photo'});assert.equal(us.length,2);for(const u of us){const m=manifold(u.parts[0]);assert.equal(m.status(),'NoError');const cs=m.decompose();assert.equal(cs.length,1);cs.forEach(x=>x.delete());m.delete();}});
test('sphere connects whole name bow and flakes; inner ring remains70mm',()=>{const us=engine.generate({model:'sphere',name:'Lupita',left:true,right:true});assert.equal(us.length,1);const solids=us[0].parts.map(manifold);const whole=M.Manifold.union(solids);assert.equal(whole.status(),'NoError');const cs=whole.decompose();assert.equal(cs.length,1);cs.forEach(x=>x.delete());whole.delete();solids.forEach(x=>x.delete());});
test('ring inner diameter is70mm after browser generation and name does not change it',()=>{const u=engine.generate({model:'sphere',name:'Guadalupe'})[0];const base=manifold(u.parts[0]);const section=base.slice(1);const circles=section.toPolygons().filter(p=>{const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);const w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);return Math.abs(w-70)<.01&&Math.abs(h-70)<.01;});assert.equal(circles.length,1);section.delete();base.delete();});
test('invalid manual dimensions and unsupported characters fail before export',()=>{for(const d of [{model:'name',name:'🎄'},{model:'name',name:'Lupita',nameOnlyAdjust:{scale:200}},{model:'sphere',name:'Lupita',nameAdjust:{scale:'not-a-number'}},{model:'sphere',name:'Lupita',bowAdjust:{x:100}}])assert.throws(()=>engine.generate(d));});
test('live sphere previews match printable outlines through toggles, sizing and position edits',()=>{
 for(const design of [
  {model:'sphere',name:'Koko'},
  {model:'sphere',name:'Koko',left:true,right:true},
  {model:'sphere',name:'Koko',left:true,right:true,leftAdjust:{scale:120,x:1,y:0},nameAdjust:{scale:150}},
  {model:'sphere',name:'Koko',bow:false,left:true,right:true,rightAdjust:{scale:110,x:0,y:1}},
 ]){
  const p=engine.preview(design)[0],full=engine.generate(design)[0];
  assert.ok(Math.abs(p.width-full.width)<.001);assert.ok(Math.abs(p.height-full.height)<.001);
  const parts=p.previewParts.map(ps=>new M.CrossSection(ps,'EvenOdd'));
  const union=M.CrossSection.union(parts),actual=new M.CrossSection(full.footprint,'EvenOdd');
  const delta=union.subtract(actual),inverse=actual.subtract(union);
  assert.ok(delta.area()+inverse.area()<.01,'preview must include the exact printable part silhouettes and text bridges');
  [delta,inverse,actual,union,...parts].forEach(x=>x.delete());
 }
});
test('all standalone names have a centered connected 4mm hanging hole even at 25 percent',()=>{
 for(const name of ['I','Mía','Guadalupe','María José','Íñigo','Maximiliano Alejandro'])for(const scale of [25,100]){
  const unit=engine.generate({model:'name',name,nameOnlyAdjust:{scale}})[0],solid=manifold(unit.parts[0]),section=solid.slice(1.8);
  const holes=section.toPolygons().filter(p=>{const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);return p.length>=100&&Math.abs(Math.max(...xs)-Math.min(...xs)-4)<.002&&Math.abs(Math.max(...ys)-Math.min(...ys)-4)<.002;});
  assert.equal(holes.length,1,`${name} at ${scale}% must have one open 4mm hole`);
  const xs=holes[0].map(p=>p[0]),ys=holes[0].map(p=>p[1]),bounds=solid.boundingBox();
  assert.ok(Math.abs((Math.max(...xs)+Math.min(...xs))/2-(bounds.min[0]+bounds.max[0])/2)<.002);
  assert.ok(Number.isFinite((Math.max(...ys)+Math.min(...ys))/2));
  assert.ok(unit.width<=200.001&&unit.height<=100.001&&unit.volume<=14000.1);
  const chunks=solid.decompose();assert.equal(chunks.length,1);chunks.forEach(x=>x.delete());section.delete();solid.delete();
 }
});

test('paw and mouse fit names, bridge both edges and remain one physical piece through manual edits',()=>{
 for(const model of ['paw','mouse'])for(const name of ['I','Coco','Mía','Guadalupe','María José','Maximiliano Alejandro'])for(const scale of [25,100,150]){
  const design={model,name,nameAdjust:{scale,x:1,y:-1}},unit=engine.generate(design)[0],solids=unit.parts.map(manifold),whole=M.Manifold.union(solids);
  assert.equal(whole.status(),'NoError');const chunks=whole.decompose();assert.equal(chunks.length,1,`${model} ${name} ${scale}`);assert.ok(unit.width<150&&unit.height<125);
  chunks.forEach(s=>s.delete());whole.delete();solids.forEach(s=>s.delete());
 }
 for(const bow of [false,true]){
  const d={model:'mouse',name:'Lupita',bow},p=engine.preview(d)[0],unit=engine.generate(d)[0];assert.equal(unit.parts.length,bow?3:2);
  const sections=p.previewParts.map(ps=>new M.CrossSection(ps,'EvenOdd')),union=M.CrossSection.union(sections),actual=new M.CrossSection(unit.footprint,'EvenOdd'),diff=union.subtract(actual),inverse=actual.subtract(union);assert.ok(diff.area()+inverse.area()<.01);[...sections,union,actual,diff,inverse].forEach(s=>s.delete());
 }
 assert.equal(data.custom.paw.maxWidth,70);assert.equal(data.custom.mouse.maxWidth,70);
});
test('compact eyelets attach to the local stroke rather than the highest remote letter',()=>{
 for(const name of ['mia','Kevin']){
  const u=engine.generate({model:'name',name})[0],solid=manifold(u.parts[0]),cut=solid.slice(1.8);
  const hole=cut.toPolygons().find(p=>{const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]);return p.length>=100&&Math.abs(Math.max(...xs)-Math.min(...xs)-4)<.002&&Math.abs(Math.max(...ys)-Math.min(...ys)-4)<.002;});
  assert.ok(hole);const xs=hole.map(p=>p[0]),ys=hole.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const letters=solid.slice(3),strip=M.CrossSection.square([4.4,400],true).translate([cx,0]),local=letters.intersect(strip);assert.ok(cy-local.bounds().max[1]<=4);assert.ok(cy-local.bounds().max[1]>1);
  [cut,letters,strip,local,solid].forEach(s=>s.delete());
 }
});

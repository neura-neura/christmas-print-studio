import opentype from 'opentype.js';

export const SIZING={maxWidth:200,maxHeight:100,targetVolume:14000};
const SCALE=1.10501661;
const CENTER=[2.1015*SCALE,-5.6763*SCALE];
const distance2=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;

export function createGeometryEngine(M, assets, fontBuffer) {
  const font=opentype.parse(fontBuffer);
  let owned=[];
  const own=x=>(owned.push(x),x);
  const cleanup=()=>{for(let i=owned.length-1;i>=0;i--)try{owned[i].delete();}catch{} owned=[];};
  const add=(...xs)=>own(M.CrossSection.union(xs));
  const solidUnion=xs=>own(M.Manifold.union(xs));
  const section=(ps,rule='EvenOdd')=>own(new M.CrossSection(ps,rule));
  const extrude=(s,h,z=0)=>own(own(s.extrude(h)).translate([0,0,z]));
  function importMesh(data){return own(new M.Manifold(new M.Mesh({numProp:3,vertProperties:new Float32Array(data.vertices.flat()),triVerts:new Uint32Array(data.faces.flat())})));}
  function assertSolid(s,label,one=true){if(s.status()!=='NoError'||s.volume()<=0)throw new Error(`No se pudo cerrar ${label}.`);if(one){const chunks=s.decompose();const count=chunks.length;chunks.forEach(c=>c.delete());if(count!==1)throw new Error(`${label} tiene una pieza suelta. Cambia el nombre o su ajuste.`);}}
  function meshData(s){const raw=s.getMesh();const vertices=[];for(let i=0;i<raw.vertProperties.length;i+=raw.numProp)vertices.push([raw.vertProperties[i],raw.vertProperties[i+1],raw.vertProperties[i+2]]);const faces=[];for(let i=0;i<raw.triVerts.length;i+=3)faces.push([raw.triVerts[i],raw.triVerts[i+1],raw.triVerts[i+2]]);return {vertices,faces};}
  function glyphContours(path){let result=[],points=[],current=[0,0];
    const end=()=>{if(points.length>=3)result.push(points);points=[];};
    for(const c of path.commands){const p=[c.x,-c.y];
      if(c.type==='M'){end();points=[p];current=p;}
      else if(c.type==='L'){points.push(p);current=p;}
      else if(c.type==='C'){const p0=current,p1=[c.x1,-c.y1],p2=[c.x2,-c.y2];for(let i=1;i<=24;i++){const t=i/24,u=1-t;points.push([u*u*u*p0[0]+3*u*u*t*p1[0]+3*u*t*t*p2[0]+t*t*t*p[0],u*u*u*p0[1]+3*u*u*t*p1[1]+3*u*t*t*p2[1]+t*t*t*p[1]]);}current=p;}
      else if(c.type==='Q'){const p0=current,p1=[c.x1,-c.y1];for(let i=1;i<=20;i++){const t=i/20,u=1-t;points.push([u*u*p0[0]+2*u*t*p1[0]+t*t*p[0],u*u*p0[1]+2*u*t*p1[1]+t*t*p[1]]);}current=p;}
      else if(c.type==='Z')end();
    }end();return result;
  }
  function outline(text){
    text=String(text).normalize('NFC').replace(/\s+/g,' ').trim();if(!text||text.length>40)throw new Error('Escribe un nombre de 1 a 40 caracteres.');
    for(const c of text)if(!/\s/u.test(c)&&!font.charToGlyph(c).index)throw new Error(`La fuente no incluye «${c}».`);
    const glyphs=[];font.forEachGlyph(text,0,0,100,{kerning:true,features:{liga:true,rlig:true}},(glyph,x,y,size)=>{const ps=glyphContours(glyph.getPath(x,y,size));if(ps.length)glyphs.push(section(ps));});
    const raw=own(M.CrossSection.union(glyphs));const b=raw.bounds();const fit=Math.min(76.7*SCALE/(b.max[0]-b.min[0]),29*SCALE/(b.max[1]-b.min[1]));
    const s=own(raw.scale(fit));const sb=s.bounds();const centered=own(s.translate([CENTER[0]-(sb.min[0]+sb.max[0])/2,CENTER[1]-(sb.min[1]+sb.max[1])/2]));
    return own(centered.offset(.14*SCALE,'Round',2,16));
  }
  function capsule(a,b,r){return own(M.CrossSection.hull([own(own(M.CrossSection.circle(r,20)).translate(a)),own(own(M.CrossSection.circle(r,20)).translate(b))]));}
  function nearest(a,b){let best=Infinity,pa,pb;const ap=a.toPolygons(),bp=b.toPolygons();
    // Vertices on flattened curves form a conservative short bridge. Include
    // projections onto segments to avoid long bars from coarse straight edges.
    const project=(p,u,v)=>{const dx=v[0]-u[0],dy=v[1]-u[1],l=dx*dx+dy*dy;const t=l?Math.max(0,Math.min(1,((p[0]-u[0])*dx+(p[1]-u[1])*dy)/l)):0;return [u[0]+t*dx,u[1]+t*dy];};
    for(const ac of ap)for(const bc of bp){for(const p of ac)for(let j=0;j<bc.length;j++){const q=project(p,bc[j],bc[(j+1)%bc.length]);const d=distance2(p,q);if(d<best){best=d;pa=p;pb=q;}}for(const q of bc)for(let j=0;j<ac.length;j++){const p=project(q,ac[j],ac[(j+1)%ac.length]);const d=distance2(p,q);if(d<best){best=d;pa=p;pb=q;}}}
    return {a:pa,b:pb,distance:Math.sqrt(best)};
  }
  function connectedShape(shape,radius){let under=shape;
    for(let step=0;step<60;step++){const pieces=under.decompose();pieces.forEach(own);if(pieces.length===1)return under;let best;
      for(let i=0;i<pieces.length;i++)for(let j=i+1;j<pieces.length;j++){const pair=nearest(pieces[i],pieces[j]);if(!best||pair.distance<best.distance)best=pair;}
      under=add(under,capsule(best.a,best.b,radius));
    }throw new Error('El nombre tiene demasiadas piezas separadas.');
  }
  const transformPart=(s,adjust={})=>{const amount=Number(adjust.scale??100)/100;if(![amount,Number(adjust.x||0),Number(adjust.y||0)].every(Number.isFinite)||Math.abs(Number(adjust.x||0))>20||Math.abs(Number(adjust.y||0))>20||amount<.25||amount>1.5)throw new Error('Tamaño fuera de rango.');const b=s.boundingBox();const c=b.min.map((x,i)=>(x+b.max[i])/2);return own(own(own(s.translate(c.map(x=>-x))).scale([amount,amount,1])).translate([c[0]+Number(adjust.x||0),c[1]+Number(adjust.y||0),c[2]]));};
  function sphereText(design){
      let shape=outline(design.name);const adj=design.nameAdjust||{};const amount=Number(adj.scale??100)/100;if(![amount,Number(adj.x||0),Number(adj.y||0)].every(Number.isFinite)||Math.abs(Number(adj.x||0))>20||Math.abs(Number(adj.y||0))>20||amount<.25||amount>1.5)throw new Error('Usa un tamaño entre 25 y 150 %.');
      shape=own(own(own(shape.translate(CENTER.map(x=>-x))).scale(amount)).translate([CENTER[0]+Number(adj.x||0),CENTER[1]+Number(adj.y||0)]));let under=connectedShape(shape,.7*SCALE);
      const outer=own(own(own(M.CrossSection.circle(37.677626*SCALE,720)).scale([1,37.81348/37.677626])).translate(CENTER));const inner=own(own(M.CrossSection.circle(35,720)).translate(CENTER));const ring=own(outer.subtract(inner));
      for(const side of [-1,1]){const box=own(own(M.CrossSection.square([60,65],true)).translate([CENTER[0]+side*50,CENTER[1]]));const target=own(ring.intersect(box));const pair=nearest(under,target);let end=pair.b;if(pair.distance>.001){const dx=(end[0]-pair.a[0])/pair.distance,dy=(end[1]-pair.a[1])/pair.distance;end=[end[0]+dx*2.2*SCALE,end[1]+dy*2.2*SCALE];}under=add(under,capsule(pair.a,end,.95*SCALE));}
    return {shape,under};
  }
  function generate(design){owned=[];try{
    const mode=design.model||'sphere';let parts=[],labels=[];
    if(mode==='photo'){
      parts=assets.photo.map(importMesh);labels=['Frente y argolla','Tapa trasera'];parts.forEach((s,i)=>assertSolid(s,labels[i]));
    }else if(mode==='name'){
      let shape=outline(design.name);let b=shape.bounds();shape=own(shape.translate([-(b.min[0]+b.max[0])/2,-(b.min[1]+b.max[1])/2]));b=shape.bounds();shape=own(shape.scale(Math.min(199.5/(b.max[0]-b.min[0]),99.5/(b.max[1]-b.min[1]))));
      const under=connectedShape(shape,1);let s=solidUnion([extrude(shape,4),extrude(under,1.2)]);b=s.boundingBox();const size=b.max.map((x,i)=>x-b.min[i]);const amount=Number(design.nameOnlyAdjust?.scale??100)/100;if(!Number.isFinite(amount)||amount<.25||amount>1)throw new Error('Usa un tamaño entre 25 y 100 %.');
      const fit=Math.min(Math.sqrt(SIZING.targetVolume/s.volume()),200/size[0],100/size[1])*amount;s=own(s.scale([fit,fit,1]));assertSolid(s,'El nombre');parts=[s];labels=[`Nombre — ${design.name}`];
    }else{
      const {shape,under}=sphereText(design);
      const text=solidUnion([extrude(shape,4),extrude(under,1.4)]);assertSolid(text,'El nombre');
      parts=[importMesh(assets.sphere.base)];labels=['Aro de 70 mm y argolla'];
      if(design.bow!==false){parts.push(transformPart(importMesh(assets.sphere.bow),design.bowAdjust));labels.push('Moño');}
      parts.push(text);labels.push(`Nombre — ${design.name}`);
      for(const key of ['left','right'])if(design[key]){parts.push(transformPart(importMesh(assets.sphere[key]),design[`${key}Adjust`]));labels.push(key==='left'?'Copo izquierdo':'Copo derecho');}
      const whole=solidUnion(parts);assertSolid(whole,'La esfera');
    }
    // Each physical photo piece is a separate nesting unit; sphere parts stay
    // together in one assembly. Geometry dimensions are never changed by packing.
    const groups=mode==='photo'?parts.map((p,i)=>({solids:[p],labels:[labels[i]]})):[{solids:parts,labels}];
    return groups.map((group,index)=>{
      const bounds=group.solids.map(s=>s.boundingBox());const min=[0,1,2].map(i=>Math.min(...bounds.map(b=>b.min[i])));const max=[0,1,2].map(i=>Math.max(...bounds.map(b=>b.max[i])));const center=[(min[0]+max[0])/2,(min[1]+max[1])/2,min[2]];
      const result=group.solids.map((solid,i)=>({name:group.labels[i],...meshData(own(solid.translate(center.map(x=>-x))))}));
      const footprint=own(own(M.CrossSection.union(group.solids.map(s=>own(s.project())))).translate([-center[0],-center[1]])).toPolygons();
      return {piece:index,parts:result,footprint,width:max[0]-min[0],height:max[1]-min[1],depth:max[2]-min[2],volume:group.solids.reduce((v,s)=>v+s.volume(),0),label:mode==='photo'?labels[index]:mode==='name'?`Nombre · ${design.name}`:`Esfera · ${design.name}`};
    });
  }finally{cleanup();}}
  // Preview keeps the exact text/connection outlines but never rebuilds or
  // unions the high-resolution 3D ornament meshes while a control is moving.
  const previewTemplates=new Map(),previewText=new Map();
  function template(key){
    if(!previewTemplates.has(key))previewTemplates.set(key,own(importMesh(assets.sphere[key]).project()).toPolygons());
    return previewTemplates.get(key);
  }
  function preview(design){
    if((design.model||'sphere')!=='sphere')return generate(design).map(({parts,...unit})=>unit);
    owned=[];
    try{
      const textKey=JSON.stringify([design.name,design.nameAdjust]);
      if(!previewText.has(textKey)){
        const {shape,under}=sphereText(design);
        previewText.set(textKey,add(shape,under).toPolygons());
        if(previewText.size>20)previewText.delete(previewText.keys().next().value);
      }
      const polygons=[template('base')];
      function adjusted(key,adjust={}){
        const ps=template(key),points=ps.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
        const cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
        const scale=Number(adjust.scale??100)/100,x=Number(adjust.x||0),y=Number(adjust.y||0);
        if(![scale,x,y].every(Number.isFinite)||scale<.25||scale>1.5||Math.abs(x)>20||Math.abs(y)>20)throw new Error('Tamaño fuera de rango.');
        return ps.map(p=>p.map(v=>[(v[0]-cx)*scale+cx+x,(v[1]-cy)*scale+cy+y]));
      }
      if(design.bow!==false)polygons.push(adjusted('bow',design.bowAdjust));
      polygons.push(previewText.get(textKey));
      for(const key of ['left','right'])if(design[key])polygons.push(adjusted(key,design[`${key}Adjust`]));
      const points=polygons.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
      const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),cx=(minX+maxX)/2,cy=(minY+maxY)/2;
      return [{piece:0,width:maxX-minX,height:maxY-minY,previewParts:polygons.map(ps=>ps.map(p=>p.map(v=>[v[0]-cx,v[1]-cy])))}];
    }finally{cleanup();}
  }
  return {generate,preview};
}

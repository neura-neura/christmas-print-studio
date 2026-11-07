import {zipSync,strToU8} from 'fflate';
import {validateLayout} from './packing.js';
const CORE='http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
export const escapeXML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const f=n=>{if(!Number.isFinite(n))throw new Error('Coordenada no válida.');return String(Math.round(n*1e6)/1e6);};
const metadata=(key,value)=>`<metadata key="${escapeXML(key)}" value="${escapeXML(value)}"/>`;
export function exportPlate(plate,unitById,settings,{options,jobName='Pedido navideño',plateNumber=1}={}) {
  const problems=validateLayout([plate],options);if(problems.length)throw new Error('La placa no pasó la validación: '+problems.join(' '));
  let resources='',configObjects='',items='',instances='',assembled='',id=1;const manifest=[];
  for(const p of plate.placements){const unit=unitById.get(p.id);if(!unit)throw new Error('Falta un modelo del pedido.');const childIds=[];
    for(const part of unit.parts){const child=id++;childIds.push(child);if(!part.vertices.length||!part.faces.length)throw new Error('Malla vacía.');
      const mesh=`<vertices>${part.vertices.map(v=>`<vertex x="${f(v[0])}" y="${f(v[1])}" z="${f(v[2])}"/>`).join('')}</vertices><triangles>${part.faces.map(t=>`<triangle v1="${t[0]}" v2="${t[1]}" v3="${t[2]}"/>`).join('')}</triangles>`;
      resources+=`<object id="${child}" type="model"><mesh>${mesh}</mesh></object>`;
    }
    const object=id++;resources+=`<object id="${object}" type="model"><components>${childIds.map(i=>`<component objectid="${i}"/>`).join('')}</components></object>`;
    const angle=p.rotation*Math.PI/180;const c=Math.round(Math.cos(angle)),s=Math.round(Math.sin(angle));const x=p.x+p.width/2,y=p.y+p.height/2;
    const transform=`${c} ${s} 0 ${-s} ${c} 0 0 0 1 ${f(x)} ${f(y)} 0`;
    items+=`<item objectid="${object}" transform="${transform}" printable="1"/>`;
    const faceCount=unit.parts.reduce((n,part)=>n+part.faces.length,0);
    configObjects+=`<object id="${object}">${metadata('name',unit.label)}${metadata('extruder','1')}<metadata face_count="${faceCount}"/>${childIds.map((child,i)=>`<part id="${child}" subtype="normal_part">${metadata('name',unit.parts[i].name)}${metadata('extruder','1')}${metadata('matrix','1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1')}<mesh_stat face_count="${unit.parts[i].faces.length}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/></part>`).join('')}</object>`;
    instances+=`<model_instance>${metadata('object_id',object)}${metadata('instance_id',0)}${metadata('identify_id',100+object)}</model_instance>`;
    assembled+=`<assemble_item object_id="${object}" instance_id="0" transform="${transform}" offset="0 0 0"/>`;
    manifest.push({id:p.id,label:unit.label,groupId:unit.groupId,x:p.x,y:p.y,width:p.width,height:p.height,rotation:p.rotation});
  }
  if(!plate.placements.length)throw new Error('La placa está vacía.');
  const process={...settings,print_sequence:'by layer',enable_prime_tower:'0',enable_support:'0',brim_type:'no_brim',skirt_loops:'0',raft_layers:'0',curr_bed_type:'Textured PEI Plate'};
  const files={
    '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/><Default Extension="config" ContentType="text/xml"/><Default Extension="json" ContentType="application/json"/></Types>`,
    '_rels/.rels':`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    '3D/3dmodel.model':`<?xml version="1.0" encoding="UTF-8"?><model xmlns="${CORE}" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" unit="millimeter" xml:lang="es-MX"><metadata name="Application">BambuStudio-02.09.01.70</metadata><metadata name="BambuStudio:3mfVersion">1</metadata><metadata name="Title">${escapeXML(jobName)} · Placa ${plateNumber}</metadata><resources>${resources}</resources><build>${items}</build></model>`,
    'Metadata/model_settings.config':`<?xml version="1.0" encoding="UTF-8"?><config>${configObjects}<plate>${metadata('plater_id',1)}${metadata('plater_name',`Placa ${plateNumber}`)}${metadata('locked','false')}${metadata('filament_map_mode','Auto For Flush')}${metadata('filament_maps','1')}${instances}</plate><assemble>${assembled}</assemble></config>`,
    'Metadata/project_settings.config':JSON.stringify(process,null,2),
    'Metadata/production.json':JSON.stringify({version:1,jobName,plateNumber,settings:{printer:'Bambu Lab A1',bed:256,margin:options?.margin??6,gap:options?.gap??3},items:manifest},null,2),
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([key,value])=>[key,strToU8(value)])),{level:6});
}
export function exportAll(plates,units,settings,options){return zipSync(Object.fromEntries(plates.map((plate,i)=>[`Placa_${String(i+1).padStart(2,'0')}.3mf`,exportPlate(plate,units,settings,{options,plateNumber:i+1})])),{level:0});}

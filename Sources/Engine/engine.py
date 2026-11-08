"""Generate a connected, centered name ornament as a multipart Bambu project."""
from pathlib import Path
import argparse, json, re, zipfile, xml.etree.ElementTree as ET, uuid, unicodedata, sys, functools
import numpy as np
import trimesh
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import unary_union, nearest_points
from shapely.affinity import scale, translate

ASSETS=Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parents[2])) / ('assets' if getattr(sys, 'frozen', False) else 'Resources')
NS='http://schemas.microsoft.com/3dmanufacturing/core/2015/02'
PN='http://schemas.microsoft.com/3dmanufacturing/production/2015/06'
q=lambda name:'{'+NS+'}'+name
ET.register_namespace('', NS); ET.register_namespace('p', PN)
CENTER=(2.1015,-5.6763)
PRINT_XY_SCALE=1.10501661
INNER_DIAMETER_MM=70.0
NAME_REFERENCE_VOLUME_MM3=14000.0
NAME_MAX_WIDTH_MM=200.0
NAME_MAX_HEIGHT_MM=100.0
INNER_RADIUS=INNER_DIAMETER_MM / (2 * PRINT_XY_SCALE)

class FlattenPen(BasePen):
    def __init__(self, gs):
        super().__init__(gs);self.contours=[];self.points=[]
    def _moveTo(self,p):
        self._endPath();self.points=[np.array(p,dtype=float)]
    def _lineTo(self,p):self.points.append(np.array(p,dtype=float))
    def _curveToOne(self,p1,p2,p3):
        p0=self.points[-1];p1=np.array(p1);p2=np.array(p2);p3=np.array(p3)
        for t in np.linspace(0,1,33)[1:]:self.points.append((1-t)**3*p0+3*(1-t)**2*t*p1+3*(1-t)*t*t*p2+t**3*p3)
    def _qCurveToOne(self,p1,p2):
        p0=self.points[-1];p1=np.array(p1);p2=np.array(p2)
        for t in np.linspace(0,1,25)[1:]:self.points.append((1-t)**2*p0+2*(1-t)*t*p1+t*t*p2)
    def _closePath(self):self._endPath()
    def _endPath(self):
        if len(self.points)>2:self.contours.append(self.points)
        self.points=[]

def polygons(g):
    if g.geom_type=='Polygon':return [g]
    return [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon' and p.area>1e-8]

@functools.lru_cache(maxsize=64)
def font_outline(name):
    path=ASSETS/'Cream Cake Bold.otf'
    font=TTFont(path);gs=font.getGlyphSet();order=font.getGlyphOrder();cmap=font.getBestCmap()
    missing=[c for c in name if not c.isspace() and ord(c) not in cmap]
    if missing:raise ValueError('La fuente no incluye estos caracteres: '+', '.join(sorted(set(missing))))
    hfont=hb.Font(hb.Face(path.read_bytes()));hfont.scale=(font['head'].unitsPerEm,)*2
    buf=hb.Buffer();buf.add_str(name);buf.guess_segment_properties();hb.shape(hfont,buf,{'kern':True,'liga':True})
    x=y=0;glyphs=[]
    for info,pos in zip(buf.glyph_infos,buf.glyph_positions):
        pen=FlattenPen(gs);gs[order[info.codepoint]].draw(pen);pen._endPath();shape=Polygon()
        for points in pen.contours:
            poly=Polygon(points).buffer(0);shape=shape.symmetric_difference(poly)
        if not shape.is_empty:glyphs.append(translate(shape,x+pos.x_offset,y+pos.y_offset))
        x+=pos.x_advance;y+=pos.y_advance
    if not glyphs:raise ValueError('Escribe un nombre con letras.')
    shape=unary_union(glyphs).buffer(0)
    xmin,ymin,xmax,ymax=shape.bounds
    factor=min(76.7/(xmax-xmin),29/(ymax-ymin))
    shape=scale(shape,xfact=factor,yfact=factor,origin=(0,0))
    xmin,ymin,xmax,ymax=shape.bounds
    shape=translate(shape,CENTER[0]-(xmin+xmax)/2,CENTER[1]-(ymin+ymax)/2)
    # A small strengthening offset protects thin letter strokes.
    return shape.buffer(.14,quad_segs=8).simplify(.008,preserve_topology=True)

def extrude(shape,height,z=-1.5):
    import manifold3d as md
    contours=[]
    for p in polygons(shape):
        contours.append(np.asarray(p.exterior.coords)[:-1])
        contours.extend(np.asarray(r.coords)[:-1] for r in p.interiors)
    cross=md.CrossSection(contours,md.FillRule.EvenOdd)
    mesh=cross.extrude(height).translate((0,0,z)).to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:,:3],np.asarray(mesh.tri_verts),process=True)

def readmesh(root,oid):
    obj=root.find(q('resources')).find(q('object')+"[@id='"+str(oid)+"']")
    me=obj.find(q('mesh'))
    v=np.array([[float(e.get(k)) for k in ['x','y','z']] for e in me.find(q('vertices'))])
    f=np.array([[int(e.get(k)) for k in ['v1','v2','v3']] for e in me.find(q('triangles'))])
    return trimesh.Trimesh(v,f)

def make_name(name,base,adjust=None):
    adjust=adjust or {}
    amount=float(adjust.get('scale',100))/100
    dx=float(adjust.get('x',0))/1.10501661;dy=float(adjust.get('y',0))/1.10501661
    if not 0.25<=amount<=1.5 or abs(dx)>30 or abs(dy)>30:raise ValueError('Ajustes fuera de rango.')
    shape=translate(scale(font_outline(name),xfact=amount,yfact=amount,origin=CENTER),dx,dy);underlay=shape
    # Join letters, dots and accents with recessed 1.4 mm-wide bridges.
    while len(polygons(underlay))>1:
        ps=polygons(underlay)
        _,i,j=min((ps[i].distance(ps[j]),i,j) for i in range(len(ps)) for j in range(i+1,len(ps)))
        a,b=nearest_points(ps[i],ps[j]);bridge=LineString([a,b]).buffer(.7,quad_segs=10)
        underlay=unary_union([underlay,bridge])
    # Two independent attachment arms join the name to each side of the ring.
    angles=np.linspace(0,2*np.pi,1440,endpoint=False)
    outer=np.column_stack([CENTER[0]+37.677626*np.cos(angles),CENTER[1]+37.81348*np.sin(angles)])
    inner=np.column_stack([CENTER[0]+INNER_RADIUS*np.cos(angles),CENTER[1]+INNER_RADIUS*np.sin(angles)])
    ring=Polygon(outer,[inner[::-1]])
    from shapely.geometry import box
    for region in [box(-50,-27,CENTER[0]-15,15),box(CENTER[0]+15,-27,55,15)]:
        target=ring.intersection(region)
        # Anchor into the band, not merely against its inner boundary.
        a,b=nearest_points(underlay,target)
        av=np.array(a.coords[0]);bv=np.array(b.coords[0]);direction=bv-av;length=np.linalg.norm(direction)
        if length>1e-5:
            end=bv+direction/length*2.2
            arm=LineString([av,end]).buffer(.95,quad_segs=10)
        else:
            # Existing overlap gets strengthened locally.
            arm=a.buffer(1.1,quad_segs=10)
        underlay=unary_union([underlay,arm])
    full=trimesh.boolean.union([extrude(shape,3),extrude(underlay,1.05)],engine='manifold')
    if not full.is_watertight or len(full.split())!=1:raise ValueError('No se pudo unir el nombre. Prueba otra escritura.')
    return full

@functools.lru_cache(maxsize=1)
def print_profile():
    return json.loads((ASSETS/'perfil_impresion.json').read_text())

def write_project(src,parts,names,out,settings):
    model=ET.fromstring(src.read('3D/3dmodel.model'));components=model.find(q('resources')).find(q('object')).find(q('components'));components.clear()
    meshes=ET.Element(q('model'),{'unit':'millimeter'});resources=ET.SubElement(meshes,q('resources'))
    config=ET.fromstring(src.read('Metadata/model_settings.config'));obj=config.find('object')
    for p in list(obj.findall('part')):obj.remove(p)
    obj.find("metadata[@key='name']").set('value',('Nombre ' if settings.get('model')=='name' else 'Esfera ')+settings['name']+' - piezas editables')
    obj.find('metadata[@face_count]').set('face_count',str(sum(len(t.faces) for t in parts)))
    for i,(name,t) in enumerate(zip(names,parts),1):
        ob=ET.SubElement(resources,q('object'),{'id':str(i),'type':'model'});mesh=ET.SubElement(ob,q('mesh'));vs=ET.SubElement(mesh,q('vertices'));fs=ET.SubElement(mesh,q('triangles'))
        for v in t.vertices:ET.SubElement(vs,q('vertex'),dict(zip(['x','y','z'],[f'{x:.17g}' for x in v])))
        for f in t.faces:ET.SubElement(fs,q('triangle'),dict(zip(['v1','v2','v3'],map(str,f))))
        ET.SubElement(components,q('component'),{'{'+PN+'}path':'/3D/Objects/esfera_agrupada.model','objectid':str(i),'{'+PN+'}UUID':str(uuid.uuid4()),'transform':'1 0 0 0 1 0 0 0 1 0 0 0'})
        p=ET.SubElement(obj,'part',{'id':str(i),'subtype':'normal_part'})
        for k,v in [('name',name),('extruder','1'),('matrix','1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1')]:ET.SubElement(p,'metadata',{'key':k,'value':v})
        ET.SubElement(p,'mesh_stat',{'face_count':str(len(t.faces)),'edges_fixed':'0','degenerate_facets':'0','facets_removed':'0','facets_reversed':'0','backwards_edges':'0'})
    if settings.get('model')=='name':
        item=model.find(q('build')).find(q('item'));item.set('transform','1 0 0 0 1 0 0 0 1 128 128 0')
        assemble=config.find('assemble');assemble.clear()
        ET.SubElement(assemble,'assemble_item',{'object_id':obj.get('id'),'instance_id':'0','transform':'1 0 0 0 1 0 0 0 1 128 128 0','offset':'0 0 0'})
    process=json.loads(src.read('Metadata/project_settings.config'))
    process.update(print_profile()['settings'])
    changes={'3D/3dmodel.model':model,'3D/Objects/esfera_agrupada.model':meshes,'Metadata/model_settings.config':config}
    encoded_process=json.dumps(process,ensure_ascii=False,indent=2).encode('utf-8')
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        for n in src.namelist():
            if n in changes or n in ['Metadata/esferas_editor.json','Metadata/project_settings.config']:continue
            z.writestr(n,src.read(n))
        for n,r in changes.items():z.writestr(n,ET.tostring(r,encoding='utf-8',xml_declaration=True))
        z.writestr('Metadata/project_settings.config',encoded_process)
        z.writestr('Metadata/esferas_editor.json',json.dumps(settings,ensure_ascii=False))

@functools.lru_cache(maxsize=1)
def template():
    src=zipfile.ZipFile(ASSETS/'plantilla.3mf')
    root=ET.fromstring(src.read('3D/Objects/esfera_agrupada.model'))
    meshes={i:readmesh(root,i) for i in [1,2,4,5]}
    # Replace the old slightly elliptical opening with a true 70 mm circle.
    # The app's fixed build transform is included in this local radius.
    angles=np.linspace(0,2*np.pi,1440,endpoint=False)
    opening=Polygon(np.column_stack([CENTER[0]+INNER_RADIUS*np.cos(angles),CENTER[1]+INNER_RADIUS*np.sin(angles)]))
    overlap=Polygon(np.column_stack([CENTER[0]+33.5*np.cos(angles),CENTER[1]+33.5*np.sin(angles)]))
    band=overlap.difference(opening)
    meshes[1]=trimesh.boolean.union([meshes[1],extrude(band,2)],engine='manifold')
    meshes[1]=trimesh.boolean.difference([meshes[1],extrude(opening,5,z=-2)],engine='manifold')
    return src,meshes

def export_mesh(mesh):
    result=mesh.copy()
    result.vertices=np.round(result.vertices,5)
    result.merge_vertices(digits_vertex=5)
    result.update_faces(result.nondegenerate_faces())
    result.update_faces(result.unique_faces())
    result.remove_unreferenced_vertices()
    if not result.is_volume:raise ValueError('No se pudo cerrar una de las piezas para exportar.')
    return result

def adjusted(mesh,settings):
    m=mesh.copy();factor=float(settings.get('scale',100))/100
    if not .25<=factor<=1.5:raise ValueError('Tamaño fuera de rango.')
    center=m.bounds.mean(axis=0);m.apply_translation(-center);m.apply_scale([factor,factor,1]);m.apply_translation(center)
    m.apply_translation([float(settings.get('x',0))/1.10501661,float(settings.get('y',0))/1.10501661,0])
    return m

def generate_sphere(settings,out):
    name=unicodedata.normalize('NFC',' '.join(settings.get('name','Lupita').split()))
    if not name or len(name)>40:raise ValueError('Escribe un nombre de 1 a 40 caracteres.')
    settings=dict(settings,model='sphere',name=name,innerDiameterMM=INNER_DIAMETER_MM,printProfile=print_profile()['id'])
    src,meshes=template();base=meshes[1]
    word=make_name(name,base,settings.get('nameAdjust'))
    parts=[base];names=['Aro y argolla']
    if settings.get('bow',True):parts.append(adjusted(meshes[2],settings.get('bowAdjust',{})));names.append('Moño')
    parts.append(word);names.append('Nombre - '+name)
    for key,oid,label in [('left',4,'Copo izquierdo'),('right',5,'Copo derecho')]:
        if settings.get(key,False):parts.append(adjusted(meshes[oid],settings.get(key+'Adjust',{})));names.append(label)
    # Snap sub-micron boolean remnants before export, so slicer vertex welding
    # cannot create degenerate facets when it reloads or saves the project.
    parts=[export_mesh(mesh) for mesh in parts]
    whole=trimesh.boolean.union(parts,engine='manifold')
    connected=whole.is_watertight and len(whole.split())==1
    out=Path(out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
    scene=[]
    for label,mesh in zip(names,parts):
        vertices=mesh.vertices*np.array([1.10501661,1.10501661,1.33333333])
        scene.append({'name':label,'vertices':vertices.round(5).tolist(),'normals':mesh.vertex_normals.round(5).tolist(),'faces':mesh.faces.tolist()})
    preview=out.with_suffix('.mesh.json');preview.write_text(json.dumps(scene,separators=(',',':')))
    if connected:write_project(src,parts,names,out,settings)
    return {'name':name,'file':str(out) if connected else None,'preview':str(preview),'connected':bool(connected),'sizeMM':(whole.extents*np.array([PRINT_XY_SCALE,PRINT_XY_SCALE,1.33333333])).round(2).tolist(),'model':'sphere','message':'' if connected else 'Una pieza está separada del aro. Acércala para poder guardar.'}

def validate_name(name):
    name=unicodedata.normalize('NFC',' '.join(name.split()))
    if not name or len(name)>40:raise ValueError('Escribe un nombre de 1 a 40 caracteres.')
    return name

def standalone_name(name,adjust=None):
    shape=font_outline(name)
    xmin,ymin,xmax,ymax=shape.bounds
    shape=translate(shape,-(xmin+xmax)/2,-(ymin+ymax)/2)
    factor=min(199.5/(xmax-xmin),99.5/(ymax-ymin))
    shape=scale(shape,xfact=factor,yfact=factor,origin=(0,0))
    underlay=shape
    while len(polygons(underlay))>1:
        ps=polygons(underlay)
        _,i,j=min((ps[i].distance(ps[j]),i,j) for i in range(len(ps)) for j in range(i+1,len(ps)))
        a,b=nearest_points(ps[i],ps[j]);underlay=unary_union([underlay,LineString([a,b]).buffer(1.0,quad_segs=12)])
    mesh=trimesh.boolean.union([extrude(shape,4,z=0),extrude(underlay,1.2,z=0)],engine='manifold')
    amount=float((adjust or {}).get('scale',100))/100
    if not .25<=amount<=1:raise ValueError('El tamaño del nombre debe estar entre 25 y 100 %.')
    # Z/thickness stays fixed. Scaling X and Y equally changes volume by s².
    # A common CAD-volume budget gives medium names an intermediate size,
    # while the dimensional limits can reduce especially long/tall names.
    volume_fit=np.sqrt(NAME_REFERENCE_VOLUME_MM3/mesh.volume)
    limit_fit=min(NAME_MAX_WIDTH_MM/mesh.extents[0],NAME_MAX_HEIGHT_MM/mesh.extents[1])
    fit=min(volume_fit,limit_fit)
    # A fixed-size eyelet stays usable even when the lettering is reduced.
    # Its center follows the midpoint of the complete word's horizontal bounds.
    original=mesh
    def with_hanger(fit):
        body=original.copy();body.apply_scale([fit,fit,1])
        foot=scale(underlay,xfact=fit,yfact=fit,origin=(0,0))
        x0,y0,x1,y1=foot.bounds;cx=(x0+x1)/2
        anchor=foot.intersection(box(cx-1.5,y0-1,cx+1.5,y1+1))
        cy=y1+3.5
        outer=Point(cx,cy).buffer(4,quad_segs=32)
        hole=Point(cx,cy).buffer(2,quad_segs=32)
        neck=box(cx-1.5,anchor.bounds[3]-2,cx+1.5,cy)
        hanger=unary_union([outer,neck]).difference(hole)
        return body,trimesh.boolean.union([body,extrude(hanger,2.4,z=0)],engine='manifold')
    for _ in range(8):
        body,result=with_hanger(fit)
        if result.volume<=NAME_REFERENCE_VOLUME_MM3+.05 and result.extents[0]<=200.0001 and result.extents[1]<=100.0001:break
        fit*=min(np.sqrt(NAME_REFERENCE_VOLUME_MM3/result.volume),NAME_MAX_WIDTH_MM/result.extents[0],(NAME_MAX_HEIGHT_MM-7.5)/body.extents[1])*.999
    mesh=with_hanger(fit*amount)[1] if amount<1 else result
    center=mesh.bounds.mean(axis=0);mesh.apply_translation([-center[0],-center[1],-mesh.bounds[0,2]])
    mesh=export_mesh(mesh)
    if not mesh.is_volume or len(mesh.split())!=1:raise ValueError('No se pudo conectar el nombre y su argolla.')
    return mesh

def write_preview(parts,names,out,xy_scale=1,z_scale=1):
    scene=[]
    for label,mesh in zip(names,parts):
        vertices=mesh.vertices*np.array([xy_scale,xy_scale,z_scale])
        scene.append({'name':label,'vertices':vertices.round(5).tolist(),'faces':mesh.faces.tolist()})
    preview=Path(out).with_suffix('.mesh.json');preview.parent.mkdir(parents=True,exist_ok=True)
    preview.write_text(json.dumps(scene,separators=(',',':')))
    return str(preview)

def generate_name(settings,out):
    name=validate_name(settings.get('name','Lupita'))
    settings=dict(settings,model='name',name=name,printProfile=print_profile()['id'],nameSizing='proportional_volume_hanger_v2',nameHangerInnerDiameterMM=4,nameReferenceVolumeMM3=NAME_REFERENCE_VOLUME_MM3)
    mesh=standalone_name(name,settings.get('nameOnlyAdjust'))
    out=Path(out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
    src,_=template();write_project(src,[mesh],['Nombre - '+name],out,settings)
    return {'model':'name','name':name,'file':str(out),'preview':write_preview([mesh],['Nombre - '+name],out),'connected':True,'sizeMM':mesh.extents.round(2).tolist(),'nominalVolumeMM3':round(float(mesh.volume),2),'message':''}

def matrix(raw):
    if not raw:return np.eye(4)
    a=np.array(list(map(float,raw.split())));t=np.eye(4);t[:3,:3]=a[:9].reshape(3,3).T;t[:3,3]=a[9:];return t

@functools.lru_cache(maxsize=1)
def photo_parts():
    parts=[]
    with zipfile.ZipFile(ASSETS/'esfera_con_foto.3mf') as src:
        root=ET.fromstring(src.read('3D/3dmodel.model'))
        def collect(document,oid,transform):
            obj=document.find(q('resources')).find(q('object')+"[@id='"+str(oid)+"']")
            if obj.find(q('mesh')) is not None:
                mesh=readmesh(document,oid);mesh.apply_transform(transform);parts.append(mesh);return
            for component in obj.find(q('components')):
                path=component.get('{'+PN+'}path');doc=ET.fromstring(src.read(path.lstrip('/'))) if path else document
                collect(doc,component.get('objectid'),transform@matrix(component.get('transform')))
        for item in root.find(q('build')):
            if item.get('printable','1')=='1':collect(root,item.get('objectid'),matrix(item.get('transform')))
    return parts

def generate_photo(settings,out):
    # This is an already prepared project. Preserve its geometry, assembly and
    # print profile byte for byte; only append this editor's mode metadata.
    out=Path(out).resolve();out.parent.mkdir(parents=True,exist_ok=True)
    settings=dict(settings,model='photo')
    with zipfile.ZipFile(ASSETS/'esfera_con_foto.3mf') as src,zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as dst:
        for entry in src.infolist():
            if entry.filename!='Metadata/esferas_editor.json':dst.writestr(entry,src.read(entry.filename))
        dst.writestr('Metadata/esferas_editor.json',json.dumps(settings,ensure_ascii=False))
    parts=photo_parts();names=['Esfera con foto' for _ in parts]
    bounds=np.array([m.bounds for m in parts]);extent=bounds[:,1,:].max(axis=0)-bounds[:,0,:].min(axis=0)
    return {'model':'photo','file':str(out),'preview':write_preview(parts,names,out),'connected':True,'sizeMM':extent.round(2).tolist(),'message':''}

def generate(settings,out):
    mode=settings.get('model','sphere')
    if mode=='sphere':return generate_sphere(settings,out)
    if mode=='name':return generate_name(settings,out)
    if mode=='photo':return generate_photo(settings,out)
    raise ValueError('Modelo desconocido.')

def dispatch(request):
    if request.get('command')=='inspect':
        with zipfile.ZipFile(request['file']) as z:
            if 'Metadata/esferas_editor.json' in z.namelist():return {'settings':json.loads(z.read('Metadata/esferas_editor.json'))}
            with zipfile.ZipFile(ASSETS/'esfera_con_foto.3mf') as original:
                keys=['3D/3dmodel.model','3D/Objects/object_1.model','Metadata/project_settings.config']
                if all(k in z.namelist() and z.read(k)==original.read(k) for k in keys):return {'settings':{'model':'photo'}}
            raise ValueError('Este 3MF no contiene un proyecto compatible con el editor.')
    return generate(request['settings'],request['out'])

if __name__=='__main__':
    if '--server' in sys.argv:
        for line in sys.stdin:
            try:
                request=json.loads(line);result=dispatch(request);result['id']=request.get('id');print(json.dumps(result,ensure_ascii=False),flush=True)
            except Exception as error:print(json.dumps({'id':locals().get('request',{}).get('id'),'error':str(error)},ensure_ascii=False),flush=True)
    else:
        parser=argparse.ArgumentParser();parser.add_argument('--request',required=True);args=parser.parse_args()
        print(json.dumps(dispatch(json.loads(args.request)),ensure_ascii=False))

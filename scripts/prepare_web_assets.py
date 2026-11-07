"""Build the private/customer asset bundle consumed by the static website."""
from pathlib import Path
import importlib.util,json,zipfile,numpy as np
ROOT=Path(__file__).resolve().parents[1]
sp=importlib.util.spec_from_file_location('engine',ROOT/'Sources/Engine/engine.py');engine=importlib.util.module_from_spec(sp);sp.loader.exec_module(engine)
out=ROOT/'web/public/models';out.mkdir(parents=True,exist_ok=True)
src,meshes=engine.template()
def encode(m):return {'vertices':m.vertices.tolist(),'faces':m.faces.tolist()}
parts={}
for key,oid in [('base',1),('bow',2),('left',4),('right',5)]:
 m=meshes[oid].copy();m.apply_scale([engine.PRINT_XY_SCALE,engine.PRINT_XY_SCALE,1.33333333]);m.apply_translation([0,0,2]);parts[key]=encode(m)
photo=[]
import trimesh
components=[c for m in engine.photo_parts() for c in m.split()]
# The prepared frame has a 0.0042 mm gap at the hanging loop. Add a tiny,
# recessed connector before separating front/back for production nesting.
back=min(components,key=lambda c:c.extents[2])
others=[c for c in components if c is not back]
front=max(others,key=lambda c:c.volume);loop=min(others,key=lambda c:c.volume)
bridge=trimesh.creation.box([2,.4,1.4]);bridge.apply_translation([loop.bounds[0,0]+1,front.bounds[0,1],.7])
joined=trimesh.boolean.union([front,loop,bridge],engine='manifold')
assert joined.is_volume and len(joined.split())==1
for comp in [joined,back]:
 center=comp.bounds.mean(axis=0);comp.apply_translation([-center[0],-center[1],-comp.bounds[0,2]]);photo.append(encode(comp))
settings=json.loads(src.read('Metadata/project_settings.config'));settings.update(engine.print_profile()['settings']);settings.update({'enable_support':'0','brim_type':'no_brim','enable_prime_tower':'0','print_sequence':'by layer','draft_shield':'disabled'})
# 3MF batch profile uses the agreed PLA HS preset, irrespective of the source profile.
assets={'version':1,'sphere':parts,'photo':photo,'settings':settings,'profile':engine.print_profile(),'sourceAttribution':{'sphere':'AVLR 3D STUDIO / MakerWorld BY-NC-ND','photo':'Craftastic / MakerWorld Exclusive License','font':'Cream Cake Bold / Ef Studio / Personal Use Only'}}
(out/'models.json').write_text(json.dumps(assets,separators=(',',':')))
import shutil
shutil.copy(ROOT/'Resources/Cream Cake Bold.otf',out/'CreamCakeBold.otf');shutil.copy(ROOT/'Resources/License - READ THIS.txt',out/'FONT-LICENSE.txt')
print('Models ready:',len(photo),'photo components', (out/'models.json').stat().st_size)

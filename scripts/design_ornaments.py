"""Build shared original 2D ornament geometry from smooth parametric contours."""
from pathlib import Path
import json, math
from shapely.geometry import Point, Polygon
from shapely.affinity import scale, rotate, translate
from shapely.ops import unary_union
ROOT=Path(__file__).resolve().parents[1]
def ellipse(x,y,rx,ry,angle=0):return translate(rotate(scale(Point(0,0).buffer(1,quad_segs=64),rx,ry),angle,origin=(0,0)),x,y)
def curve(start,segments):
 points=[start];p=start
 for a,b,c in segments:
  for i in range(1,33):
   t=i/32;v=1-t;points.append((v**3*p[0]+3*v*v*t*a[0]+3*v*t*t*b[0]+t**3*c[0],v**3*p[1]+3*v*v*t*a[1]+3*v*t*t*b[1]+t**3*c[1]))
  p=c
 return Polygon(points).buffer(0)
def encode(shape):
 ps=[shape] if shape.geom_type=='Polygon' else list(shape.geoms)
 return [[[round(x,5),round(y,5)] for x,y in ring.coords[:-1]] for p in ps for ring in [p.exterior,*p.interiors]]
pad=curve((-37,-12),[
 ((-38,-28),(-31,-43),(-17,-43)),((-8,-43),(-4,-39),(0,-39)),((4,-39),(8,-43),(17,-43)),
 ((31,-43),(38,-28),(37,-12)),((35,4),(25,13),(14,11)),((8,21),(-8,21),(-14,11)),((-25,13),(-35,4),(-37,-12))])
toes=[(-33,9,14.5,23,20),(-14,36,16,23,-13),(14,36,16,23,13),(33,9,14.5,23,-20)]
outer=unary_union([pad,*[ellipse(*t) for t in toes],Point(0,53).buffer(5,quad_segs=48)])
pad_hole=pad.buffer(-4.8)
toe_holes=[ellipse(x,y,rx-6,ry-6,a).difference(pad_hole.buffer(4.2)) for x,y,rx,ry,a in toes]
holes=[pad_hole,*toe_holes,Point(0,53).buffer(2.2,quad_segs=48)]
paw=Polygon(outer.exterior).difference(unary_union(holes))
head_outer=Point(0,0).buffer(40,quad_segs=90)
outer_mouse=unary_union([head_outer,*[Point(x,36).buffer(24,quad_segs=64) for x in [-38,38]]])
ear_holes=[Point(x,36).buffer(20.5,quad_segs=64).difference(head_outer.buffer(.5)) for x in [-38,38]]
mouse=outer_mouse.difference(unary_union([Point(0,0).buffer(35,quad_segs=90),*ear_holes]))
loop=Point(0,43).buffer(5,quad_segs=48).difference(Point(0,43).buffer(2.2,quad_segs=48))
no_bow=unary_union([mouse,loop])
left=curve((0,52),[((-10,64),(-25,76),(-33,67)),((-39,58),(-30,52),(-35,43)),((-32,31),(-13,37),(0,49)),((2,49),(2,52),(0,52))])
right=scale(left,xfact=-1,yfact=1,origin=(0,0))
bow=unary_union([left,right,ellipse(0,51.5,7,7)])
dots=[(-28,63),(-17,57),(-27,46),(-14,43),(28,63),(17,57),(27,46),(14,43),(0,53)]
bow=bow.difference(unary_union([Point(x,y).buffer(2.2 if x==0 else 2.3,quad_segs=32) for x,y in dots]))
for label,shape in [('paw',paw),('mouse',mouse),('bow',bow)]:
 assert shape.is_valid and shape.geom_type=='Polygon',(label,shape.geom_type)
print('Frame areas mm²:',round(paw.area),round(mouse.area),'bow',round(bow.area))
data={'paw':{'label':'Patita con nombre','frame':encode(paw),'center':[0,-22],'maxWidth':70,'maxHeight':29},'mouse':{'label':'Ratoncito con moño','frame':encode(mouse),'bow':encode(bow),'noBowFrame':encode(no_bow),'center':[0,0],'maxWidth':70,'maxHeight':29}}
(ROOT/'Resources/ornament_designs.json').write_text(json.dumps(data,separators=(',',':')))
p=ROOT/'web/public/models/models.json';assets=json.loads(p.read_text());assets['custom']=data;p.write_text(json.dumps(assets,separators=(',',':')))

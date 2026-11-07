import importlib.util,json,tempfile,unittest,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('engine',ROOT/'Sources/Engine/engine.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
class ModelTests(unittest.TestCase):
    def test_name_fits_limits_and_connects_dots_and_accents(self):
        for name in ['I','Ana','Lupita','Guadalupe','María José','Íñigo','Maximiliano Alejandro']:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as folder:
                r=engine.generate({'model':'name','name':name},Path(folder)/'name.3mf');size=r['sizeMM']
                self.assertLessEqual(size[0],200.001);self.assertLessEqual(size[1],100.001)
                self.assertLessEqual(r['nominalVolumeMM3'],engine.NAME_REFERENCE_VOLUME_MM3+.2)
                with zipfile.ZipFile(r['file']) as z:
                    root=ET.fromstring(z.read('3D/Objects/esfera_agrupada.model'));m=engine.readmesh(root,1)
                    self.assertTrue(m.is_volume);self.assertEqual(len(m.split()),1)
                    self.assertAlmostEqual(m.bounds[0,2],0,places=6)
                    model=ET.fromstring(z.read('3D/3dmodel.model'));self.assertTrue(model.find(engine.q('build')).find(engine.q('item')).get('transform').startswith('1 0 0'))
                    s=json.loads(z.read('Metadata/project_settings.config'));self.assertEqual(s['enable_support'],'0');self.assertEqual(s['sparse_infill_density'],'8%')
    def test_proportional_sizing_uses_common_volume_without_stretching(self):
        import numpy as np
        for name in ['MIA','Mía','Lupita','Guadalupe','Maximiliano Alejandro']:
            with self.subTest(name=name):
                mesh=engine.standalone_name(name)
                shape=engine.font_outline(name);x0,y0,x1,y1=shape.bounds
                section=mesh.section(plane_origin=[0,0,2],plane_normal=[0,0,1])
                points=np.concatenate(section.discrete)
                actual=np.ptp(points[:,:2],axis=0)
                self.assertAlmostEqual(actual[0]/actual[1],(x1-x0)/(y1-y0),delta=.001)
                self.assertLessEqual(mesh.volume,engine.NAME_REFERENCE_VOLUME_MM3+.2)
                if mesh.extents[0]<199.99 and mesh.extents[1]<99.99:
                    self.assertAlmostEqual(mesh.volume,engine.NAME_REFERENCE_VOLUME_MM3,delta=.2)
        medium=engine.standalone_name('Lupita')
        self.assertGreater(medium.extents[0],140);self.assertLess(medium.extents[0],165)
        self.assertLess(medium.extents[1],80)
    def test_open_original_photo(self):
        self.assertEqual(engine.dispatch({'command':'inspect','file':str(ROOT/'Resources/esfera_con_foto.3mf')})['settings']['model'],'photo')
    def test_name_smaller_size(self):
        full=engine.standalone_name('Lupita');mesh=engine.standalone_name('Lupita',{'scale':50});self.assertAlmostEqual(mesh.extents[0],full.extents[0]/2,delta=.002);self.assertAlmostEqual(mesh.volume,full.volume/4,delta=.2)
        with self.assertRaises(ValueError):engine.standalone_name('Lupita',{'scale':101})
    def test_photo_preserves_original_geometry_settings_and_scale(self):
        with tempfile.TemporaryDirectory() as folder:
            r=engine.generate({'model':'photo'},Path(folder)/'photo.3mf')
            with zipfile.ZipFile(ROOT/'Resources/esfera_con_foto.3mf') as original,zipfile.ZipFile(r['file']) as output:
                for n in original.namelist():self.assertEqual(original.read(n),output.read(n),n)
                self.assertEqual(json.loads(output.read('Metadata/esferas_editor.json'))['model'],'photo')
            self.assertTrue(engine.photo_parts());self.assertTrue(Path(r['preview']).exists())
    def test_model_roundtrip_and_old_sphere(self):
        with tempfile.TemporaryDirectory() as folder:
            for mode in ['sphere','photo','name']:
                out=Path(folder)/(mode+'.3mf');engine.generate({'model':mode,'name':'Lupita'},out)
                self.assertEqual(engine.dispatch({'command':'inspect','file':str(out)})['settings']['model'],mode)
            out=Path(folder)/'legacy.3mf';self.assertEqual(engine.generate({'name':'Lupita'},out)['model'],'sphere')
if __name__=='__main__':unittest.main()

"""Geometry and editable-project regressions. Run with unittest discovery."""
import importlib.util,json,tempfile,unittest,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('engine',ROOT/'Sources/Engine/engine.py');engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
class EngineTests(unittest.TestCase):
    def test_names_and_manual_adjustments_remain_connected(self):
        for name,adjust in [('Lupita',{}),('Ana',{'scale':85,'x':2.4,'y':-1.2}),('María José',{}),('Maximiliano',{'scale':110}),('Íñigo',{'y':8}),('I',{'scale':75})]:
            with self.subTest(name=name),tempfile.TemporaryDirectory() as folder:
                out=Path(folder)/'sphere.3mf';settings={'name':name,'nameAdjust':adjust,'bow':True,'left':True,'right':False}
                result=engine.generate(settings,out);self.assertTrue(result['connected']);self.assertTrue(out.exists())
                with zipfile.ZipFile(out) as z:
                    saved=json.loads(z.read('Metadata/esferas_editor.json'));self.assertEqual(saved['nameAdjust'],adjust)
                    self.assertEqual(saved['innerDiameterMM'],70.0)
                    self.assert_inner_diameter(z)
                    self.assert_print_profile(z)
                    conf=ET.fromstring(z.read('Metadata/model_settings.config'));self.assertEqual(len(conf.findall('object')),1);self.assertEqual(len(conf.findall('object/part')),4)
    def assert_print_profile(self,z):
        settings=json.loads(z.read('Metadata/project_settings.config'))
        expected=json.loads((ROOT/'Resources/perfil_impresion.json').read_text())
        for key,value in expected['settings'].items():self.assertEqual(settings[key],value,key)
        self.assertEqual(settings['filament_settings_id'],['Generic PLA High Speed @BBL A1'])
        self.assertEqual(json.loads(z.read('Metadata/esferas_editor.json'))['printProfile'],expected['id'])
        root=ET.fromstring(z.read('3D/Objects/esfera_agrupada.model'))
        for obj in root.find(engine.q('resources')):
            self.assertTrue(engine.readmesh(root,obj.get('id')).is_volume)
    def assert_inner_diameter(self,z):
        import numpy as np
        root=ET.fromstring(z.read('3D/Objects/esfera_agrupada.model'))
        base=engine.readmesh(root,1)
        model=ET.fromstring(z.read('3D/3dmodel.model'))
        transform=list(map(float,model.find(engine.q('build')).find(engine.q('item')).get('transform').split()))
        self.assertAlmostEqual(transform[0],transform[4],places=9)
        base.apply_scale([transform[0],transform[4],transform[8]])
        section=base.section(plane_origin=[0,0,0],plane_normal=[0,0,1])
        center=np.array(engine.CENTER)*transform[0]
        circles=[p[:,:2] for p in section.discrete if 65 < np.ptp(p[:,0]) < 75 and 65 < np.ptp(p[:,1]) < 75]
        self.assertEqual(len(circles),1)
        points=circles[0]
        self.assertAlmostEqual(float(np.ptp(points[:,0])),70,delta=.002)
        self.assertAlmostEqual(float(np.ptp(points[:,1])),70,delta=.002)
        self.assertLess(float(np.max(np.abs(np.linalg.norm(points-center,axis=1)-35))),.002)
    def test_detached_bow_is_previewed_but_cannot_be_exported(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'invalid.3mf';r=engine.generate({'name':'Lupita','bowAdjust':{'scale':25,'x':20,'y':20}},out)
            self.assertFalse(r['connected']);self.assertIsNone(r['file']);self.assertFalse(out.exists());self.assertTrue(Path(r['preview']).exists())
    def test_optional_elements_are_independent(self):
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'minimal.3mf';r=engine.generate({'name':'Lupita','bow':False,'left':False,'right':True},out)
            self.assertTrue(r['connected']);settings=engine.dispatch({'command':'inspect','file':str(out)})['settings'];self.assertFalse(settings['bow']);self.assertTrue(settings['right'])
    def test_invalid_input_is_reported(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ['', 'A'*41, '🎄']:
                with self.subTest(name=name),self.assertRaises(ValueError):engine.generate({'name':name},Path(folder)/'test.3mf')
if __name__=='__main__':unittest.main()

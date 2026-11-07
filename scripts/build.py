#!/usr/bin/env python3
"""Build the standalone engine, native app and drag-to-Applications DMG. Does not install it."""
from pathlib import Path
import subprocess, shutil, sys, plistlib
ROOT=Path(__file__).resolve().parents[1]
BUILD=ROOT/'build';DIST=ROOT/'dist';VERSION='2.4.0'
def run(*args):subprocess.run([str(x) for x in args],cwd=ROOT,check=True)
def main():
    BUILD.mkdir(exist_ok=True);DIST.mkdir(exist_ok=True)
    run(sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onedir','--name','SphereEngine','--distpath',BUILD/'engine','--workpath',BUILD/'pyinstaller','--specpath',BUILD,'--add-data',str(ROOT/'Resources')+':assets','--collect-all','trimesh','--hidden-import','scipy.spatial','--hidden-import','scipy.sparse.csgraph','--hidden-import','scipy.special','--hidden-import','scipy.ndimage','--collect-all','manifold3d','--collect-all','uharfbuzz',ROOT/'Sources/Engine/engine.py')
    assemble()
def assemble():
    payload=BUILD/'bundles.noindex/payload';app=payload/'Applications/Esferas.app'
    if payload.exists():shutil.rmtree(payload)
    mac=app/'Contents/MacOS';resources=app/'Contents/Resources';mac.mkdir(parents=True);resources.mkdir()
    shutil.copytree(BUILD/'engine/SphereEngine',resources/'Engine',symlinks=True)
    run('swiftc','-O','-target','arm64-apple-macosx14.0',ROOT/'Sources/App/App.swift','-o',mac/'Esferas','-framework','AppKit','-framework','SceneKit','-framework','UniformTypeIdentifiers')
    run('swift',ROOT/'scripts/icon.swift',ROOT)
    run('iconutil','-c','icns',BUILD/'Esferas.iconset','-o',resources/'Esferas.icns')
    info={'CFBundleExecutable':'Esferas','CFBundleIdentifier':'local.neura.esferas','CFBundleName':'Esferas','CFBundleDisplayName':'Esferas','CFBundleVersion':VERSION,'CFBundleShortVersionString':VERSION,'CFBundlePackageType':'APPL','CFBundleIconFile':'Esferas.icns','LSMinimumSystemVersion':'14.0','NSHighResolutionCapable':True,'NSHumanReadableCopyright':'Fuente Cream Cake Bold © Ef Studio. Uso personal.'}
    (app/'Contents/Info.plist').write_bytes(plistlib.dumps(info))
    shutil.copy(ROOT/'Resources/License - READ THIS.txt',resources/'Licencia de la fuente.txt')
    run('codesign','--force','--sign','-',app)
    run('codesign','--verify','--deep','--strict',app)
    stage=BUILD/'bundles.noindex/dmg-content'
    if stage.exists():shutil.rmtree(stage)
    stage.mkdir()
    shutil.copytree(app,stage/'Esferas.app',symlinks=True)
    (stage/'Aplicaciones').symlink_to('/Applications',target_is_directory=True)
    dmg=DIST/f'Esferas-{VERSION}-arm64.dmg'
    if dmg.exists():dmg.unlink()
    run('hdiutil','create','-volname','Esferas','-srcfolder',stage,'-format','UDZO','-ov',dmg)
    run('hdiutil','verify',dmg)
    print(dmg)
if __name__=='__main__':
    if '--assemble-only' in sys.argv:assemble()
    else:main()

"""Create a portable static preview and source package; never publishes remotely."""
from pathlib import Path
import zipfile,json,shutil
ROOT=Path(__file__).resolve().parents[1];WEB=ROOT/'web';DIST=ROOT/'dist'
DIST.mkdir(exist_ok=True)
def makezip(path,root,excluded=()):
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
  for file in sorted(root.rglob('*')):
   relative=file.relative_to(root)
   if not file.is_file() or any(part in excluded for part in relative.parts):continue
   z.write(file,str(Path('taller-navideno-web')/relative))
makezip(DIST/'Taller_Navideno_Web_Codigo.zip',WEB,{'node_modules','dist','.DS_Store'})
static=ROOT/'build/web-delivery';static.mkdir(parents=True,exist_ok=True)
if (static/'sitio').exists():shutil.rmtree(static/'sitio')
shutil.copytree(WEB/'dist',static/'sitio')
(static/'LEEME.txt').write_text('TALLER DE NAVIDAD · WEB ESTÁTICA\n\nLa carpeta sitio contiene la página compilada para alojamiento estático.\nPara probarla localmente: python3 -m http.server 8080 --directory sitio\nDespués abre http://localhost:8080\n\nNo abrir index.html con doble clic: WebAssembly y los workers requieren HTTP/HTTPS.\nEl ZIP de código contiene el proyecto Vite, instrucciones completas y el workflow de GitHub Pages.\nLos recursos precargados conservan sus licencias propias. Antes de publicarlos, confirma sus derechos de redistribución.\n')
makezip(DIST/'Taller_Navideno_Web_Listo.zip',static)
print(DIST/'Taller_Navideno_Web_Codigo.zip');print(DIST/'Taller_Navideno_Web_Listo.zip')

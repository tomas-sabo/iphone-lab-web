#!/usr/bin/env python3
"""Create an immutable public application bundle locally; no Actions or credentials needed."""
import base64,hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
FILES=['index.html','style.css','app.js','bridge.js','remote.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png']
def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
def build(version):
 if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)',version):raise ValueError('Use a semantic release version')
 app=(ROOT/'dist/app.js').read_text();html=(ROOT/'dist/index.html').read_text()
 if "const VERSION='"+version+"';" not in app or 'Verzia '+version+'<' not in html:raise ValueError('Update app.js and index.html version first')
 # Unique asset URLs prevent WebKit from reusing scripts from an older release.
 asset_names='|'.join(re.escape(name) for name in FILES if name!='index.html')
 html=re.sub(r'((?:src|href)=["\']\./(?:'+asset_names+r'))(?:\?[^"\']*)?(["\'])',lambda m:m[1]+'?app_release='+version+m[2],html)
 (ROOT/'dist/index.html').write_text(html)
 files=[]
 for name in FILES:
  data=(ROOT/'dist'/name).read_bytes();files.append({'path':name,'sha256':hashlib.sha256(data).hexdigest(),'content':base64.b64encode(data).decode()})
 bundle=encode({'protocol':1,'version':version,'files':files});path=ROOT/'releases'/(version+'.json');path.parent.mkdir(exist_ok=True)
 if path.exists() and path.read_bytes()!=bundle:raise ValueError('Release already exists with different content; choose a new version')
 if len(bundle)>2*1024*1024:raise ValueError('Bundle too large')
 path.write_bytes(bundle);(ROOT/'release.json').write_bytes(encode({'protocol':1,'version':version,'bundle':'releases/'+version+'.json','sha256':hashlib.sha256(bundle).hexdigest()}))
 return {'version':version,'files':len(files),'bytes':len(bundle)}
if __name__=='__main__':print(json.dumps(build(sys.argv[1])))

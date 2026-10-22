import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('release',Path(__file__).resolve().parents[1]/'scripts/release.py');release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
class Release(unittest.TestCase):
 def test_each_release_uses_distinct_asset_urls_and_cannot_be_overwritten(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);(root/'dist').mkdir()
   for name in release.FILES:(root/'dist'/name).write_bytes(b'fixture')
   html='<p>Verzia 2.0.0</p><script src="./app.js"></script><script src="./bridge.js?old=1"></script><link href="./style.css">'
   (root/'dist/index.html').write_text(html);(root/'dist/app.js').write_text("const VERSION='2.0.0';")
   with patch.object(release,'ROOT',root):
    release.build('2.0.0');first=(root/'dist/index.html').read_text();self.assertEqual(first.count('?app_release=2.0.0'),3);self.assertNotIn('old=1',first)
    (root/'dist/index.html').write_text(first.replace('Verzia 2.0.0','Verzia 2.0.1'));(root/'dist/app.js').write_text("const VERSION='2.0.1';");release.build('2.0.1');second=(root/'dist/index.html').read_text();self.assertEqual(second.count('?app_release=2.0.1'),3);self.assertNotIn('?app_release=2.0.0',second)
    (root/'dist/style.css').write_text('changed')
    with self.assertRaises(ValueError):release.build('2.0.1')
if __name__=='__main__':unittest.main()

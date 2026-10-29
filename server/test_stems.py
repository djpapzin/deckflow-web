import hashlib
import http.client
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest

spec = importlib.util.spec_from_file_location('stems', Path(__file__).with_name('stems.py'))
s = importlib.util.module_from_spec(spec); spec.loader.exec_module(s)

class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.old = s.DATA; s.DATA = Path(self.temp.name)
        self.server = s.ThreadingHTTPServer(('127.0.0.1',0),s.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join(); s.DATA = self.old; self.temp.cleanup()
    def call(self,method,path,body=None,origin='http://127.0.0.1:8787',host='127.0.0.1:8787'):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port)
        headers={'Host':host}
        if origin: headers['Origin']=origin
        conn.request(method,path,body,headers); response=conn.getresponse(); result=(response.status,response.read(),dict(response.getheaders()));conn.close();return result
    def test_rejects_foreign_missing_origins_and_rebinding(self):
        for origin in ['https://evil.example',None]:
            self.assertEqual(self.call('POST','/api/stems',b'a',origin)[0],403)
            self.assertEqual(self.call('GET','/api/health',origin=origin)[0],403)
        self.assertEqual(self.call('GET','/api/health',host='evil.example')[0],403)
        self.assertEqual(self.call('GET','/api/stems/../../etc/passwd')[0],404)
    def test_cached_track_reuses_stems_and_requires_valid_id(self):
        data=b'test audio';key=hashlib.sha256(s.MODEL.encode()+data).hexdigest();folder=s.DATA/key;folder.mkdir()
        (folder/'complete.json').write_text('{}');(folder/'vocals.wav').write_bytes(b'RIFF-test')
        code,body,_=self.call('POST','/api/stems',data);self.assertEqual(code,202);self.assertEqual(json.loads(body)['id'],key)
        self.assertEqual(json.loads(self.call('GET','/api/stems/'+key)[1])['status'],'ready')
        self.assertEqual(self.call('GET','/api/stems/'+key+'/vocals.wav')[1],b'RIFF-test')
        self.assertEqual(self.call('POST','/api/stems',b'')[0],413)
        self.assertEqual(self.call('GET','/api/stems/not-an-id')[0],404)
    def test_public_app_cors_and_health(self):
        code,body,headers=self.call('GET','/api/health',origin='https://djpapzin.github.io')
        self.assertEqual(code,200);self.assertIn('ready',json.loads(body))
        self.assertEqual(headers['Access-Control-Allow-Origin'],'https://djpapzin.github.io')

if __name__ == '__main__': unittest.main()

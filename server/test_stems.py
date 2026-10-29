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
        data=b'test audio';key=hashlib.sha256(s.CACHE_VERSION.encode()+data).hexdigest();folder=s.DATA/key;folder.mkdir()
        (folder/'complete.json').write_text('{}');(folder/'vocals.wav').write_bytes(b'RIFF-test')
        code,body,_=self.call('POST','/api/stems',data);self.assertEqual(code,202);self.assertEqual(json.loads(body)['id'],key)
        self.assertEqual(json.loads(self.call('GET','/api/stems/'+key)[1])['status'],'ready')
        self.assertEqual(self.call('GET','/api/stems/'+key+'/vocals.wav')[1],b'RIFF-test')
        self.assertEqual(self.call('POST','/api/stems',b'')[0],413)
        self.assertEqual(self.call('GET','/api/stems/not-an-id')[0],404)
    def test_quality_has_separate_cache_and_rejects_unknown_values(self):
        data=b'quality test'
        for quality, suffix in [('best',''),('fast',':fast')]:
            key=hashlib.sha256((s.CACHE_VERSION+suffix).encode()+data).hexdigest()
            folder=s.DATA/key;folder.mkdir();(folder/'complete.json').write_text('{}')
            code,body,_=self.call('POST','/api/stems?quality='+quality,data)
            self.assertEqual(code,202);self.assertEqual(json.loads(body)['id'],key)
        self.assertEqual(self.call('POST','/api/stems?quality=wrong',data)[0],400)

    def test_connection_window_is_local_and_not_frameable(self):
        code,body,headers=self.call('GET','/connect')
        self.assertEqual(code,200)
        self.assertEqual(headers['Content-Security-Policy'],'frame-ancestors https://dev.deckflow.djpapzin.com')
        self.assertEqual(headers['Referrer-Policy'],'same-origin')
        self.assertIn(b"event.source!==peer",body)
        self.assertIn(b"https://dev.deckflow.djpapzin.com",body)
        self.assertEqual(self.call('GET','/connect',host='evil.example')[0],403)

    def test_public_app_cors_and_health(self):
        code,body,headers=self.call('GET','/api/health',origin='https://djpapzin.github.io')
        self.assertEqual(code,200);self.assertIn('ready',json.loads(body))
        self.assertEqual(headers['Access-Control-Allow-Origin'],'https://djpapzin.github.io')
        code,_,headers=self.call('GET','/api/health',origin='https://deckflow.djpapzin.com')
        self.assertEqual(code,200)
        self.assertEqual(headers['Access-Control-Allow-Origin'],'https://deckflow.djpapzin.com')
        self.assertEqual(self.call('GET','/api/health',origin='https://dev.deckflow.djpapzin.com')[0],200)
        self.assertEqual(self.call('GET','/api/health',origin='https://fake.dev.deckflow.djpapzin.com')[0],403)

if __name__ == '__main__': unittest.main()

class WorkerTests(unittest.TestCase):
    def test_two_jobs_reuse_worker_and_keep_quality_setting(self):
        from unittest.mock import MagicMock, patch
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            worker = MagicMock(); worker.poll.return_value = None
            worker.stdout.readline.return_value = '{"ok":true,"seconds":1}'
            with patch.object(s, 'DATA', folder), patch.object(s, 'WORKER', None), patch.object(s, 'WORKER_LOG', None), patch.object(s.subprocess, 'Popen', return_value=worker) as spawn, patch.object(s.select, 'select', return_value=([worker.stdout],[],[])):
                s.separate_track(folder); s.separate_track(folder)
                self.assertEqual(spawn.call_count, 1)
                self.assertEqual(worker.stdin.write.call_count, 2)
                for call in worker.stdin.write.call_args_list:
                    self.assertEqual(json.loads(call.args[0])['shifts'],2)
                s.WORKER_LOG.close()

    def test_worker_failure_is_retired_for_retry(self):
        from unittest.mock import MagicMock, patch
        with tempfile.TemporaryDirectory() as directory:
            worker=MagicMock(); worker.poll.return_value=None
            worker.stdout.readline.return_value='{"ok":false,"error":"bad audio"}'
            with patch.object(s,'WORKER',worker), patch.object(s.select,'select',return_value=([worker.stdout],[],[])):
                with self.assertRaisesRegex(RuntimeError,'bad audio'):
                    s.separate_track(Path(directory))
                worker.kill.assert_called_once();worker.wait.assert_called_once()
                self.assertIsNone(s.WORKER)

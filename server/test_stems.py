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
        code,body,_=self.call('POST','/api/stems',data);self.assertEqual(code,202);self.assertEqual(json.loads(body)['id'],key);self.assertTrue(json.loads(body)['cached'])
        (folder/'processing.json').write_text(json.dumps({'seconds':42.5}))
        self.assertEqual(json.loads(self.call('GET','/api/stems/'+key)[1])['processing']['seconds'],42.5)
        self.assertEqual(json.loads(self.call('GET','/api/stems/'+key)[1])['status'],'ready')
        self.assertEqual(self.call('GET','/api/stems/'+key+'/vocals.wav')[1],b'RIFF-test')
        self.assertEqual(self.call('POST','/api/stems',b'')[0],413)
        self.assertEqual(self.call('GET','/api/stems/not-an-id')[0],404)
    def test_youtube_cache_normalizes_links_and_exposes_timings(self):
        from unittest.mock import patch
        def download(url, *args, details=None):
            details.update(availability='public',age_limit=0,duration=120)
            return 'song.mp3',b'mp3-audio'
        with patch.object(s,'import_audio',side_effect=download) as fetch:
            for url,expected in [('https://youtu.be/9B3vAyeF6lU?si=test','miss'),('https://www.youtube.com/watch?v=9B3vAyeF6lU','hit')]:
                code,body,headers=self.call('POST','/api/import/youtube',json.dumps({'url':url}))
                self.assertEqual(code,200);self.assertEqual(body,b'mp3-audio')
                self.assertEqual(headers['X-Import-Cache'],expected)
                self.assertGreaterEqual(float(headers['X-Import-Seconds']),0)
                self.assertIn('X-Import-Seconds',headers['Access-Control-Expose-Headers'])
            self.assertEqual(fetch.call_count,1)

    def test_quality_has_separate_cache_and_rejects_unknown_values(self):
        data=b'quality test'
        for quality, suffix in [('best',''),('fast',':fast')]:
            key=hashlib.sha256((s.CACHE_VERSION+suffix).encode()+data).hexdigest()
            folder=s.DATA/key;folder.mkdir();(folder/'complete.json').write_text('{}')
            code,body,_=self.call('POST','/api/stems?quality='+quality,data)
            self.assertEqual(code,202);self.assertEqual(json.loads(body)['id'],key)
        self.assertEqual(self.call('POST','/api/stems?quality=wrong',data)[0],400)

    def test_mac_connected_views_keep_production_and_dev_assets_separate(self):
        from unittest.mock import patch, MagicMock
        remote=MagicMock();remote.__enter__.return_value=remote
        remote.read.return_value=b'<html>preview</html>'
        remote.headers={'Content-Type':'text/html'}
        with patch.object(s,'urlopen',return_value=remote) as fetch:
            for prefix,host in [('/dev','https://dev.deckflow.djpapzin.com/'),('/live','https://deckflow.djpapzin.com/')]:
                code,body,headers=self.call('GET',prefix+'/')
                self.assertEqual(code,200);self.assertIn(b'preview',body)
                self.assertEqual(fetch.call_args.args[0].full_url,host)
                self.assertEqual(headers['Cache-Control'],'no-store')
                self.call('GET',prefix+'/assets/index-123.js')
                self.assertEqual(fetch.call_args.args[0].full_url,host+'assets/index-123.js')
                fetch.reset_mock()
                for tail in ['../secret','https://evil.example','%2e%2e/secret']:
                    self.assertEqual(self.call('GET',prefix+'/'+tail)[0],404)
                fetch.assert_not_called()
                code,_,headers=self.call('GET',prefix)
                self.assertEqual(code,302);self.assertEqual(headers['Location'],prefix+'/')
                self.assertEqual(self.call('GET',prefix+'/',host='evil.example')[0],403)

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

class YoutubeTests(ApiTests):
    def test_url_validation(self):
        from youtube_import import video_url
        for url in ['https://youtu.be/BaW_jenozKc', 'https://www.youtube.com/watch?v=BaW_jenozKc&list=abc', 'https://youtube.com/shorts/BaW_jenozKc']:
            self.assertEqual(video_url(url), 'https://www.youtube.com/watch?v=BaW_jenozKc')
        for url in ['https://evil.example/watch?v=BaW_jenozKc', 'http://youtu.be/BaW_jenozKc', 'https://youtube.com/playlist?list=abc', 'https://youtube.com@127.0.0.1/watch?v=BaW_jenozKc', None]:
            with self.assertRaises(ValueError): video_url(url)
    def test_import_returns_mp3_and_rejects_foreign_origin(self):
        from unittest.mock import patch
        with patch.object(s, 'import_audio', return_value=('Test track.mp3', b'MP3-test')) as importer:
            code, audio, headers = self.call('POST','/api/import/youtube',json.dumps({'url':'https://youtu.be/BaW_jenozKc'}))
            self.assertEqual(code,200); self.assertEqual(audio,b'MP3-test')
            self.assertEqual(json.loads(headers['X-Track-Name']), 'Test track.mp3')
            self.assertEqual(headers['Cache-Control'],'no-store')
            self.assertEqual(self.call('POST','/api/import/youtube',b'{}',origin='https://evil.example')[0],403)
            self.assertEqual(importer.call_count,1)
    def test_import_busy_and_invalid_payload(self):
        self.assertEqual(self.call('POST','/api/import/youtube',b'[]')[0],400)
        s.IMPORT_LOCK.acquire()
        try: self.assertEqual(self.call('POST','/api/import/youtube',b'{}')[0],429)
        finally: s.IMPORT_LOCK.release()

class TransferTests(unittest.TestCase):
    def test_partial_sends_and_buffer_pressure_preserve_exact_audio_bytes(self):
        import errno
        import io
        from unittest.mock import patch
        class Socket:
            def __init__(self): self.output=bytearray(); self.calls=0
            def send(self, data):
                self.calls+=1
                if self.calls in (1,4): raise OSError(errno.ENOBUFS, 'No buffer space')
                count=min(len(data), 17000)
                self.output.extend(data[:count]); return count
        audio=b'abcd'*40000; connection=Socket()
        with patch.object(s.time,'sleep'):
            s.stream_audio(io.BytesIO(audio),connection)
        self.assertEqual(bytes(connection.output),audio)
    def test_disconnected_client_is_not_retried(self):
        import io
        from unittest.mock import Mock
        connection=Mock();connection.send.side_effect=BrokenPipeError()
        with self.assertRaises(BrokenPipeError): s.stream_audio(io.BytesIO(b'audio'),connection)
        self.assertEqual(connection.send.call_count,1)

class CloudAdmissionTests(unittest.TestCase):
    def test_overlapping_uploads_obey_queue_cap_and_cached_jobs_still_load(self):
        from unittest.mock import patch, Mock
        import time
        api=ApiTests(); api.setUp()
        try:
            with patch.object(s,'CLOUD',True), patch.object(s,'JOBS',{}), patch.object(s,'POOL') as pool, patch.object(s,'LIMITS') as limits, patch.object(s.subprocess,'run',return_value=Mock(stdout='45')):
                limits.allow.return_value=True
                connections=[]
                for n in range(3):
                    conn=http.client.HTTPConnection('127.0.0.1',api.server.server_port)
                    body=('audio'+str(n)).encode()
                    conn.putrequest('POST','/api/stems?quality=fast',skip_host=True)
                    conn.putheader('Host','127.0.0.1:8787');conn.putheader('Origin','https://deckflow.djpapzin.com')
                    conn.putheader('Content-Length',str(len(body)));conn.endheaders()
                    connections.append((conn,body))
                # All request handlers wait on their withheld bodies before admission.
                time.sleep(.1)
                for conn,body in connections: conn.send(body)
                codes=[]
                for conn,_ in connections:
                    response=conn.getresponse();codes.append(response.status);response.read();conn.close()
                self.assertEqual(sorted(codes),[202,202,429])
                self.assertEqual(len(s.JOBS),2);self.assertEqual(pool.submit.call_count,2)
                cached=b'cached';key=hashlib.sha256((s.CACHE_VERSION+':fast').encode()+cached).hexdigest()
                folder=s.DATA/key;folder.mkdir();(folder/'complete.json').write_text('{}')
                self.assertEqual(api.call('POST','/api/stems?quality=fast',cached)[0],202)
        finally: api.tearDown()

    def test_cloud_admission_uses_duration_and_removes_probe_on_rejection(self):
        from unittest.mock import patch, Mock
        from cloud_limits import CloudLimits, stem_storage_budget
        api=ApiTests();api.setUp()
        try:
            limits=CloudLimits(s.DATA,min_free=0)
            with patch.object(s,'CLOUD',True), patch.object(s,'JOBS',{}), patch.object(s,'RESERVATIONS',{}), patch.object(s,'POOL') as pool, patch.object(s,'LIMITS',limits), patch.object(s.subprocess,'run',return_value=Mock(stdout='204')):
                data=b'valid audio'
                code,body,_=api.call('POST','/api/stems?quality=fast',data)
                self.assertEqual(code,202)
                key=json.loads(body)['id']
                self.assertEqual(s.RESERVATIONS[key],stem_storage_budget(204,len(data)))
                self.assertEqual((s.DATA/key/'input.audio').read_bytes(),data)
                self.assertEqual(list(s.DATA.glob('upload-*')),[])
                pool.submit.assert_called_once()
            for duration,expected in [('nan',400),('601',400),('204',507)]:
                limits=CloudLimits(s.DATA,max_bytes=100,min_free=0)
                with patch.object(s,'CLOUD',True), patch.object(s,'JOBS',{}), patch.object(s,'POOL') as pool, patch.object(s,'LIMITS',limits), patch.object(s.subprocess,'run',return_value=Mock(stdout=duration)):
                    code,_,_=api.call('POST','/api/stems?quality=fast',b'reject')
                    self.assertEqual(code,expected)
                    self.assertEqual(list(s.DATA.glob('upload-*')),[])
                    self.assertEqual(s.JOBS,{})
                    pool.submit.assert_not_called()
        finally: api.tearDown()

class ImportFailureRecoveryTests(unittest.TestCase):
    def test_cleanup_error_does_not_stop_storage_maintenance(self):
        from unittest.mock import patch
        with patch.object(s.time,'sleep',side_effect=[None,StopIteration]), patch.object(s.ImportCache,'prune',side_effect=OSError('disk temporarily unavailable')), patch.object(s,'LIMITS') as limits:
            with self.assertRaises(StopIteration): s.expire_cloud_cache()
            limits.reserve.assert_called_once()
            self.assertTrue(s.IMPORT_LOCK.acquire(blocking=False))
            s.IMPORT_LOCK.release()

    def test_browser_disconnect_during_response_headers_is_handled(self):
        from unittest.mock import Mock, patch
        import io
        handler=Mock()
        payload=json.dumps({'url':'https://youtu.be/9B3vAyeF6lU'}).encode()
        handler.headers={'Content-Length':str(len(payload))}
        handler.rfile=io.BytesIO(payload)
        handler.request_origin.return_value='http://127.0.0.1:8787'
        handler.end_headers.side_effect=BrokenPipeError()
        with patch.object(s,'CLOUD',False), patch.object(s.ImportCache,'get',return_value=('song.mp3',b'audio')):
            s.Handler.youtube_import(handler)
        self.assertTrue(handler.close_connection)
        handler.reply.assert_not_called()

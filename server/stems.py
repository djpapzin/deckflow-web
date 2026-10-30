#!/usr/bin/env python3
"""Loopback-only stem preparation and DeckFlow hosting; one separation at a time."""
import errno
import time
import hashlib
from youtube_import import IMPORT_LOCK, import_audio
import json
import os
from pathlib import Path
import re
import select
import subprocess
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Lock
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
DATA = Path.home() / 'Library/Application Support/DeckFlow/stems'
CLI = Path.home() / '.local/share/deckflow-stems/venv/bin/audio-separator'
MODELS = Path.home() / '.local/share/deckflow-stems/models'
MODEL = 'htdemucs.yaml'
CACHE_VERSION = MODEL + ':cpu-float-v1'
FFMPEG = '/Applications/Ultimate Vocal Remover.app/Contents/Resources'
POOL = ThreadPoolExecutor(max_workers=1)
JOBS = {}
LOCK = Lock()
MAX_BYTES = 100 * 1024 * 1024
WORKER = None
WORKER_LOG = None

def separate_track(folder, quality='best'):
    """Called by the single-thread queue; retain weights for the next song."""
    global WORKER, WORKER_LOG
    if WORKER is None or WORKER.poll() is not None:
        if WORKER_LOG: WORKER_LOG.close()
        DATA.mkdir(parents=True, exist_ok=True)
        WORKER_LOG = (DATA/'worker.log').open('a')
        env = dict(os.environ, PATH=FFMPEG + os.pathsep + os.environ.get('PATH', ''))
        WORKER = subprocess.Popen([str(CLI.parent/'python'), str(ROOT/'server/separate.py'),
            str(MODELS), MODEL], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=WORKER_LOG, text=True, env=env)
    try:
        WORKER.stdin.write(json.dumps({'source':str(folder/'input.audio'), 'destination':str(folder), 'shifts':1 if quality == 'fast' else 2})+'\n')
        WORKER.stdin.flush()
        if not select.select([WORKER.stdout], [], [], 1800)[0]: raise TimeoutError('Separation timed out')
        result = json.loads(WORKER.stdout.readline())
        if not result.get('ok'): raise RuntimeError(result.get('error','Worker failed'))
        (folder/'processing.json').write_text(json.dumps(result))
    except Exception:
        WORKER.kill(); WORKER.wait(); WORKER = None
        raise

def allowed(origin):
    if not origin: return False
    parsed = urlparse(origin)
    return origin in ('https://djpapzin.github.io', 'https://deckflow.djpapzin.com', 'https://dev.deckflow.djpapzin.com') or (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost') and parsed.path == '')

def run_job(key, quality='best'):
    folder = DATA / key
    with LOCK: JOBS[key] = 'processing'
    try:
        separate_track(folder, quality)
        for stem in ('vocals', 'drums', 'bass', 'other'):
            if not (folder/(stem+'.wav')).exists(): raise ValueError('Missing stem output')
        # Retain the old two-part endpoint for previously deployed clients.
        subprocess.run([str(Path(FFMPEG)/'ffmpeg'), '-nostdin', '-v', 'error', '-y',
            '-i', str(folder/'drums.wav'), '-i', str(folder/'bass.wav'), '-i', str(folder/'other.wav'),
            '-filter_complex', 'amix=inputs=3:normalize=0', '-c:a', 'pcm_f32le', str(folder/'instrumental.wav')],
            check=True, timeout=180)
        (folder/'complete.json').write_text(json.dumps({'model': MODEL, 'pipeline': CACHE_VERSION, 'quality':quality}))
        with LOCK: JOBS[key] = 'ready'
    except Exception:
        with LOCK: JOBS[key] = 'error'

def stream_audio(source, connection):
    """Honor partial sends and backpressure without replaying accepted bytes."""
    for chunk in iter(lambda: source.read(65536), b''):
        pending = memoryview(chunk)
        deadline = time.monotonic() + 30
        while pending:
            try:
                sent = connection.send(pending)
                if not sent: raise ConnectionError('Audio connection closed')
                pending = pending[sent:]
                deadline = time.monotonic() + 30
            except OSError as error:
                if error.errno not in (errno.ENOBUFS, errno.EAGAIN, errno.EWOULDBLOCK) or time.monotonic() >= deadline:
                    raise
                time.sleep(0.01)

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs): super().__init__(*args, directory=str(ROOT/'dist'), **kwargs)
    def end_headers(self):
        origin = self.headers.get('Origin')
        if allowed(origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Private-Network', 'true')
        super().end_headers()
    def reply(self, status, value):
        data = json.dumps(value).encode(); self.send_response(status)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)
    def do_OPTIONS(self):
        if not allowed(self.request_origin()): return self.reply(403, {'error':'Origin not allowed'})
        self.send_response(204); self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type'); self.end_headers()
    def request_origin(self):
        origin = self.headers.get('Origin')
        if origin: return origin
        ref = urlparse(self.headers.get('Referer', ''))
        if ref.netloc == self.headers.get('Host') and ref.scheme == 'http': return ref.scheme+'://'+ref.netloc
        return None
    def do_POST(self):
        if self.headers.get('Host') not in ('127.0.0.1:8787','localhost:8787'): return self.reply(403, {'error':'Host not allowed'})
        if urlparse(self.path).path == '/api/import/youtube':
            return self.youtube_import()
        if urlparse(self.path).path != '/api/stems': return self.reply(404, {'error':'Not found'})
        if not allowed(self.request_origin()): return self.reply(403, {'error':'Origin not allowed'})
        quality = parse_qs(urlparse(self.path).query).get('quality',['best'])[0]
        if quality not in ('fast','best'): return self.reply(400, {'error':'Invalid quality'})
        try: length = int(self.headers.get('Content-Length', '0'))
        except ValueError: return self.reply(400, {'error':'Invalid length'})
        if length <= 0 or length > MAX_BYTES: return self.reply(413, {'error':'Choose a track under 100 MB'})
        with LOCK:
            if sum(status in ('queued','processing') for status in JOBS.values()) >= 8:
                return self.reply(429, {'error':'Queue full; try again shortly'})
        data = self.rfile.read(length)
        if len(data) != length: return self.reply(400, {'error':'Incomplete upload'})
        version = CACHE_VERSION if quality == 'best' else CACHE_VERSION + ':fast'
        key = hashlib.sha256(version.encode()+data).hexdigest(); folder = DATA/key
        with LOCK:
            if not (folder/'complete.json').exists() and JOBS.get(key) not in ('queued','processing'):
                folder.mkdir(parents=True, exist_ok=True); (folder/'input.audio').write_bytes(data)
                JOBS[key] = 'queued'; POOL.submit(run_job,key,quality)
        return self.reply(202, {'id':key})
    def youtube_import(self):
        if not allowed(self.request_origin()): return self.reply(403, {'error':'Origin not allowed'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4096: return self.reply(413, {'error':'Invalid link request'})
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict): raise ValueError('Invalid link request')
            if not IMPORT_LOCK.acquire(blocking=False): return self.reply(429, {'error':'Another import is running. Try again shortly.'})
            try: name, audio = import_audio(payload.get('url'), FFMPEG, CLI.parent/'python')
            finally: IMPORT_LOCK.release()
        except (ValueError, RuntimeError) as error:
            return self.reply(400, {'error':str(error)})
        except subprocess.TimeoutExpired:
            return self.reply(504, {'error':'Import timed out. Try a shorter video.'})
        except Exception:
            return self.reply(502, {'error':'Audio import failed. Please try again.'})
        self.send_response(200)
        self.send_header('Content-Type','audio/mpeg')
        self.send_header('Content-Length',str(len(audio)))
        self.send_header('X-Track-Name',json.dumps(name, ensure_ascii=True))
        self.send_header('Access-Control-Expose-Headers','X-Track-Name')
        self.send_header('Cache-Control','no-store')
        self.end_headers(); self.wfile.write(audio)
    def do_GET(self):
        if self.headers.get('Host') not in ('127.0.0.1:8787','localhost:8787'): return self.reply(403, {'error':'Host not allowed'})
        path = urlparse(self.path).path
        views = {'/dev':'https://dev.deckflow.djpapzin.com/', '/live':'https://deckflow.djpapzin.com/'}
        view = next((prefix for prefix in views if path == prefix or path.startswith(prefix+'/')), None)
        if view and path == view:
            self.send_response(302); self.send_header('Location',view+'/'); self.send_header('Content-Length','0'); self.end_headers(); return
        if view:
            asset = path[len(view)+1:]
            if asset and not re.fullmatch(r'(?:index\.html|demo-song\.mp3|demo-song-license\.txt|scratch-worklet\.js|assets/[A-Za-z0-9_-]+\.[A-Za-z0-9]+)',asset):
                return self.reply(404, {'error':'Unknown site asset'})
            try:
                request = Request(views[view]+asset,
                    headers={'User-Agent':'Mozilla/5.0 (DeckFlow Mac Companion)', 'Accept':'*/*'})
                with urlopen(request, timeout=20) as remote:
                    data = remote.read(); content_type = remote.headers.get('Content-Type','application/octet-stream')
            except Exception:
                return self.reply(502, {'error':'Cannot load the site. Check the internet connection and retry.'})
            self.send_response(200)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Frame-Options','DENY')
            self.end_headers(); self.wfile.write(data); return
        if path.startswith('/api/'):

            # API responses and audio are available only to the known app origins.
            if not allowed(self.request_origin()): return self.reply(403, {'error':'Origin not allowed'})
            if path == '/api/health': return self.reply(200, {'ready':CLI.exists(), 'model':MODEL})
            match = re.fullmatch(r'/api/stems/([a-f0-9]{64})(?:/(vocals|drums|bass|other|instrumental)\.wav)?', path)
            if not match: return self.reply(404, {'error':'Not found'})
            key, stem = match.groups(); folder = DATA/key
            ready = (folder/'complete.json').exists()
            if stem:
                if not ready: return self.reply(404, {'error':'Not ready'})
                audio = folder/(stem+'.wav'); self.send_response(200)
                self.send_header('Content-Type','audio/wav'); self.send_header('Content-Length',str(audio.stat().st_size))
                self.end_headers()
                try:
                    with audio.open('rb') as source: stream_audio(source, self.connection)
                except (OSError, ConnectionError):
                    self.close_connection = True
                return
            with LOCK: status = 'ready' if ready else JOBS.get(key,'missing')
            return self.reply(200, {'status':status})
        return super().do_GET()
    def log_message(self, format, *args): pass

if __name__ == '__main__':
    DATA.mkdir(parents=True,exist_ok=True)
    print('DeckFlow + local stem service: http://127.0.0.1:8787',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8787), Handler).serve_forever()

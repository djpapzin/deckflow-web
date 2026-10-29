#!/usr/bin/env python3
"""Loopback-only stem preparation and DeckFlow hosting; one separation at a time."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from threading import Lock
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DATA = Path.home() / 'Library/Application Support/DeckFlow/stems'
CLI = Path.home() / '.local/share/deckflow-stems/venv/bin/audio-separator'
MODELS = Path('/Applications/Ultimate Vocal Remover.app/Contents/Resources/models/MDX_Net_Models')
MODEL = 'UVR-MDX-NET-Inst_HQ_1.onnx'
FFMPEG = '/Applications/Ultimate Vocal Remover.app/Contents/Resources'
POOL = ThreadPoolExecutor(max_workers=1)
JOBS = {}
LOCK = Lock()
MAX_BYTES = 100 * 1024 * 1024

def allowed(origin):
    if not origin: return False
    parsed = urlparse(origin)
    return origin == 'https://djpapzin.github.io' or (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost') and parsed.path == '')

def run_job(key):
    folder = DATA / key
    with LOCK: JOBS[key] = 'processing'
    try:
        env = dict(os.environ, PATH=FFMPEG + os.pathsep + os.environ.get('PATH', ''))
        with (folder / 'processing.log').open('w') as log:
            subprocess.run([str(CLI), str(folder/'input.audio'), '--model_filename', MODEL,
                '--model_file_dir', str(MODELS), '--output_dir', str(folder), '--output_format', 'WAV'],
                check=True, env=env, stdout=log, stderr=log, timeout=1800)
        for stem in ('Vocals', 'Instrumental'):
            matches = list(folder.glob('*(' + stem + ')*.wav'))
            if len(matches) != 1: raise ValueError('Missing stem output')
            matches[0].replace(folder / (stem.lower() + '.wav'))
        (folder/'complete.json').write_text(json.dumps({'model': MODEL}))
        with LOCK: JOBS[key] = 'ready'
    except Exception:
        with LOCK: JOBS[key] = 'error'

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
        if urlparse(self.path).path != '/api/stems': return self.reply(404, {'error':'Not found'})
        if not allowed(self.request_origin()): return self.reply(403, {'error':'Origin not allowed'})
        try: length = int(self.headers.get('Content-Length', '0'))
        except ValueError: return self.reply(400, {'error':'Invalid length'})
        if length <= 0 or length > MAX_BYTES: return self.reply(413, {'error':'Choose a track under 100 MB'})
        with LOCK:
            if sum(status in ('queued','processing') for status in JOBS.values()) >= 8:
                return self.reply(429, {'error':'Queue full; try again shortly'})
        data = self.rfile.read(length)
        if len(data) != length: return self.reply(400, {'error':'Incomplete upload'})
        key = hashlib.sha256(MODEL.encode()+data).hexdigest(); folder = DATA/key
        with LOCK:
            if not (folder/'complete.json').exists() and JOBS.get(key) not in ('queued','processing'):
                folder.mkdir(parents=True, exist_ok=True); (folder/'input.audio').write_bytes(data)
                JOBS[key] = 'queued'; POOL.submit(run_job,key)
        return self.reply(202, {'id':key})
    def do_GET(self):
        if self.headers.get('Host') not in ('127.0.0.1:8787','localhost:8787'): return self.reply(403, {'error':'Host not allowed'})
        path = urlparse(self.path).path
        if path.startswith('/api/'):
            # API responses and audio are available only to the known app origins.
            if not allowed(self.request_origin()): return self.reply(403, {'error':'Origin not allowed'})
            if path == '/api/health': return self.reply(200, {'ready':CLI.exists(), 'model':MODEL})
            match = re.fullmatch(r'/api/stems/([a-f0-9]{64})(?:/(vocals|instrumental)\.wav)?', path)
            if not match: return self.reply(404, {'error':'Not found'})
            key, stem = match.groups(); folder = DATA/key
            ready = (folder/'complete.json').exists()
            if stem:
                if not ready: return self.reply(404, {'error':'Not ready'})
                audio = folder/(stem+'.wav'); self.send_response(200)
                self.send_header('Content-Type','audio/wav'); self.send_header('Content-Length',str(audio.stat().st_size))
                self.end_headers()
                with audio.open('rb') as source:
                    import shutil
                    shutil.copyfileobj(source,self.wfile)
                return
            with LOCK: status = 'ready' if ready else JOBS.get(key,'missing')
            return self.reply(200, {'status':status})
        return super().do_GET()
    def log_message(self, format, *args): pass

if __name__ == '__main__':
    DATA.mkdir(parents=True,exist_ok=True)
    print('DeckFlow + local stem service: http://127.0.0.1:8787',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8787), Handler).serve_forever()

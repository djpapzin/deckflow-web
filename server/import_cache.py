"""Bounded cache of public, unrestricted YouTube MP3s; no session material."""
import hashlib
import json
import math
from pathlib import Path
import shutil
import time

class ImportCache:
    def __init__(self, root, max_bytes=256*1024**2, ttl=21600):
        self.root=Path(root);self.max_bytes=max_bytes;self.ttl=ttl
    def prune(self):
        self.root.mkdir(parents=True,exist_ok=True)
        entries=[]
        for folder in self.root.iterdir():
            if not folder.is_dir() or len(folder.name)!=64 or any(c not in '0123456789abcdef' for c in folder.name): continue
            if time.time()-folder.stat().st_mtime>self.ttl: shutil.rmtree(folder);continue
            entries.append((folder.stat().st_mtime,folder,sum(p.stat().st_size for p in folder.iterdir() if p.is_file())))
        total=sum(size for _,_,size in entries)
        for _,folder,size in sorted(entries):
            if total<=self.max_bytes: break
            shutil.rmtree(folder);total-=size
    def folder(self, url, max_duration):
        return self.root/hashlib.sha256(f'public-v1:{max_duration}:{url}'.encode()).hexdigest()
    def get(self,url,max_duration):
        self.prune();folder=self.folder(url,max_duration)
        try:
            meta=json.loads((folder/'metadata.json').read_text())
            if meta['availability']!='public' or meta['age_limit']!=0 or not 0<meta['duration']<=max_duration: return None
            audio=(folder/'audio.mp3').read_bytes()
            if not audio or len(audio)>100*1024**2 or hashlib.sha256(audio).hexdigest()!=meta['sha256']: return None
            return meta['name'],audio
        except (OSError,ValueError,KeyError,TypeError): return None
    def put(self,url,max_duration,name,audio,details):
        duration=details.get('duration')
        if details.get('availability')!='public' or details.get('age_limit')!=0 or not isinstance(duration,(int,float)) or not math.isfinite(duration) or not 0<duration<=max_duration: return
        if not audio or len(audio)>min(self.max_bytes-4096,100*1024**2): return
        folder=self.folder(url,max_duration);folder.mkdir(parents=True,exist_ok=True)
        # Caller serializes imports; only a final metadata record makes a hit valid.
        (folder/'audio.tmp').write_bytes(audio);(folder/'audio.tmp').replace(folder/'audio.mp3')
        meta={key:details[key] for key in ('availability','age_limit','duration')}
        meta.update(name=name,sha256=hashlib.sha256(audio).hexdigest())
        (folder/'metadata.tmp').write_text(json.dumps(meta));(folder/'metadata.tmp').replace(folder/'metadata.json')
        self.prune()

"""Limits for a small public tester service; touches only its own generated cache."""
from pathlib import Path
import math
import shutil
import time
from threading import Lock

DEFAULT_RESERVATION = 1280*1024**2

def stem_storage_budget(duration, upload_bytes):
    """Five stereo float32 WAVs plus the original and temporary-write headroom."""
    return math.ceil(duration)*44100*2*4*5 + upload_bytes + 64*1024**2

class CloudLimits:
    def __init__(self, root, max_bytes=4*1024**3, min_free=12*1024**3):
        self.root=Path(root);self.max_bytes=max_bytes;self.min_free=min_free
        self.lock=Lock();self.requests={}
    def allow(self, client, now=None):
        now=time.time() if now is None else now
        with self.lock:
            self.requests={key:[t for t in values if now-t<3600] for key,values in self.requests.items() if any(now-t<3600 for t in values)}
            values=self.requests.setdefault(client,[])
            if len(values)>=6 or sum(map(len,self.requests.values()))>=24: return False
            values.append(now);return True
    def reserve(self, active, reserve_bytes=DEFAULT_RESERVATION):
        """Called under the job lock before accepting new work."""
        self.root.mkdir(parents=True,exist_ok=True)
        now=time.time()
        # Expire completed/failed generated jobs after six hours, never running work.
        for folder in self.root.iterdir():
            if folder.is_dir() and len(folder.name)==64 and all(c in '0123456789abcdef' for c in folder.name) and folder.name not in active:
                if now-folder.stat().st_mtime>21600: shutil.rmtree(folder)
        sizes={folder.name:sum(p.stat().st_size for p in folder.rglob('*') if p.is_file())
               for folder in self.root.iterdir() if folder.is_dir()}
        used=sum(sizes.values())+sum(p.stat().st_size for p in self.root.iterdir() if p.is_file())
        # Each active budget includes bytes already on disk. Reserve only its
        # unwritten remainder, instead of charging those bytes twice.
        budgets=active if isinstance(active,dict) else {key:reserve_bytes for key in active}
        required=reserve_bytes+sum(max(0,budget-sizes.get(key,0)) for key,budget in budgets.items())
        if used+required>self.max_bytes or shutil.disk_usage(self.root).free-required<self.min_free:
            raise ValueError('Cloud storage is busy. Try again later; existing tracks can still play.')

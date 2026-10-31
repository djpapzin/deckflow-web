import os
from pathlib import Path
import tempfile
import unittest
from import_cache import ImportCache

class ImportCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.cache=ImportCache(self.temp.name)
        self.details={'availability':'public','age_limit':0,'duration':120}
    def save(self,url='video',details=None):
        self.cache.put(url,600,'song.mp3',b'audio',details or self.details)
    def test_hit_integrity_and_duration_policy(self):
        self.save()
        self.assertEqual(self.cache.get('video',600),('song.mp3',b'audio'))
        self.assertIsNone(self.cache.get('video',1200))
        (self.cache.folder('video',600)/'audio.mp3').write_bytes(b'broken')
        self.assertIsNone(self.cache.get('video',600))
    def test_restricted_unknown_and_long_tracks_not_cached(self):
        for field,value in [('availability','private'),('availability',None),('age_limit',18),('duration',601),('duration',float('nan'))]:
            self.save(details={**self.details,field:value})
            self.assertIsNone(self.cache.get('video',600))
    def test_expiry_preserves_unrelated_files(self):
        self.save();folder=self.cache.folder('video',600)
        os.utime(folder,(0,0));other=Path(self.temp.name)/'unrelated';other.mkdir()
        self.assertIsNone(self.cache.get('video',600))
        self.assertTrue(other.exists())
    def test_size_bound(self):
        self.cache.max_bytes=5000
        for n in range(5): self.cache.put(str(n),600,'song',b'x'*800,self.details)
        total=sum(p.stat().st_size for p in Path(self.temp.name).rglob('*') if p.is_file())
        self.assertLessEqual(total,5000)

import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from cloud_limits import CloudLimits, stem_storage_budget

class CloudLimitTests(unittest.TestCase):
    def test_per_client_limit_and_expiration(self):
        limits=CloudLimits('.')
        self.assertTrue(all(limits.allow('tester',0) for _ in range(6)))
        self.assertFalse(limits.allow('tester',1))
        self.assertTrue(limits.allow('tester',3601))
    def test_global_limit(self):
        limits=CloudLimits('.')
        for n in range(24): self.assertTrue(limits.allow(str(n),0))
        self.assertFalse(limits.allow('extra',1))
    def test_cleanup_keeps_active_and_non_job_folders(self):
        with tempfile.TemporaryDirectory() as root:
            for name in ['a'*64,'b'*64,'keep-me']:
                folder=Path(root)/name;folder.mkdir();(folder/'audio').write_bytes(b'a')
                os.utime(folder,(time.time()-30000,)*2)
            limits=CloudLimits(root,max_bytes=100,min_free=0)
            limits.reserve({'b'*64},reserve_bytes=0)
            self.assertFalse((Path(root)/('a'*64)).exists())
            self.assertTrue((Path(root)/('b'*64)).exists())
            self.assertTrue((Path(root)/'keep-me').exists())
    def test_storage_and_free_space_reservations(self):
        with tempfile.TemporaryDirectory() as root:
            limits=CloudLimits(root,max_bytes=100,min_free=100)
            with patch('cloud_limits.shutil.disk_usage') as disk:
                disk.return_value.free=500
                with self.assertRaises(ValueError): limits.reserve({'active'},reserve_bytes=60)
                disk.return_value.free=120
                with self.assertRaises(ValueError): limits.reserve(set(),reserve_bytes=30)

    def test_two_real_songs_fit_without_maximum_length_reservations(self):
        # Regression: 1.7 GiB cache + two blanket 1.25 GiB reservations
        # rejected the mix even though its actual output fits under 4 GiB.
        with tempfile.TemporaryDirectory() as root:
            cache=Path(root)/('a'*64);cache.mkdir()
            with (cache/'cached.wav').open('wb') as f: f.truncate(1700*1024**2)
            active='b'*64;folder=Path(root)/active;folder.mkdir()
            with (folder/'input.audio').open('wb') as f: f.truncate(7*1024**2)
            limits=CloudLimits(root,min_free=0)
            with self.assertRaises(ValueError): limits.reserve({active})
            limits.reserve({active:stem_storage_budget(204,7*1024**2)},
                           reserve_bytes=stem_storage_budget(366,12*1024**2))

    def test_active_written_bytes_are_not_reserved_twice(self):
        with tempfile.TemporaryDirectory() as root:
            key='a'*64;folder=Path(root)/key;folder.mkdir()
            (folder/'output').write_bytes(b'a'*60)
            limits=CloudLimits(root,max_bytes=150,min_free=0)
            limits.reserve({key:100},reserve_bytes=50)
            with self.assertRaises(ValueError): limits.reserve({key:100},reserve_bytes=51)
            with patch('cloud_limits.shutil.disk_usage') as disk:
                disk.return_value.free=89
                with self.assertRaises(ValueError): limits.reserve({key:100},reserve_bytes=50)

    def test_budget_covers_maximum_length_float_outputs_and_upload(self):
        expected=600*44100*2*4*5 + 30*1024**2
        self.assertGreater(stem_storage_budget(600,30*1024**2),expected)
        self.assertLess(stem_storage_budget(45,1024),stem_storage_budget(600,1024))

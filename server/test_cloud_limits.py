import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from cloud_limits import CloudLimits

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

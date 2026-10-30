import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import youtube_import as y


class SessionImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        (self.folder / 'ffmpeg').touch()
        self.session = self.folder / 'cookies.txt'
        self.session.write_text('# Netscape HTTP Cookie File\n# session-secret\n')
        self.session.chmod(0o600)
        self.env = patch.dict(os.environ, {'DECKFLOW_YTDLP_BIN': '', 'DECKFLOW_YOUTUBE_COOKIES_FILE': ''})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temp.cleanup()

    def download(self, command, **kwargs):
        directory = Path(command[command.index('-o') + 1]).parent
        (directory / 'track.mp3').write_bytes(b'mp3-audio')
        (directory / 'track.info.json').write_text(json.dumps({'title': 'Public track', 'availability': 'public', 'age_limit': 0}))
        return subprocess.CompletedProcess(command, 0, '', '')

    def test_default_remains_anonymous(self):
        with patch.object(y.subprocess, 'run', side_effect=self.download) as run:
            self.assertEqual(y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder), ('Public track.mp3', b'mp3-audio'))
        command = run.call_args.args[0]
        self.assertEqual(command[:3], [sys.executable, '-m', 'yt_dlp'])
        self.assertNotIn('--cookies', command)
        self.assertNotIn('--cookies-from-browser', command)

    def test_configured_session_uses_private_disposable_copy(self):
        os.environ.update(DECKFLOW_YTDLP_BIN=sys.executable, DECKFLOW_YOUTUBE_COOKIES_FILE=str(self.session))
        copies = []
        def authenticated_download(command, **kwargs):
            cookie = Path(command[command.index('--cookies') + 1])
            copies.append(cookie)
            self.assertNotEqual(cookie, self.session)
            self.assertEqual(cookie.stat().st_mode & 0o777, 0o600)
            self.assertEqual(cookie.read_bytes(), self.session.read_bytes())
            self.assertNotIn('session-secret', ' '.join(command))
            cookie.write_text('rotated session')
            self.assertEqual(command[0], sys.executable)
            rule = command[command.index('--match-filter') + 1]
            self.assertIn("availability = 'public'", rule)
            self.assertIn('age_limit = 0', rule)
            return self.download(command, **kwargs)
        with patch.object(y.subprocess, 'run', side_effect=authenticated_download):
            y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder)
        self.assertFalse(copies[0].exists())
        self.assertIn('session-secret', self.session.read_text())

    def test_shared_session_never_returns_account_only_or_unknown_visibility_audio(self):
        os.environ['DECKFLOW_YOUTUBE_COOKIES_FILE'] = str(self.session)
        for availability in ('private', 'premium_only', 'subscriber_only', 'needs_auth', 'unlisted', None):
            with self.subTest(availability=availability):
                def restricted_download(command, **kwargs):
                    result = self.download(command, **kwargs)
                    folder = Path(command[command.index('-o') + 1]).parent
                    (folder / 'track.info.json').write_text(json.dumps({'title': 'Restricted', 'availability': availability, 'age_limit': 0}))
                    return result
                with patch.object(y.subprocess, 'run', side_effect=restricted_download):
                    with self.assertRaisesRegex(ValueError, 'public, non-age-restricted'):
                        y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder)

    def test_shared_session_rejects_age_restriction_and_missing_age_metadata(self):
        os.environ['DECKFLOW_YOUTUBE_COOKIES_FILE'] = str(self.session)
        for age_limit in (18, None):
            def restricted_download(command, **kwargs):
                result = self.download(command, **kwargs)
                folder = Path(command[command.index('-o') + 1]).parent
                (folder / 'track.info.json').write_text(json.dumps({'availability': 'public', 'age_limit': age_limit}))
                return result
            with patch.object(y.subprocess, 'run', side_effect=restricted_download):
                with self.assertRaises(ValueError):
                    y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder)
    def test_unsafe_session_is_rejected_without_downloader_or_path_disclosure(self):
        for mode in (0o644, 0o660):
            self.session.chmod(mode)
            os.environ['DECKFLOW_YOUTUBE_COOKIES_FILE'] = str(self.session)
            with patch.object(y.subprocess, 'run') as run:
                with self.assertRaises(RuntimeError) as error:
                    y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder)
                self.assertNotIn(str(self.session), str(error.exception))
                run.assert_not_called()
        self.session.chmod(0o600)
        link = self.folder / 'session-link'
        link.symlink_to(self.session)
        os.environ['DECKFLOW_YOUTUBE_COOKIES_FILE'] = str(link)
        with self.assertRaises(RuntimeError):
            y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder)

    def test_failed_import_removes_disposable_session_and_hides_stderr(self):
        os.environ['DECKFLOW_YOUTUBE_COOKIES_FILE'] = str(self.session)
        copies = []
        def reject(command, **kwargs):
            copies.append(Path(command[command.index('--cookies') + 1]))
            return subprocess.CompletedProcess(command, 1, '', 'session-secret: forbidden')
        with patch.object(y.subprocess, 'run', side_effect=reject):
            with self.assertRaises(RuntimeError) as error:
                y.import_audio('https://youtu.be/SkVqJ1SGeL0', self.folder)
            self.assertNotIn('session-secret', str(error.exception))
        self.assertFalse(copies[0].exists())


if __name__ == '__main__':
    unittest.main()

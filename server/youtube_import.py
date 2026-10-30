"""Single-video imports, with temporary files and bounded local conversion."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import stat
import sys
import tempfile
from threading import Lock
from urllib.parse import urlparse, parse_qs

IMPORT_LOCK = Lock()
MAX_AUDIO_BYTES = 100 * 1024 * 1024

def video_url(value):
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError('Paste a YouTube video link.')
    parsed = urlparse(value.strip())
    if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port:
        raise ValueError('Use an HTTPS YouTube video link.')
    host = parsed.hostname
    if host == 'youtu.be':
        video = parsed.path.lstrip('/')
    elif host in ('youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'):
        video = parse_qs(parsed.query).get('v', [''])[0] if parsed.path == '/watch' else parsed.path.split('/')[-1] if re.fullmatch(r'/(shorts|embed)/[^/]+', parsed.path) else ''
    else:
        video = ''
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video):
        raise ValueError('Paste a single YouTube video link, not a playlist or channel.')
    return 'https://www.youtube.com/watch?v=' + video

def import_audio(url, ffmpeg_dir, python=sys.executable, max_duration=1200):
    url = video_url(url)
    ffmpeg = Path(ffmpeg_dir) / 'ffmpeg'
    if not ffmpeg.exists() and not shutil.which('ffmpeg'):
        raise RuntimeError('Audio conversion needs FFmpeg on the DeckFlow companion.')
    # Account access is optional, configured by the server owner, never by a request.
    with tempfile.TemporaryDirectory(prefix='deckflow-import-') as directory:
        binary = os.environ.get('DECKFLOW_YTDLP_BIN')
        command = [str(python), '-m', 'yt_dlp']
        if binary:
            executable = Path(binary)
            if not executable.is_absolute() or not executable.is_file() or not os.access(executable, os.X_OK):
                raise RuntimeError('The configured YouTube downloader is unavailable.')
            command = [str(executable)]
        command += ['--ignore-config', '--no-plugin-dirs', '--no-cache-dir',
            '--no-playlist', '--no-progress', '--socket-timeout', '20', '--retries', '1',
            '--max-filesize', '100M', '--match-filter', f'duration <= {max_duration} & !is_live',
            '-f', 'bestaudio', '-x', '--audio-format', 'mp3', '--audio-quality', '192K',
            '--write-info-json', '-o', str(Path(directory) / 'track.%(ext)s')]
        session = os.environ.get('DECKFLOW_YOUTUBE_COOKIES_FILE')
        if session:
            try:
                source = Path(session)
                details = source.lstat()
                if (not source.is_absolute() or not stat.S_ISREG(details.st_mode)
                        or details.st_mode & 0o077 or details.st_uid not in (0, os.getuid())
                        or not 0 < details.st_size <= 1024 * 1024):
                    raise ValueError('Unsafe session file')
                # yt-dlp rewrites its cookie jar. Give each import a disposable copy,
                # keeping the protected source read-only and out of response metadata.
                cookie_copy = Path(directory) / 'session.txt'
                cookie_copy.write_bytes(source.read_bytes())
                cookie_copy.chmod(0o600)
            except (OSError, ValueError):
                raise RuntimeError('The configured YouTube session is unavailable. Ask the server owner to sign in again.') from None
            command += ['--cookies', str(cookie_copy)]
        node = shutil.which('node') or str(Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')
        if Path(node).exists(): command += ['--js-runtimes', 'node:' + node]
        if ffmpeg.exists(): command += ['--ffmpeg-location', str(ffmpeg.parent)]
        result = subprocess.run(command + ['--', url], capture_output=True, text=True, timeout=600)
        audio = Path(directory) / 'track.mp3'
        if result.returncode or not audio.exists():
            if 'No module named yt_dlp' in result.stderr:
                raise RuntimeError('YouTube import needs yt-dlp installed in the DeckFlow companion Python environment.')
            if 'Sign in to confirm' in result.stderr:
                raise RuntimeError('YouTube is refusing imports from this server. Load an audio file instead.')
            raise RuntimeError('YouTube could not provide this audio. Try a public video under 20 minutes; restricted videos and live streams are unsupported.')
        if audio.stat().st_size > MAX_AUDIO_BYTES:
            raise ValueError('Imported audio exceeds 100 MB.')
        metadata = json.loads((Path(directory) / 'track.info.json').read_text())
        name = re.sub(r'[^\w .()-]', '_', metadata.get('title', 'YouTube track'))[:120] + '.mp3'
        return name, audio.read_bytes()

"""Persistent CPU Demucs worker; model stays resident between queued songs."""
import io
import json
import random
from pathlib import Path
import subprocess
import sys
import time
import soundfile as sf
import torch
import audio_separator
# Published model checkpoints reference the bundled top-level demucs package.
sys.path.insert(0, str(Path(audio_separator.__file__).parent/'separator/uvr_lib_v5'))
from audio_separator.separator.uvr_lib_v5.demucs.apply import apply_model
from audio_separator.separator.uvr_lib_v5.demucs.pretrained import get_model

class Engine:
    def __init__(self, models, model):
        torch.set_num_threads(4)
        self.model = get_model(name=Path(model).stem, repo=Path(models)).cpu().eval()

    def separate(self, source, destination, shifts=2):
        started = time.perf_counter()
        decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-ar', '44100', '-ac', '2',
            '-f', 'wav', '-c:a', 'pcm_f32le', 'pipe:1'], capture_output=True, check=True).stdout
        samples, rate = sf.read(io.BytesIO(decoded), dtype='float32', always_2d=True)
        mix = torch.from_numpy(samples.T.copy())
        reference = mix.mean(0)
        mean, std = reference.mean(), reference.std().clamp_min(1e-8)
        torch.manual_seed(0)
        random.seed(0)
        with torch.inference_mode():
            sources = apply_model(self.model, ((mix-mean)/std)[None], shifts=shifts,
                split=True, overlap=.25, device='cpu', progress=False)[0]
            sources = sources * std + mean
        destination = Path(destination); destination.mkdir(parents=True, exist_ok=True)
        # Use the model's own source names, avoiding positional remapping.
        for name, audio in zip(self.model.sources, sources):
            sf.write(destination/(name+'.wav'), audio.T.numpy(), rate, subtype='FLOAT')
        return {'seconds': time.perf_counter()-started, 'duration': len(samples)/rate, 'shifts': shifts}

if __name__ == '__main__':
    engine = Engine(sys.argv[1], sys.argv[2])
    for line in sys.stdin:
        try:
            request = json.loads(line)
            result = engine.separate(request['source'], request['destination'], request.get('shifts', 2))
            print(json.dumps({'ok': True, **result}), flush=True)
        except Exception as error:
            print(json.dumps({'ok': False, 'error': str(error)}), flush=True)

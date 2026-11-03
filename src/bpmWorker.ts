import { detectBpm } from './bpmAnalysis';
import { detectDownbeat } from './downbeat';

self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try {
    const { samples, sampleRate } = event.data;
    const grid = detectBpm(samples, sampleRate);
    const cue = grid ? detectDownbeat(samples, sampleRate, grid) : null;
    self.postMessage({ grid: cue?.grid ?? grid, downbeat: cue?.seconds ?? null });
  } catch {
    self.postMessage({ grid: null, downbeat: null });
  }
};

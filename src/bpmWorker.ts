import { detectBpm } from './bpmAnalysis';
self.onmessage = (event: MessageEvent<{ samples: Float32Array; sampleRate: number }>) => {
  try { self.postMessage({ grid: detectBpm(event.data.samples, event.data.sampleRate) }); }
  catch { self.postMessage({ grid: null }); }
};

// Small teaching detector: low-band energy flux -> autocorrelation -> beat phase.
// Works best on steady percussion. Half/double-time and changing tempo need correction.
export interface BeatGrid { bpm: number; offset: number; confidence: number }
export function detectBpm(samples: Float32Array, sampleRate: number): BeatGrid | null {
  if (samples.length / sampleRate < 3) return null;
  const hop = Math.max(1, Math.round(sampleRate / 200));
  const rate = sampleRate / hop;
  const count = Math.floor(samples.length / hop);
  const energy = new Float64Array(count);
  const alpha = 1 - Math.exp(-2 * Math.PI * 180 / sampleRate);
  let low = 0;
  for (let b = 0; b < count; b++) {
    let sum = 0;
    for (let j = 0; j < hop; j++) {
      const x = samples[b * hop + j];
      low += alpha * (x - low);
      sum += low * low + 0.025 * x * x;
    }
    energy[b] = Math.sqrt(sum / hop);
  }
  const onset = new Float64Array(count);
  // A sustained tone can alias into periodic bin-to-bin flux. Require actual
  // envelope dynamics, ignoring the initial filter transient.
  const stableStart = Math.min(count - 1, Math.round(rate * .5));
  let mean = 0, square = 0;
  for (let i = stableStart; i < count; i++) { mean += energy[i]; square += energy[i] ** 2; }
  mean /= count - stableStart; square /= count - stableStart;
  if (Math.sqrt(Math.max(0, square - mean * mean)) < mean * .08) return null;
  let power = 0;
  for (let i = 1; i < count; i++) {
    onset[i] = Math.max(0, energy[i] - energy[i - 1]);
    power += onset[i] * onset[i];
  }
  if (power / count < 1e-10) return null;
  const onsetMean = onset.reduce((sum, value) => sum + value, 0) / count;
  const minLag = Math.floor(rate * 60 / 180);
  const maxLag = Math.ceil(rate * 60 / 70);
  const correlations = new Float64Array(maxLag + 2);
  let bestLag = 0; let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let dot = 0, a = 0, b = 0;
    for (let i = lag; i < count; i++) {
      const x = onset[i] - onsetMean, y = onset[i - lag] - onsetMean;
      dot += x * y;
      a += x * x; b += y * y;
    }
    const correlation = dot / Math.max(1e-20, Math.sqrt(a * b));
    correlations[lag] = correlation;
    // Gentle tie-break toward common dance tempos; no claim of musical certainty.
    const score = correlation * (1 - 0.03 * Math.abs(Math.log2((rate * 60 / lag) / 120)));
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (bestScore < 0.15 || !bestLag) return null;
  const l = correlations[bestLag - 1] ?? 0, c = correlations[bestLag], r = correlations[bestLag + 1] ?? 0;
  const denom = l - 2 * c + r;
  const delta = denom < -1e-8 ? Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / denom)) : 0;
  const period = bestLag + delta;
  // Refine using separated peaks: bin quantization alone drifts on long tracks.
  const peaks: number[] = [];
  let maxOnset = 0;
  for (const value of onset) maxOnset = Math.max(maxOnset, value);
  for (let i = 1; i < count - 1; i++) {
    if (onset[i] > maxOnset * .25 && onset[i] >= onset[i-1] && onset[i] > onset[i+1]) peaks.push(i);
  }
  let phase = 0, phaseScore = -1;
  for (let p = 0; p < period; p++) {
    let score = 0;
    for (let beat = p; beat < count; beat += period) {
      const i = Math.round(beat);
      score += (onset[i] ?? 0) + .5 * ((onset[i-1] ?? 0) + (onset[i+1] ?? 0));
    }
    if (score > phaseScore) { phaseScore = score; phase = p; }
  }
  const strongest = new Map<number, number>();
  for (const p of peaks) {
    const n = Math.round((p - phase) / period);
    if (Math.abs(p - (phase + n * period)) >= period * .1) continue;
    const old = strongest.get(n);
    if (old === undefined || onset[p] > onset[old]) strongest.set(n, p);
  }
  const fitted = [...strongest].map(([n,p]) => ({ n, p }));
  let refined = period;
  if (fitted.length >= 4) {
    const meanN = fitted.reduce((s,v)=>s+v.n,0)/fitted.length;
    const meanP = fitted.reduce((s,v)=>s+v.p,0)/fitted.length;
    const cov = fitted.reduce((s,v)=>s+(v.n-meanN)*(v.p-meanP),0);
    const variance = fitted.reduce((s,v)=>s+(v.n-meanN)**2,0);
    if (variance > 0) {
      const candidate = cov / variance;
      if (Math.abs(candidate-period) < period * .02) {
        refined = candidate; phase = meanP - refined * meanN;
      }
    }
  }
  const bpm = 60 * rate / refined;
  const offset = ((phase / rate) % (60 / bpm) + 60 / bpm) % (60 / bpm);
  return { bpm: Math.round(bpm * 10) / 10, offset, confidence: Math.min(1, bestScore) };
}

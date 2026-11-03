import type { BeatGrid } from './bpmAnalysis';

// In-place radix-2 FFT. The worker uses this for the kick band and beat spectra.
function fft(real: Float64Array, imaginary: Float64Array, inverse = false) {
  const size = real.length;
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imaginary[i], imaginary[j]] = [imaginary[j], imaginary[i]];
    }
  }
  for (let width = 2; width <= size; width *= 2) {
    const half = width / 2;
    const angle = (inverse ? 2 : -2) * Math.PI / width;
    for (let j = 0; j < half; j++) {
      const cosine = Math.cos(angle * j), sine = Math.sin(angle * j);
      for (let i = j; i < size; i += width) {
        const k = i + half;
        const re = cosine * real[k] - sine * imaginary[k];
        const im = sine * real[k] + cosine * imaginary[k];
        real[k] = real[i] - re;
        imaginary[k] = imaginary[i] - im;
        real[i] += re;
        imaginary[i] += im;
      }
    }
  }
}

/** Estimate beat one for a steady four-beat track. Ambiguous bars yield no cue. */
export function detectDownbeat(samples: Float32Array, rate: number, grid: BeatGrid) {
  if (samples.length / rate < 20 * 60 / grid.bpm) return null;
  const fftSize = 2 ** Math.ceil(Math.log2(samples.length));
  const low = new Float64Array(fftSize), imaginary = new Float64Array(fftSize);
  low.set(samples);
  fft(low, imaginary);
  for (let i = 0; i < fftSize; i++) {
    const hz = Math.min(i, fftSize - i) * rate / fftSize;
    if (hz < 32 || hz > 125) low[i] = imaginary[i] = 0;
  }
  fft(low, imaginary, true);
  const hop = Math.round(rate / 200);
  const flux = new Float64Array(Math.floor(samples.length / hop));
  let previous = 0;
  for (let i = 0; i < flux.length; i++) {
    let energy = 0;
    for (let j = 0; j < hop; j++) energy += low[i * hop + j] ** 2;
    energy = Math.sqrt(energy / hop);
    flux[i] = Math.max(0, energy - previous);
    previous = energy;
  }
  // Search near the original tempo for the grid most supported by kick onsets.
  let best = { bpm: grid.bpm, offset: grid.offset, score: 0 };
  for (let tenths = -5; tenths <= 5; tenths++) {
    const bpm = grid.bpm + tenths / 10;
    const period = 60 * rate / (bpm * hop);
    for (let phase = 0; phase < period; phase++) {
      let total = 0, count = 0;
      for (let beat = phase + period; beat < flux.length - 1; beat += period) {
        const i = Math.floor(beat), fraction = beat - i;
        total += flux[i] * (1 - fraction) + flux[i + 1] * fraction;
        count++;
      }
      const score = total / count;
      if (score > best.score) best = { bpm, offset: phase * hop / rate, score };
    }
  }
  if (best.score <= 0) return null;
  const period = 60 / best.bpm;
  const window = Math.round(rate * .1), size = 2 ** Math.ceil(Math.log2(window));
  const spectrum = new Float64Array(size), quadrature = new Float64Array(size);
  const hann = Float64Array.from({ length: window }, (_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (window - 1)));
  const last = new Float64Array(size / 2 + 1);
  const sums = [0, 0, 0, 0], counts = [0, 0, 0, 0];
  for (let beat = 0; ; beat++) {
    const start = Math.floor((best.offset + beat * period) * rate);
    if (start + window > samples.length) break;
    spectrum.fill(0);
    quadrature.fill(0);
    for (let i = 0; i < window; i++) spectrum[i] = samples[start + i] * hann[i];
    fft(spectrum, quadrature);
    let change = 0;
    for (let i = 0; i < last.length; i++) {
      const value = Math.log1p(Math.hypot(spectrum[i], quadrature[i]));
      change += Math.abs(value - last[i]);
      last[i] = value;
    }
    if (beat >= 4) { sums[beat % 4] += change; counts[beat % 4]++; }
  }
  if (counts.some(count => count < 4)) return null;
  const ranked = sums.map((sum, beat) => ({ beat, score: sum / counts[beat] })).sort((a, b) => b.score - a.score);
  if (ranked[0].score <= 0 || ranked[0].score < ranked[1].score * 1.1) return null;
  return { grid: { bpm: best.bpm, offset: best.offset, confidence: grid.confidence }, seconds: best.offset + ranked[0].beat * period };
}

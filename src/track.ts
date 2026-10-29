// Decode local audio, compute peaks/analysis PCM, and install stereo buffers in a deck worklet.
import type { AudioRuntime } from './audio';

export interface TrackPeaks {
  min: Float32Array;
  max: Float32Array;
  buckets: number;
}

export interface TrackData {
  name: string;
  duration: number; // seconds
  totalFrames: number; // frames at the AudioContext sample rate
  sampleRate: number;
  peaks: TrackPeaks;
  pathL: string; // unique track identity (retained from the original VFS model)
  pathR: string; // matching stereo identity
}

// Higher than the pixel width so a zoomed-in view still has detail to draw.
const PEAK_BUCKETS = 6000;

function computePeaks(channel: Float32Array, buckets: number): TrackPeaks {
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  const bucketSize = channel.length / buckets;

  for (let b = 0; b < buckets; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(channel.length, Math.floor((b + 1) * bucketSize));
    let mn = 0;
    let mx = 0;
    for (let i = start; i < end; i++) {
      const v = channel[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    min[b] = mn;
    max[b] = mx;
  }

  return { min, max, buckets };
}

/**
 * Decode local audio at the shared context rate, with waveform and BPM-analysis data.
 */
export async function decodeTrack(
  rt: AudioRuntime,
  file: File,
) {
  const arrayBuffer = await file.arrayBuffer();
  // decodeAudioData resamples to rt.ctx.sampleRate, so frame counts below are already
  // in the engine's sample rate — no resampling factor needed in the transport math.
  const audioBuffer = await rt.ctx.decodeAudioData(arrayBuffer);

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;

  // Standalone channel arrays can be transferred to the playback worklet.
  const left = new Float32Array(ch0);
  const right = new Float32Array(ch1);

  if (audioBuffer.length < 2) throw new Error('This audio file is too short to play.');
  const stride = Math.max(1, Math.floor(audioBuffer.sampleRate / 11025));
  const analysisPcm = new Float32Array(Math.floor(Math.min(ch0.length, audioBuffer.sampleRate * 120) / stride));
  for (let i = 0; i < analysisPcm.length; i++) {
    // Stereo energy rather than averaging prevents anti-phase material cancelling.
    const l = ch0[i * stride], r = ch1[i * stride];
    analysisPcm[i] = Math.abs(l) >= Math.abs(r) ? l : r;
  }
  return { name: file.name, duration: audioBuffer.duration, totalFrames: audioBuffer.length,
    sampleRate: audioBuffer.sampleRate, peaks: computePeaks(ch0, PEAK_BUCKETS), left, right,
    analysisPcm, analysisSampleRate: audioBuffer.sampleRate / stride };
}

export async function publishTrack(rt: AudioRuntime, deckId: string,
  decoded: Awaited<ReturnType<typeof decodeTrack>>): Promise<TrackData> {
  const { left, right, analysisPcm: _pcm, analysisSampleRate: _rate, ...metadata } = decoded;

  const pathL = `${deckId}:L`;
  const pathR = `${deckId}:R`;

  // Transfer PCM to the time-stretch worklet. Paths remain stable track identities.
  rt.scratch[deckId.split(':')[0]].load(left, right);
  await rt.players[deckId.split(':')[0]].load(left, right, metadata.duration);

  return {
    ...metadata,
    pathL,
    pathR,
  };
}

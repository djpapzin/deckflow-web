import type { DeckState } from './deck';

export type EqBand = 'eqLow' | 'eqMid' | 'eqHigh';
export type Action =
  | { type: 'LOAD'; track: DeckState['track'] }
  | { type: 'PLAY' | 'PAUSE' | 'END' | 'CUE_UP' }
  | { type: 'CUE_DOWN'; position: number }
  | { type: 'HOT_CUE'; index: number; position: number; clear?: boolean }
  | { type: 'SEEK'; norm: number }
  | { type: 'SYNC'; norm: number; tempo: number }
  | { type: 'FOLLOW'; tempo: number }
  | { type: 'BEAT_LOOP'; position: number; beats: number; bpm: number }
  | { type: 'KEY_LOCK' }
  | { type: 'SET_VOLUME' | 'SET_FILTER' | 'SET_TEMPO'; value: number }
  | { type: 'SET_EQ'; band: EqBand; value: number }
  | { type: 'SET_CUE' | 'LOOP_IN' | 'LOOP_OUT' | 'TOGGLE_LOOP' | 'CLEAR_LOOP'; position: number };

export const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
export function validLoop(s: DeckState): boolean {
  const minLength = s.track ? Math.min(0.01 / s.track.duration, 1) : 1;
  return !!s.track && s.loopIn !== null && s.loopOut !== null && s.loopOut - s.loopIn >= minLength;
}
function rebase(s: DeckState, norm: number): DeckState {
  return { ...s, baseNorm: clamp01(norm), seekGen: s.seekGen + 1 };
}

export function reducer(s: DeckState, a: Action): DeckState {
  switch (a.type) {
    case 'LOAD':
      return { ...rebase(s, 0), track: a.track, playing: false, tempo: 1,
        cueNorm: null, cuePreview: false, hotCues: Array(5).fill(null), loopIn: null, loopOut: null, loopEnabled: false };
    case 'PLAY': return s.track ? { ...s, playing: true, cuePreview: false } : s;
    case 'PAUSE': return { ...s, playing: false, cuePreview: false };
    case 'CUE_DOWN':
      if (!s.track || s.cuePreview) return s;
      if (s.playing) return { ...rebase(s, s.cueNorm ?? 0), playing: false, cuePreview: false, loopEnabled: false };
      return { ...rebase(s, a.position), cueNorm: clamp01(a.position), playing: true, cuePreview: true, loopEnabled: false };
    case 'HOT_CUE': {
      if (!s.track || !Number.isInteger(a.index) || a.index < 0 || a.index >= 5) return s;
      const hotCues = [...s.hotCues];
      if (a.clear) { hotCues[a.index] = null; return { ...s, hotCues }; }
      const saved = hotCues[a.index];
      if (saved === null) { hotCues[a.index] = clamp01(a.position); return { ...s, hotCues }; }
      return { ...rebase(s, saved), playing: true, cuePreview: false, loopEnabled: false };
    }
    case 'CUE_UP': return s.cuePreview
      ? { ...rebase(s, s.cueNorm ?? 0), playing: false, cuePreview: false } : s;
    case 'SYNC': return s.track ? { ...rebase(s, a.norm), tempo: a.tempo,
      loopEnabled: false } : s;
    case 'FOLLOW': return { ...s, tempo: a.tempo, loopEnabled: false };
    case 'KEY_LOCK': return { ...s, keyLock: !s.keyLock };
    case 'SEEK': {
      if (!s.track) return s;
      const norm = clamp01(a.norm);
      const outside = s.loopEnabled && (norm < s.loopIn! || norm >= s.loopOut!);
      return { ...rebase(s, norm), loopEnabled: outside ? false : s.loopEnabled };
    }
    case 'END': return s.loopEnabled ? s : { ...rebase(s, 0), playing: false };
    case 'SET_VOLUME': return { ...s, volume: clamp01(a.value) };
    case 'SET_EQ': return { ...s, [a.band]: Math.max(-12, Math.min(12, a.value)) };
    case 'SET_FILTER': return { ...s, filterCutoff: Math.max(-1, Math.min(1, a.value)) };
    case 'SET_TEMPO': return { ...s, tempo: Math.max(0.5, Math.min(1.5, a.value)) };
    case 'SET_CUE': return s.track ? { ...s, cueNorm: clamp01(a.position) } : s;
    case 'BEAT_LOOP': {
      if (!s.track || ![1,2,4,8,16,32].includes(a.beats) || !Number.isFinite(a.bpm) || a.bpm < 30 || a.bpm > 300) return s;
      const length = a.beats * 60 / a.bpm / s.track.duration;
      if (!Number.isFinite(length) || length <= 0 || length > 1) return s;
      // Keep the full beat count near the end; never create a shortened loop.
      const start = Math.min(clamp01(a.position), 1 - length);
      return { ...rebase(s, start), loopIn:start, loopOut:start + length, loopEnabled:true };
    }
    case 'LOOP_IN':
      return s.track ? { ...rebase(s, a.position), loopIn: clamp01(a.position), loopOut: null, loopEnabled: false } : s;
    case 'LOOP_OUT': {
      if (!s.track) return s;
      const next = { ...s, loopOut: clamp01(a.position) };
      return validLoop(next) ? { ...rebase(next, next.loopIn!), loopEnabled: true } : s;
    }
    case 'TOGGLE_LOOP':
      if (!validLoop(s)) return s;
      if (s.loopEnabled) return { ...rebase(s, a.position), loopEnabled: false };
      return { ...rebase(s, a.position >= s.loopIn! && a.position < s.loopOut! ? a.position : s.loopIn!), loopEnabled: true };
    case 'CLEAR_LOOP': return { ...rebase(s, a.position), loopIn: null, loopOut: null, loopEnabled: false };
  }
}

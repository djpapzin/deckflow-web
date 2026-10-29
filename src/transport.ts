import type { DeckState } from './deck';

export type EqBand = 'eqLow' | 'eqMid' | 'eqHigh';
export type Action =
  | { type: 'LOAD'; track: DeckState['track'] }
  | { type: 'PLAY' | 'PAUSE' | 'END' }
  | { type: 'SEEK'; norm: number }
  | { type: 'SYNC'; norm: number; tempo: number }
  | { type: 'FOLLOW'; tempo: number }
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
        cueNorm: null, loopIn: null, loopOut: null, loopEnabled: false };
    case 'PLAY': return s.track ? { ...s, playing: true } : s;
    case 'PAUSE': return { ...s, playing: false };
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

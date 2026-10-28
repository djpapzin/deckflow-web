// Stereo time-stretch sources feed the existing Elementary mixer via four input channels.
import { el, type NodeRepr_t } from '@elemaudio/core';
import type { TrackData } from './track';

export interface DeckState {
  id: string;
  track: TrackData | null;
  playing: boolean;
  baseNorm: number; // normalized position of the last seek (0..1)
  seekGen: number; // bump to force the transport accumulator to reset
  tempo: number; // time-stretch playback rate
  keyLock: boolean; // preserve original pitch
  volume: number; // 0..1
  eqLow: number; // dB, -12..12
  eqMid: number; // dB, -12..12
  eqHigh: number; // dB, -12..12
  filterCutoff: number; // -1 (LPF down to 100Hz) .. 0 (bypass) .. 1 (HPF up to 10kHz)
  cueNorm: number | null;
  loopIn: number | null;
  loopOut: number | null;
  loopEnabled: boolean;
}

export function initialDeckState(id: string): DeckState {
  return {
    id,
    track: null,
    playing: false,
    baseNorm: 0,
    seekGen: 0,
    tempo: 1,
    keyLock: true,
    volume: 1,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    filterCutoff: 0,
    cueNorm: null,
    loopIn: null,
    loopOut: null,
    loopEnabled: false,
  };
}

export interface DeckSignal {
  left: NodeRepr_t;
  right: NodeRepr_t;
}

// Suffixes for this deck's analysis events, so the UI can route them by `source`.
export const METER_EVENT_SUFFIX = '_meter';

// DJ filter knob → cutoff frequencies. Center (0) bypasses (LPF 20kHz, HPF 20Hz);
// left sweeps the LPF down to 100Hz, right sweeps the HPF up to 10kHz.
export function filterCutoffs(cutoff: number): { lpf: number; hpf: number } {
  const lpf = cutoff < 0 ? 20000 * Math.pow(100 / 20000, Math.abs(cutoff)) : 20000;
  const hpf = cutoff > 0 ? 20 * Math.pow(10000 / 20, cutoff) : 20;
  return { lpf, hpf };
}

// One channel's chain: 3-band EQ → DJ filter → volume. The keyed consts are shared
// between the L and R chains (same key + value → one node), so a deck has one set of
// controls driving both channels.
function channelChain(sig: NodeRepr_t, s: DeckState): NodeRepr_t {
  const id = s.id;
  const fc = filterCutoffs(s.filterCutoff);

  let x = el.lowshelf(
    el.const({ value: 200 }),
    el.const({ value: 0.707 }),
    el.const({ key: `${id}_eqLow`, value: s.eqLow }),
    sig,
  );
  x = el.peak(
    el.const({ value: 1000 }),
    el.const({ value: 0.707 }),
    el.const({ key: `${id}_eqMid`, value: s.eqMid }),
    x,
  );
  x = el.highshelf(
    el.const({ value: 5000 }),
    el.const({ value: 0.707 }),
    el.const({ key: `${id}_eqHigh`, value: s.eqHigh }),
    x,
  );
  // Smoothed cutoffs so knob moves don't zipper.
  x = el.lowpass(
    el.smooth(el.tau2pole(0.02), el.const({ key: `${id}_lpf`, value: fc.lpf })),
    el.const({ value: 1.2 }),
    x,
  );
  x = el.highpass(
    el.smooth(el.tau2pole(0.02), el.const({ key: `${id}_hpf`, value: fc.hpf })),
    el.const({ value: 1.2 }),
    x,
  );
  return el.mul(x, el.const({ key: `${id}_vol`, value: s.volume }));
}

/**
 * Builds the deck's stereo signal from its current state, or null if no track is
 * loaded. Const nodes carry stable `key`s so re-rendering only nudges their values
 * (no graph rebuild, no clicks).
 */
export function buildDeckSignal(s: DeckState): DeckSignal | null {
  if (!s.track) return null;

  const channel = s.id === 'A' ? 0 : 2;
  const leftRaw = el.in({ channel });
  const rightRaw = el.in({ channel: channel + 1 });

  let left = channelChain(leftRaw, s);
  const right = channelChain(rightRaw, s);

  // Level meter on the post-fader left channel; passes audio through unchanged.
  left = el.meter({ key: `${s.id}_metertap`, name: `${s.id}${METER_EVENT_SUFFIX}` }, left);

  return { left, right };
}

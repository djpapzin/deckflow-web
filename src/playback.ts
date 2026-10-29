import type { DeckState } from './deck';
import type { StretchNode, StretchSchedule } from './vendor/SignalsmithStretch.mjs';

export interface Segment {
  output: number; input: number; rate: number; active: boolean; loopStart: number; loopEnd: number;
}
export function positionAt(s: Segment, time: number): number {
  let position = s.input + Math.max(0, time - s.output) * (s.active ? s.rate : 0);
  const length = s.loopEnd - s.loopStart;
  if (length > 0 && position >= s.loopStart) position = s.loopStart + ((position - s.loopStart) % length + length) % length;
  return position;
}

/** Audio-clock timeline shared by UI and sync; no wall-clock polling accumulator. */
export class DeckPlayer {
  private timeline: Segment[] = [{ output: 0, input: 0, rate: 1, active: false, loopStart: 0, loopEnd: 0 }];
  private companions: StretchNode[] = [];
  private preservePitch = true;
  setCompanions(nodes: StretchNode[], when = this.now()) {
    this.companions = nodes;
    const current = this.segment(when);
    for (const node of nodes) void node.schedule({ ...current, input: this.position(when), output: when, semitones: this.preservePitch ? 0 : 12 * Math.log2(current.rate) }).catch(error => { this.error = String(error); });
  }
  private signature = '';
  private seekGen = -1;
  duration = 0;
  error: string | null = null;
  constructor(readonly node: StretchNode, private now: () => number) {}
  segment(time = this.now()): Segment {
    return this.timeline.reduce((last, next) => next.output <= time ? next : last, this.timeline[0]);
  }
  position(time = this.now()): number { return positionAt(this.segment(time), time); }
  private send(change: StretchSchedule) {
    for (const node of [this.node, ...this.companions]) void node.schedule(change).catch(error => { this.error = String(error); });
  }
  async load(left: Float32Array, right: Float32Array, duration: number) {
    await this.node.schedule({ active: false, input: 0 });
    await this.node.dropBuffers();
    await this.node.addBuffers([left, right], [left.buffer as ArrayBuffer, right.buffer as ArrayBuffer]);
    this.duration = duration;
    this.timeline = [{ output: this.now(), input: 0, rate: 1, active: false, loopStart: 0, loopEnd: 0 }];
    this.signature = ''; this.seekGen = -1;
  }
  schedule(change: Partial<Segment>, when: number, preservePitch = true) {
    this.preservePitch = preservePitch;
    const current = this.segment(when);
    const next: Segment = { ...current, input: this.position(when), ...change, output: when };
    // Keep the active segment plus future changes; replace changes after this one.
    const now = this.now();
    const past = this.segment(now);
    this.timeline = [past, ...this.timeline.filter(s => s.output > now && s.output < when), next];
    this.send({ ...next, semitones: preservePitch ? 0 : 12 * Math.log2(next.rate) });
  }
  apply(state: DeckState, when: number, mode = 'free') {
    if (!state.track) return;
    const sig = JSON.stringify([state.track.pathL, state.playing, state.seekGen,
      state.tempo, state.loopEnabled, state.loopIn, state.loopOut, state.keyLock, mode]);
    if (sig === this.signature) return;
    const seek = state.seekGen !== this.seekGen;
    this.schedule({ ...(seek ? { input: state.baseNorm * state.track.duration } : {}),
      rate: state.tempo, active: state.playing,
      loopStart: state.loopEnabled ? (state.loopIn ?? 0) * state.track.duration : 0,
      loopEnd: state.loopEnabled ? (state.loopOut ?? 0) * state.track.duration : 0,
    }, when, state.keyLock);
    this.seekGen = state.seekGen; this.signature = sig;
  }
}

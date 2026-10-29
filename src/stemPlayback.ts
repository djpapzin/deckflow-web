import { stemGains, type StemMode } from './stemModes';
import SignalsmithStretch from './vendor/SignalsmithStretch.mjs';
import type { DeckPlayer } from './playback';
import type { StretchNode } from './vendor/SignalsmithStretch.mjs';

/** All stem versions use the same deck timeline; switching only changes gains. */
export class StemPlayback {
  private nodes: StretchNode[] = [];
  private gains: GainNode[] = [];
  private generation = 0;
  ready = false;
  constructor(private ctx: AudioContext, private output: GainNode, private original: GainNode, private player: DeckPlayer, private lookAhead: () => number) {}
  reset() {
    this.generation++; this.ready = false; this.player.setCompanions([]);
    for (const node of this.nodes) { void node.dispose(); node.disconnect(); }
    this.nodes = []; this.gains.forEach(g => g.disconnect()); this.gains = [];
    this.original.gain.cancelScheduledValues(this.ctx.currentTime); this.original.gain.setValueAtTime(1, this.ctx.currentTime);
  }
  async load(buffers: AudioBuffer[], generation: number) {
    const localGen = this.generation;
    const nodes: StretchNode[] = [], gains: GainNode[] = [];
    try {
      for (const buffer of buffers) {
        const node = await SignalsmithStretch(this.ctx, { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        nodes.push(node);
        const channels = [buffer.getChannelData(0).slice(), buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1)).slice()];
        await node.addBuffers(channels, channels.map(c => c.buffer as ArrayBuffer));
        const gain = this.ctx.createGain(); gain.gain.value = 0; gains.push(gain); node.connect(gain); gain.connect(this.output);
      }
      if (this.generation !== localGen || generation !== localGen) throw new Error('Track changed');
      this.nodes = nodes; this.gains = gains;
      this.player.setCompanions(nodes, this.ctx.currentTime + this.lookAhead()); this.ready = true;
    } catch (error) { nodes.forEach(n => { void n.dispose(); n.disconnect(); }); gains.forEach(g => g.disconnect()); throw error; }
  }
  token() { return this.generation; }
  select(mode: StemMode) {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    // The original is used for Full Mix, avoiding separation reconstruction artifacts.
    const values = stemGains(mode);
    [this.original, ...this.gains].forEach((gain, i) => { gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(values[i], now, .008); });
  }
}

/** A separate low-latency PCM path for touch scratching, sharing the deck mixer. */
export class ScratchPlayer {
  readonly node: AudioWorkletNode;
  private lastMove = 0;
  constructor(private ctx: AudioContext, private normalGain: GainNode, private latency: () => number) {
    this.node = new AudioWorkletNode(ctx, 'deckflow-scratch', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  }
  load(left: Float32Array, right: Float32Array) {
    const channels = [left.slice(), right.slice()];
    this.node.port.postMessage({ type: 'load', channels }, channels.map(c => c.buffer));
  }
  start(position: number) {
    const now = this.ctx.currentTime;
    this.normalGain.gain.cancelScheduledValues(now); this.normalGain.gain.setValueAtTime(0, now);
    this.lastMove = performance.now(); this.node.port.postMessage({ type: 'start', position });
  }
  move(position: number) {
    const now = performance.now();
    this.node.port.postMessage({ type: 'move', position, seconds: Math.max(.003, (now - this.lastMove) / 1000) });
    this.lastMove = now;
  }
  stop() {
    this.node.port.postMessage({ type: 'stop' });
    const now = this.ctx.currentTime;
    this.normalGain.gain.cancelScheduledValues(now);
    this.normalGain.gain.setValueAtTime(0, now);
    this.normalGain.gain.setValueAtTime(1, now + this.latency() + .04);
  }
}

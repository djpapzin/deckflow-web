// Direct PCM platter playback: movement changes speed AND pitch, including reverse.
class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.channels = []; this.position = 0; this.target = 0; this.remaining = 0; this.active = false;
    this.port.onmessage = ({data: d}) => {
      if (d.type === 'load') { this.channels = d.channels; this.active = false; }
      if (d.type === 'start') { this.position = this.target = d.position * sampleRate; this.remaining = 0; this.active = true; }
      if (d.type === 'move' && this.active) { this.target = d.position * sampleRate; this.remaining = Math.max(128, Math.min(.05, d.seconds) * sampleRate); }
      if (d.type === 'stop') this.active = false;
    };
  }
  process(_, outputs) {
    const output = outputs[0];
    for (let i = 0; i < output[0].length; i++) {
      const moving = this.active && this.remaining > 0;
      if (moving) { this.position += (this.target - this.position) / this.remaining; this.remaining--; }
      for (let ch = 0; ch < output.length; ch++) {
        const pcm = this.channels[ch]; const a = Math.floor(this.position), fraction = this.position - a;
        output[ch][i] = moving && pcm && a >= 0 && a + 1 < pcm.length ? pcm[a] * (1 - fraction) + pcm[a + 1] * fraction : 0;
      }
    }
    return true;
  }
}
registerProcessor('deckflow-scratch', ScratchProcessor);

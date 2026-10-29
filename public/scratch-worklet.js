// Direct PCM platter playback: movement changes speed AND pitch, including reverse.
class ScratchProcessor extends AudioWorkletProcessor {
  constructor() {
    super(); this.channels = []; this.stems = null; this.mix = [1,0,0,0,0]; this.position = 0; this.target = 0; this.remaining = 0; this.active = false; this.gain = 0;
    this.port.onmessage = ({data: d}) => {
      if (d.type === 'load') { this.channels = d.channels; this.stems = null; this.mix = [1,0,0,0,0]; this.active = false; this.gain = 0; }
      if (d.type === 'stems') this.stems = d.stems;
      if (d.type === 'mix') this.mix = d.gains;
      if (d.type === 'start') { this.position = this.target = d.position * sampleRate; this.remaining = 0; this.active = true; }
      if (d.type === 'move' && this.active) { this.target = d.position * sampleRate; this.remaining = Math.max(128, Math.min(.05, d.seconds) * sampleRate); }
      if (d.type === 'stop') this.active = false;
    };
  }
  process(_, outputs) {
    const output = outputs[0];
    for (let i = 0; i < output[0].length; i++) {
      const moving = this.active && this.remaining > 0 && Math.abs(this.target - this.position) > 1e-6;
      this.gain += Math.max(-1 / (sampleRate * .003), Math.min(1 / (sampleRate * .003), (moving ? 1 : 0) - this.gain));
      if (moving) { this.position += (this.target - this.position) / Math.max(1, this.remaining); this.remaining = Math.max(0, this.remaining - 1); }
      for (let ch = 0; ch < output.length; ch++) {
        const a = Math.floor(this.position), fraction = this.position - a;
        let value = 0;
        for (let source = 0; source < this.mix.length; source++) {
          if (!this.mix[source]) continue;
          const pcm = source === 0 ? this.channels[ch] : this.stems?.[source - 1]?.[ch];
          if (pcm && a >= 0 && a + 1 < pcm.length) value += (pcm[a] * (1 - fraction) + pcm[a + 1] * fraction) * this.mix[source];
        }
        output[ch][i] = value * this.gain;
      }
    }
    return true;
  }
}
registerProcessor('deckflow-scratch', ScratchProcessor);

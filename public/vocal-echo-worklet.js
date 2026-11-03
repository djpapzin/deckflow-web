class VocalEcho extends AudioWorkletProcessor {
  constructor() {
    super();
    this.history = [new Float32Array(sampleRate * 2), new Float32Array(sampleRate * 2)];
    this.position = 0;
    this.available = 0;
    this.tail = null;
    this.port.onmessage = ({ data }) => {
      if (data === 'clear') {
        this.available = 0;
        this.tail = null;
        return;
      }
      const size = Math.round(data.seconds * sampleRate);
      if (!Number.isFinite(size) || size < 1 || size > this.history[0].length) return;
      const start = this.position - size;
      this.tail = this.history.map(history => {
        const beat = new Float32Array(size);
        const fade = Math.min(Math.round(sampleRate * .005), size / 2);
        for (let i = Math.max(0, size - this.available); i < size; i++) {
          const gain = Math.min(1, i / fade, (size - 1 - i) / fade);
          beat[i] = history[(start + i + history.length) % history.length] * gain;
        }
        return beat;
      });
      this.elapsed = 0;
    };
  }

  process([input], [output]) {
    for (let i = 0; i < output[0].length; i++) {
      const size = this.tail?.[0].length ?? 0;
      const repeat = size ? Math.floor(this.elapsed / size) : 8;
      for (let ch = 0; ch < 2; ch++) {
        this.history[ch][this.position] = (input[ch] ?? input[0])?.[i] ?? 0;
        output[ch][i] = repeat < 8
          ? this.tail[ch][this.elapsed % size] * .52 * .48 ** repeat : 0;
      }
      this.position = (this.position + 1) % this.history[0].length;
      this.available = Math.min(this.available + 1, this.history[0].length);
      if (repeat < 8) this.elapsed++;
      else this.tail = null;
    }
    return true;
  }
}

registerProcessor('vocal-echo', VocalEcho);

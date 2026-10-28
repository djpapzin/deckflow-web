// Original synthesized practice loops; no network or music uploads required.
export function makeDemoTrack(deck: string): File {
  const sampleRate = 44100;
  const bpm = deck === 'A' ? 120 : 124;
  const duration = 64 * 60 / bpm;
  const count = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + count * 4);
  const view = new DataView(buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 2, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, count * 4, true);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const beat = (t * bpm / 60) % 1;
    const kick = Math.sin(2 * Math.PI * (48 * beat * 60 / bpm + 2 * (1 - Math.exp(-beat * 25)))) * Math.exp(-beat * 14) * 0.5;
    const note = [110, 130.81, 146.83, 98][Math.floor(t * bpm / 60 / 4) % 4] * (deck === 'A' ? 1 : 1.5);
    const bass = Math.sin(2 * Math.PI * note * t) * Math.exp(-beat * 5) * 0.16;
    const hatPhase = (t * bpm / 60 * 2) % 1;
    const hat = (Math.sin(t * 25391) + Math.sin(t * 31427)) * Math.exp(-hatPhase * 65) * 0.045;
    const fade = Math.min(1, t * 100, (duration - t) * 100);
    for (let channel = 0; channel < 2; channel++) {
      const sample = (kick + bass + hat * (channel ? 0.7 : 1)) * fade;
      view.setInt16(44 + i * 4 + channel * 2, Math.round(sample * 32767), true);
    }
  }
  return new File([buffer], `Practice ${deck} · ${bpm} BPM.wav`, { type: 'audio/wav' });
}

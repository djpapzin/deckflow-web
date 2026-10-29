/** Scrolling rhythm lanes keep the playhead centered, including at track edges. */
export function waveformView(total: number, fraction: number, position: number, scrolling: boolean) {
  const win = Math.max(1, Math.round(total * fraction));
  const center = position * total;
  const start = scrolling ? center - win / 2 : Math.max(0, Math.min(total - win, center - win / 2));
  return { start, win };
}

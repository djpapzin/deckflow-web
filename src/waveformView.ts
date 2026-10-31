/** Scrolling rhythm lanes keep the playhead centered, including at track edges. */
export function waveformView(total: number, fraction: number, position: number, scrolling: boolean) {
  const win = Math.max(1, Math.round(total * fraction));
  const center = position * total;
  const start = scrolling ? center - win / 2 : Math.max(0, Math.min(total - win, center - win / 2));
  return { start, win };
}

/** Fit both cue/loop badge rows inside compact rhythm canvases. */
export function markerLabelLayout(canvasHeight: number, row: number) {
  const height = Math.min(18, Math.max(1, Math.floor((canvasHeight - 6) / 2)));
  const fontSize = Math.min(11, Math.max(7, Math.floor(height * .7)));
  const top = 2 + row * (height + 2);
  return {height, fontSize, top, baseline:top + (height + fontSize)/2 - 1};
}

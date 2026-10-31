// Waveform — canvas waveform with playhead, click-to-seek, and scroll-to-zoom.
//
// Performance matters here: the playhead moves ~20x/sec, so redrawing the full
// thousands-of-segments waveform every tick would jank the main thread (and, paired
// with the audio worklet's event stream, can spiral into a crash). Instead we render
// the peaks ONCE to an offscreen bitmap, normalized to fill the height, and each frame
// just blit the visible slice of that bitmap and stroke one playhead line.
//
// Zoom: the mouse wheel shrinks/grows the visible fraction of the track; when zoomed
// in, the view follows the playhead (centered, clamped at the ends) — like the
// desktop app's scrolling waveform.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackPeaks } from '../track';
import type { BeatGrid } from '../bpmAnalysis';
import { waveformView, markerLabelLayout } from '../waveformView';

interface Props {
  peaks: TrackPeaks | null;
  position: number; // normalized 0..1
  onSeek: (norm: number) => void;
  cueNorm: number | null;
  loopIn: number | null;
  loopOut: number | null;
  loopEnabled: boolean;
  label: string;
  grid: BeatGrid | null;
  duration: number;
  color: string;
  hotCues?: (number | null)[];
  detailSeconds?: number;
}

const CACHE_HEIGHT = 256; // offscreen bitmap height; scaled to the canvas at blit time
const MIN_WINDOW = 0.02; // closest zoom: 2% of the track visible

export default function Waveform({ peaks, position, onSeek, cueNorm, loopIn, loopOut, loopEnabled, label, grid, duration, color, hotCues = [], detailSeconds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<HTMLCanvasElement | null>(null);
  const [windowFrac, setWindowFrac] = useState(1); // fraction of track visible (1 = all)

  // Reset to the full-track view whenever a new track loads.
  useEffect(() => {
    setWindowFrac(detailSeconds && duration ? Math.min(1, detailSeconds / duration) : 1);
  }, [peaks, detailSeconds, duration]);

  // Render the peaks to an offscreen bitmap, normalized so the loudest peak fills the
  // height. Rebuilt only when the peaks change — not per frame.
  useEffect(() => {
    if (!peaks) {
      cacheRef.current = null;
      return;
    }
    const w = peaks.buckets;
    let off = cacheRef.current;
    if (!off) {
      off = document.createElement('canvas');
      cacheRef.current = off;
    }
    off.width = w;
    off.height = CACHE_HEIGHT;
    const c = off.getContext('2d');
    if (!c) return;

    let peak = 0;
    for (let i = 0; i < w; i++) {
      const m = Math.max(Math.abs(peaks.min[i]), Math.abs(peaks.max[i]));
      if (m > peak) peak = m;
    }
    const norm = peak > 0 ? 1 / peak : 1;
    const mid = CACHE_HEIGHT / 2;

    c.clearRect(0, 0, w, CACHE_HEIGHT);
    c.strokeStyle = color;
    c.beginPath();
    for (let x = 0; x < w; x++) {
      c.moveTo(x + 0.5, mid - peaks.min[x] * norm * mid);
      c.lineTo(x + 0.5, mid - peaks.max[x] * norm * mid);
    }
    c.stroke();
  }, [peaks, color]);

  // The visible bucket window, centered on the playhead and clamped to the track.
  const windowFor = useCallback(
    (totalBuckets: number) => {
      return waveformView(totalBuckets, windowFrac, position, !!detailSeconds);
    },
    [position, windowFrac, detailSeconds],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const cache = cacheRef.current;
    if (!cache) {
      ctx.strokeStyle = '#2b303d';
      ctx.beginPath();
      ctx.moveTo(0, cssH / 2);
      ctx.lineTo(cssW, cssH / 2);
      ctx.stroke();
      return;
    }

    const total = cache.width;
    const { start, win } = windowFor(total);

    // Blit just the visible slice, scaled to the canvas.
    const sourceStart = Math.max(0, start);
    const sourceEnd = Math.min(total, start + win);
    if (sourceEnd > sourceStart) ctx.drawImage(cache, sourceStart, 0, sourceEnd - sourceStart, cache.height,
      (sourceStart - start) / win * cssW, 0, (sourceEnd - sourceStart) / win * cssW, cssH);

    const xFor = (norm: number) => ((norm * total - start) / win) * cssW;
    if (grid && duration > 0) {
      const period = 60 / grid.bpm;
      const startSec = start / total * duration;
      const endSec = (start + win) / total * duration;
      const first = Math.ceil((startSec - grid.offset) / period);
      // Thin dense grids when zoomed out; limit work to visible beats.
      const step = Math.max(1, Math.ceil((endSec - startSec) / period / (cssW / 9)));
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let n = first; grid.offset + n * period <= endSec; n += step) {
        const x = xFor((grid.offset + n * period) / duration);
        ctx.moveTo(x, 0); ctx.lineTo(x, cssH);
      }
      ctx.stroke();
    }
    if (loopIn !== null && loopOut !== null) {
      const x0 = Math.max(0, xFor(loopIn));
      const x1 = Math.min(cssW, xFor(loopOut));
      ctx.fillStyle = loopEnabled ? '#5ce7b433' : '#5ce7b412';
      ctx.fillRect(x0, 0, Math.max(0, x1 - x0), cssH);
    }
    const marker = (norm: number | null, text: string, color: string, row: number) => {
      if (norm === null) return;
      const x = xFor(norm);
      if (x < 0 || x > cssW) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssH); ctx.stroke();
      const badge = markerLabelLayout(cssH, row);
      ctx.font = `bold ${badge.fontSize}px system-ui`;
      const width = ctx.measureText(text).width + 10;
      const left = Math.min(cssW - width, Math.max(0, x));
      ctx.fillStyle = color;
      ctx.fillRect(left, badge.top, width, badge.height);
      ctx.fillStyle = '#11131a';
      ctx.fillText(text, left + 5, badge.baseline);
    };
    marker(loopIn, 'IN', '#5ce7b4', 0);
    marker(loopOut, 'OUT', '#5ce7b4', 0);
    marker(cueNorm, 'CUE', '#ffd47a', 1);
    hotCues.forEach((cue, i) => marker(cue, String(i + 1), color, 0));

    // Playhead at its true position within the visible window.
    const playX = ((position * total - start) / win) * cssW;
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, cssH);
    ctx.stroke();
  }, [position, windowFor, peaks, cueNorm, loopIn, loopOut, loopEnabled, grid, duration, hotCues, color]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw]);

  // Wheel zoom — attached natively so we can preventDefault (React's onWheel is passive).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      setWindowFrac((f) => Math.max(MIN_WINDOW, Math.min(1, f * factor)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cache = cacheRef.current;
    if (!cache) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const total = cache.width;
    const { start, win } = windowFor(total);
    onSeek((start + frac * win) / total);
  };

  return <canvas ref={canvasRef} className="waveform" onClick={handleClick}
    role="slider" tabIndex={peaks ? 0 : -1} aria-label={label} aria-valuemin={0}
    aria-valuemax={100} aria-valuenow={Math.round(position * 100)}
    aria-valuetext={`${Math.round(position * 100)} percent through track`}
    onKeyDown={(e) => {
      if (!peaks) return;
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        onSeek(e.key === 'Home' ? 0 : e.key === 'End' ? 1 :
          Math.max(0, Math.min(1, position + (e.key === 'ArrowRight' ? 0.01 : -0.01))));
      }
    }} />;
}

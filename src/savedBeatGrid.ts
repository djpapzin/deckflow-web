import type { BeatGrid } from './bpmAnalysis';
const PREFIX = 'deckflow:manual-grid:v1:';
const LIMIT = 100;
export async function beatGridKey(file: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join('');
  } catch { return null; }
}
export function readBeatGrid(key: string | null, duration: number): BeatGrid | null {
  if (!key) return null;
  try {
    const value = JSON.parse(localStorage.getItem(PREFIX + key) || 'null');
    return value && Number.isFinite(value.bpm) && value.bpm >= 30 && value.bpm <= 300 &&
      Number.isFinite(value.offset) && value.offset >= 0 && value.offset <= duration
      ? { bpm:value.bpm, offset:value.offset, confidence:1 } : null;
  } catch { return null; }
}
export function saveBeatGrid(key: string | null, grid: BeatGrid) {
  if (!key) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({...grid, savedAt:Date.now()}));
    const entries = Array.from({length:localStorage.length}, (_,i) => localStorage.key(i))
      .filter((k): k is string => !!k?.startsWith(PREFIX));
    entries.sort((a,b) => {
      const timestamp = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || '{}').savedAt || 0; } catch { return 0; } };
      return timestamp(a)-timestamp(b);
    });
    for (const old of entries.slice(0,Math.max(0,entries.length-LIMIT))) localStorage.removeItem(old);
  } catch { /* Private browsing or full storage must not block mixing. */ }
}

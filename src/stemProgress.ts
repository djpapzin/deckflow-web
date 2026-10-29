export type StemQuality = 'fast' | 'best';
/** Local CPU measurements: 45s demo and uncached 257.04s full song.
 * Interpolate between them; beyond the full song, use its measured rate.
 * Best Quality scales differently from Fast, so never simply double Fast.
 */
export function estimateStemSeconds(duration: number, quality: StemQuality = 'best'): number {
  const seconds = Number.isFinite(duration) ? Math.max(0, duration) : 0;
  const shortDuration = 45, fullDuration = 257.04;
  const shortTime = quality === 'fast' ? 13.7 : 24.4;
  const fullTime = quality === 'fast' ? 85.6 : 283;
  let processing: number;
  if (seconds <= shortDuration) processing = seconds * shortTime / shortDuration;
  else if (seconds < fullDuration) {
    processing = shortTime + (seconds - shortDuration) / (fullDuration - shortDuration) * (fullTime - shortTime);
  } else processing = seconds * fullTime / fullDuration;
  return Math.ceil(Math.max(10, processing + 8));
}
export function stemCountdown(estimate: number, elapsed: number): string {
  const remaining = Math.max(0, Math.ceil(estimate - elapsed));
  if (!remaining) return 'Taking longer than estimated · still separating…';
  return `Separating stems · estimated ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining`;
}

export type StemQuality = 'fast' | 'best';
/** Measured 45-second demo: Fast 13.7s, Best 24.4s, plus startup margin. */
export function estimateStemSeconds(duration: number, quality: StemQuality = 'best'): number {
  return Math.ceil(Math.max(10, duration * (quality === 'fast' ? 13.7 / 45 : 24.4 / 45) + 8));
}
export function stemCountdown(estimate: number, elapsed: number): string {
  const remaining = Math.max(0, Math.ceil(estimate - elapsed));
  if (!remaining) return 'Taking longer than estimated · still separating…';
  return `Separating stems · estimated ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining`;
}

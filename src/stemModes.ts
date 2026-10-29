export const STEM_MODES = [
  { id: 'full', label: 'FULL MIX' },
  { id: 'instrumental', label: 'INSTRUMENTAL' },
  { id: 'acapella', label: 'ACAPELLA' },
  { id: 'vocal-reprise', label: 'VOCAL REPRISE' },
  { id: 'instrumental-reprise', label: 'INSTRUMENTAL REPRISE' },
] as const;
export type StemMode = typeof STEM_MODES[number]['id'];
/** Original, vocals, drums, bass, other. Reprises retain bass and melody. */
export function stemGains(mode: StemMode): number[] {
  switch (mode) {
    case 'full': return [1,0,0,0,0];
    case 'instrumental': return [0,0,1,1,1];
    case 'acapella': return [0,1,0,0,0];
    case 'vocal-reprise': return [0,1,0,1,1];
    case 'instrumental-reprise': return [0,0,0,1,1];
  }
}

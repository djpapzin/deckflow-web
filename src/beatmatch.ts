export interface SyncDeck {
  bpm: number; offset: number; duration: number; position: number; tempo: number;
}
export function syncSettings(target: SyncDeck, reference: SyncDeck) {
  const tempo = reference.bpm * reference.tempo / target.bpm;
  if (!Number.isFinite(tempo) || tempo < .5 || tempo > 1.5) return null;
  const beat = (reference.position * reference.duration - reference.offset) * reference.bpm / 60;
  const fraction = ((beat % 1) + 1) % 1;
  const ownBeat = (target.position * target.duration - target.offset) * target.bpm / 60;
  const n = Math.round(ownBeat - fraction);
  let seconds = target.offset + (n + fraction) * 60 / target.bpm;
  if (seconds < 0) seconds += 60 / target.bpm;
  if (seconds >= target.duration) seconds -= 60 / target.bpm;
  if (seconds < 0 || seconds >= target.duration) return null;
  return { tempo, norm: seconds / target.duration };
}

/** Small errors use a bounded tempo nudge; large discontinuities realign once. */
export function driftCorrection(baseRate: number, errorSeconds: number, playing: boolean, force = false) {
  if (force || Math.abs(errorSeconds) > .08 || (!playing && Math.abs(errorSeconds) > .004)) {
    return { seek: true, rate: baseRate };
  }
  const nudge = Math.abs(errorSeconds) < .004 ? 0 : Math.max(-.015, Math.min(.015, errorSeconds * 2));
  return { seek: false, rate: Math.max(.5, Math.min(1.5, baseRate * (1 + nudge))) };
}

/** Match both decks at the same future audio-clock instant, not at click time. */
export function synchronizePlayers(
  target: { bpm: number; offset: number; duration: number; tempo: number; playing: boolean },
  reference: { bpm: number; offset: number; duration: number; tempo: number; playing: boolean },
  targetPlayer: { position(time: number): number; schedule(change: { input?: number; rate: number }, when: number, preservePitch: boolean): void },
  referencePlayer: { position(time: number): number },
  when: number,
  preservePitch: boolean,
) {
  const settings = syncSettings(
    { ...target, position: targetPlayer.position(when) / target.duration },
    { ...reference, position: referencePlayer.position(when) / reference.duration },
  );
  if (!settings) return null;
  targetPlayer.schedule({ rate: settings.tempo,
    ...(target.playing && reference.playing ? { input: settings.norm * target.duration } : {}) }, when, preservePitch);
  return settings;
}

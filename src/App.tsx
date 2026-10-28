import { useCallback, useEffect, useRef, useState } from 'react';
import { el } from '@elemaudio/core';
import { initAudio, getRuntime } from './audio';
import { buildDeckSignal } from './deck';
import { useDeck } from './useDeck';
import DeckPanel from './components/DeckPanel';
import DeckControls from './components/DeckControls';
import Mixer from './components/Mixer';
import { syncSettings, driftCorrection } from './beatmatch';

// P3 — two decks + a crossfader + master volume: the actual mixer.
//
// Each deck builds its own stereo signal (deck.ts); App combines them here with an
// equal-power crossfade (matching the desktop graph) and a master gain, then renders
// the single output. One render effect owns the whole graph, so Elementary diffs the
// combined tree on every state change and only nudges the consts that moved.

export default function App() {
  const [audioReady, setAudioReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deckA = useDeck('A', audioReady);
  const deckB = useDeck('B', audioReady);

  const [crossfader, setCrossfader] = useState(0); // -1 full A .. +1 full B
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [syncMessage, setSyncMessage] = useState('Play a deck, then press Sync on the other to lock it to the leader.');
  const [lock, setLock] = useState<{ follower: string; aTrack: string; bTrack: string; token: number } | null>(null);
  const lastAligned = useRef<number | null>(null);
  const latest = useRef({ deckA, deckB, lock });
  latest.current = { deckA, deckB, lock };
  const sync = (follower: string) => {
    if (lock?.follower === follower) {
      setLock(null); setSyncMessage('Sync unlocked. Both decks now have independent transport and tempo.'); return;
    }
    if (!deckA.grid || !deckB.grid || !deckA.state.track || !deckB.state.track) return;
    setLock({ follower, aTrack: deckA.state.track.pathL, bTrack: deckB.state.track.pathL, token: performance.now() });
    setSyncMessage(`Deck ${follower} is locked to Deck ${follower === 'A' ? 'B' : 'A'}. Change the leader’s tempo or press its Play/Pause. Press the lit Sync button to unlock.`);
  };

  // Both sources use one AudioContext clock and the same scheduled change time.
  // The interval is a drift watchdog; it does not advance the audio transport.
  const updatePlayback = useCallback(() => {
    const rt = getRuntime();
    if (!rt) return;
    const { deckA: a, deckB: b, lock: currentLock } = latest.current;
    let activeLock = currentLock;
    const follower = currentLock?.follower === 'A' ? a : b;
    const leader = currentLock?.follower === 'A' ? b : a;
    if (currentLock && (a.state.track?.pathL !== currentLock.aTrack || b.state.track?.pathL !== currentLock.bTrack || !a.grid || !b.grid)) {
      activeLock = null; setLock(null); setSyncMessage('Sync unlocked because a track or beat grid changed.');
    }
    const rate = activeLock && leader.grid && follower.grid
      ? leader.grid.bpm * leader.state.tempo / follower.grid.bpm : null;
    if (activeLock && rate !== null && (rate < .5 || rate > 1.5)) {
      activeLock = null; setLock(null); setSyncMessage('Sync unlocked: the required tempo is outside ±50%. Check BPM or use ×2 / ÷2.');
    }
    if (activeLock && follower.state.track && rt.players[follower.state.id].position() >= follower.state.track.duration) {
      activeLock = null; setLock(null); setSyncMessage('Sync unlocked: the follower reached the end of its track.');
    }
    const when = rt.ctx.currentTime + rt.lookAhead;
    for (const deck of [a, b]) {
      const effective = activeLock?.follower === deck.state.id && rate !== null
        ? { ...deck.state, tempo: rate, playing: leader.state.playing, loopEnabled: false } : deck.state;
      rt.players[deck.state.id].apply(effective, when, activeLock?.follower ?? 'free');
      if (activeLock?.follower === deck.state.id && rate !== null) deck.follow(rate, leader.state.playing);
      if (rt.players[deck.state.id].error) setError(rt.players[deck.state.id].error);
    }
    if (!activeLock || rate === null || !follower.grid || !leader.grid || !follower.state.track || !leader.state.track) return;
    const targetPlayer = rt.players[follower.state.id], referencePlayer = rt.players[leader.state.id];
    const targetPosition = targetPlayer.position(when);
    const settings = syncSettings(
      { ...follower.grid, duration: follower.state.track.duration, position: targetPosition / follower.state.track.duration, tempo: rate },
      { ...leader.grid, duration: leader.state.track.duration, position: referencePlayer.position(when) / leader.state.track.duration, tempo: leader.state.tempo },
    );
    if (!settings) return;
    const errorSeconds = settings.norm * follower.state.track.duration - targetPosition;
    const correction = driftCorrection(rate, errorSeconds, leader.state.playing, lastAligned.current !== activeLock.token);
    const segment = targetPlayer.segment(when);
    if (correction.seek || Math.abs(segment.rate - correction.rate) > .00005) {
      targetPlayer.schedule({ ...(correction.seek ? { input: settings.norm * follower.state.track.duration } : {}),
        rate: correction.rate }, when, follower.state.keyLock);
    }
    lastAligned.current = activeLock.token;
  }, []);

  useEffect(() => {
    if (!audioReady) return;
    updatePlayback();
  }, [audioReady, deckA.state, deckB.state, deckA.grid, deckB.grid, lock, updatePlayback]);
  useEffect(() => {
    if (!audioReady) return;
    const timer = window.setInterval(updatePlayback, 100);
    return () => window.clearInterval(timer);
  }, [audioReady, updatePlayback]);

  // Boots the AudioContext + WebRenderer once, on the first deck's load gesture.
  const ensureAudio = useCallback(async () => {
    await initAudio();
    setAudioReady(true);
  }, []);

  // The whole graph: (A·gainA + B·gainB)·master, per channel.
  useEffect(() => {
    if (!audioReady) return;
    const rt = getRuntime();
    if (!rt) return;

    const silence = el.const({ value: 0 });
    const a = buildDeckSignal(deckA.state);
    const b = buildDeckSignal(deckB.state);
    const aL = a?.left ?? silence;
    const aR = a?.right ?? silence;
    const bL = b?.left ?? silence;
    const bR = b?.right ?? silence;

    // Equal-power crossfade: at center both decks sit at ~0.707 (constant power).
    const t = (crossfader + 1) / 2;
    const gainA = el.const({ key: 'xfade_a', value: Math.cos(t * Math.PI * 0.5) });
    const gainB = el.const({ key: 'xfade_b', value: Math.sin(t * Math.PI * 0.5) });
    const master = el.const({ key: 'master_vol', value: masterVolume });

    const outL = el.mul(el.add(el.mul(aL, gainA), el.mul(bL, gainB)), master);
    const outR = el.mul(el.add(el.mul(aR, gainA), el.mul(bR, gainB)), master);

    rt.core.render(outL, outR).catch((e) => setError(String(e)));
  }, [audioReady, deckA.state, deckB.state, crossfader, masterVolume]);

  return (
    <main className="app">
      <header className="topbar">
        <h1>DeckFlow Web</h1>
        <span className="subtitle">Two decks. Your mix.</span>
        <span className="build-badge">CODEX LAB · BEATMATCH</span>
      </header>
      <p className="intro">Load a track or try the demos. Click the waveform to seek; scroll to zoom.
        Key Lock preserves pitch while tempo changes. Your audio stays on this device.</p>
      <p className="sync-status" role="status">{syncMessage}</p>

      <div className="decks">
        <DeckPanel deck={deckA} label="Deck A" ensureAudio={ensureAudio}
          canSync={!!deckA.grid && !!deckB.grid} onSync={() => sync('A')} syncLocked={lock?.follower === 'A'} leader={lock?.follower === 'A' ? 'B' : undefined} />
        <DeckPanel deck={deckB} label="Deck B" ensureAudio={ensureAudio}
          canSync={!!deckA.grid && !!deckB.grid} onSync={() => sync('B')} syncLocked={lock?.follower === 'B'} leader={lock?.follower === 'B' ? 'A' : undefined} />
      </div>

      <div className="console">
        <DeckControls deck={deckA} tempoLocked={lock?.follower === 'A'} />
        <Mixer
          crossfader={crossfader}
          setCrossfader={setCrossfader}
          masterVolume={masterVolume}
          setMasterVolume={setMasterVolume}
        />
        <DeckControls deck={deckB} tempoLocked={lock?.follower === 'B'} />
      </div>

      {error && <p className="error">{error}</p>}
    </main>
  );
}

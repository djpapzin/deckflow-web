import { useCallback, useEffect, useRef, useState } from 'react';
import { el } from '@elemaudio/core';
import { initAudio, getRuntime } from './audio';
import { buildDeckSignal } from './deck';
import { useDeck } from './useDeck';
import DeckPanel from './components/DeckPanel';
import Waveform from './components/Waveform';
import { isTransportSpace } from './keyboard';
import DeckControls from './components/DeckControls';
import Mixer from './components/Mixer';
import TrackBrowser, { fileId, type SessionTrack } from './components/TrackBrowser';
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

  const [library, setLibrary] = useState<SessionTrack[]>([]);
  const [loadedIds, setLoadedIds] = useState<Record<string,string>>({});
  const remember = (file: File, demo = false, deck?: string) => {
    const id = fileId(file);
    setLibrary(current => current.some(t => t.id === id) ? current : [...current, { id, file, demo }]);
    if (deck) setLoadedIds(current => ({ ...current, [deck]: id }));
  };
  const libraryInfo: Record<string, {bpm?:number; duration?:number; decks:string}> = {};
  for (const deck of [deckA, deckB]) {
    const id = loadedIds[deck.state.id];
    if (id && deck.state.track) libraryInfo[id] = { bpm: deck.grid?.bpm, duration: deck.state.track.duration,
      decks: [libraryInfo[id]?.decks, deck.state.id].filter(Boolean).join(' / ') };
  }

  const [selectedDeck, setSelectedDeck] = useState('A');
  const keyboardDeck = useRef(deckA);
  keyboardDeck.current = selectedDeck === 'A' ? deckA : deckB;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isTransportSpace(event)) return;
      event.preventDefault();
      void keyboardDeck.current.togglePlay().catch(err => setError(String(err)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const [crossfader, setCrossfader] = useState(0); // -1 full A .. +1 full B
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [syncMessage, setSyncMessage] = useState('Sync matches once. Beat Lock keeps the other deck following. Play each deck yourself.');
  const [lock, setLock] = useState<{ follower: string; aTrack: string; bTrack: string; token: number } | null>(null);
  const lastAligned = useRef<number | null>(null);
  const latest = useRef({ deckA, deckB, lock });
  latest.current = { deckA, deckB, lock };
  const beatLock = (follower: string) => {
    if (lock?.follower === follower) {
      setLock(null); setSyncMessage('Sync unlocked. Both decks now have independent transport and tempo.'); return;
    }
    if (!deckA.grid || !deckB.grid || !deckA.state.track || !deckB.state.track) return;
    setLock({ follower, aTrack: deckA.state.track.pathL, bTrack: deckB.state.track.pathL, token: performance.now() });
    setSyncMessage(`Deck ${follower} is locked to Deck ${follower === 'A' ? 'B' : 'A'}. Tempo follows the leader. Play and pause each deck yourself; Sync never starts a track. Press Beat Lock again to unlock.`);
  };

  const sync = (id: string) => {
    const target = id === 'A' ? deckA : deckB;
    const reference = id === 'A' ? deckB : deckA;
    if (!target.grid || !reference.grid || !target.state.track || !reference.state.track) return;
    const settings = syncSettings(
      { ...target.grid, duration: target.state.track.duration, position: target.readPosition(), tempo: target.state.tempo },
      { ...reference.grid, duration: reference.state.track.duration, position: reference.readPosition(), tempo: reference.state.tempo });
    if (!settings) { setSyncMessage('Cannot match within ±50%. Check track BPM or use ×2 / ÷2.'); return; }
    target.syncTo(target.state.playing && reference.state.playing ? settings.norm : target.readPosition(), settings.tempo);
    setSyncMessage(`Deck ${id} matched to Deck ${reference.state.id}. Playback stays independent. Use Beat Lock for continuous following.`);
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
        ? { ...deck.state, tempo: rate, loopEnabled: false } : deck.state;
      rt.players[deck.state.id].apply(effective, when, activeLock?.follower ?? 'free');
      if (activeLock?.follower === deck.state.id && rate !== null) deck.follow(rate);
      if (rt.players[deck.state.id].error) setError(rt.players[deck.state.id].error);
    }
    if (!activeLock || rate === null || !follower.grid || !leader.grid || !follower.state.track || !leader.state.track) return;
    const targetPlayer = rt.players[follower.state.id], referencePlayer = rt.players[leader.state.id];
    if (!follower.state.playing || !leader.state.playing) {
      // Sync changes tempo only until both transports are playing. Never start,
      // stop, or move a paused deck; clear any temporary phase-correction nudge.
      if (Math.abs(targetPlayer.segment(when).rate - rate) > .00005) {
        targetPlayer.schedule({ rate }, when, follower.state.keyLock);
      }
      lastAligned.current = null;
      return;
    }
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
        <h1>DECK<span>FLOW</span></h1>
        <span className="subtitle">DIGITAL MIXING CONSOLE</span>
        <span className="build-badge">CLASSIC MIX · 2 DECKS</span>
      </header>
      <p className="intro">Load your tracks, or try the demos. Music stays on your device.</p>
      <p className="sync-status" role="status">{syncMessage}</p>

      <section className="rhythm-display" aria-label="Moving deck waveforms">
        {[deckA, deckB].map(deck => <div key={deck.state.id} className={`rhythm-lane rhythm-${deck.state.id}`}>
          <button className="btn ghost" aria-pressed={selectedDeck === deck.state.id} onClick={() => setSelectedDeck(deck.state.id)}>DECK {deck.state.id}</button>
          <Waveform peaks={deck.state.track?.peaks ?? null} position={deck.position} onSeek={deck.seek}
            cueNorm={deck.state.cueNorm} hotCues={deck.state.hotCues} loopIn={deck.state.loopIn} loopOut={deck.state.loopOut}
            loopEnabled={deck.state.loopEnabled} label={`Deck ${deck.state.id} scrolling rhythm waveform`}
            grid={deck.grid} duration={deck.state.track?.duration ?? 0} detailSeconds={8 * deck.state.tempo}
            color={deck.state.id === 'A' ? '#36a9ff' : '#ff5265'} />
        </div>)}
      </section>
      <div className="console-viewport"><div className="performance-console">
        <DeckPanel deck={deckA} label="Deck A" ensureAudio={ensureAudio} onRemember={(file,demo) => remember(file,demo,'A')}
          canSync={!!deckA.grid && !!deckB.grid} selected={selectedDeck === 'A'} onSelect={() => setSelectedDeck('A')} onSync={() => sync('A')} onBeatLock={() => beatLock('A')} syncLocked={lock?.follower === 'A'} leader={lock?.follower === 'A' ? 'B' : undefined} />
        <section className="central-mixer" aria-label="Central mixer">
          <div className="mixer-title">MIXER <span>STEREO</span></div>
          <div className="channel-strips"><DeckControls deck={deckA} /><DeckControls deck={deckB} /></div>
          <Mixer crossfader={crossfader} setCrossfader={setCrossfader} masterVolume={masterVolume} setMasterVolume={setMasterVolume} />
        </section>
        <DeckPanel deck={deckB} label="Deck B" ensureAudio={ensureAudio} onRemember={(file,demo) => remember(file,demo,'B')}
          canSync={!!deckA.grid && !!deckB.grid} selected={selectedDeck === 'B'} onSelect={() => setSelectedDeck('B')} onSync={() => sync('B')} onBeatLock={() => beatLock('B')} syncLocked={lock?.follower === 'B'} leader={lock?.follower === 'B' ? 'A' : undefined} />
      </div></div>
      <TrackBrowser tracks={library} addFiles={files => files.forEach(file => remember(file))} info={libraryInfo}
        load={async (entry, id) => { await ensureAudio(); await (id === 'A' ? deckA : deckB).load(entry.file); remember(entry.file,entry.demo,id); }} />
      <footer className="console-help"><span>LOCAL AUDIO · KEY LOCK · CONTINUOUS SYNC</span><span>Hold + drag a platter to scratch · Space: selected deck play/pause</span></footer>

      {error && <p className="error">{error}</p>}
    </main>
  );
}

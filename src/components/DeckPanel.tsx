// DeckPanel — everything for one deck: load button, track name, waveform, the mixer
// strip (DeckControls), and transport. Driven by a UseDeck, so deck A and deck B are
// the same component with different state.

import { useRef, useState } from 'react';
import type { UseDeck } from '../useDeck';
import Waveform from './Waveform';
import { makeDemoTrack } from '../demo';
import JogWheel from './JogWheel';
import TempoControl from './TempoControl';
import { validLoop } from '../transport';

interface Props {
  deck: UseDeck;
  label: string;
  ensureAudio: () => Promise<void>; // boots the AudioContext on first user gesture
  canSync: boolean;
  onSync: () => void;
  syncLocked: boolean;
  leader?: string;
  onRemember: (file: File, demo: boolean) => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DeckPanel({ deck, label, ensureAudio, canSync, onSync, syncLocked, leader, onRemember }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File, demo = false) => {
    setError(null);
    setLoading(true);
    try {
      await ensureAudio();
      await deck.load(file);
      onRemember(file, demo);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
  };

  const { track } = deck.state;

  return (
    <section className={`deck deck-${deck.state.id}`} aria-label={label}>
      <header className="deck-head">
        <span className="deck-label"><b>{deck.state.id}</b> {label.toUpperCase()}</span>
        <button className="btn ghost" onClick={() => void loadFile(makeDemoTrack(deck.state.id), true)} disabled={loading}>
          DEMO
        </button>
        <button className="btn ghost" onClick={() => fileInputRef.current?.click()} disabled={loading}>
          {loading ? 'Loading…' : 'LOAD TRACK'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          aria-label={`Load audio into ${label}`}
          accept="audio/*,.wav,.mp3,.flac,.aiff,.aif"
          onChange={onPickFile}
          hidden
        />
      </header>

      <div className="track-display">
        <div className="track-name" title={track?.name}>{track ? track.name : 'LOAD A TRACK TO BEGIN'}</div>
        <div className="track-stats">
          <div className="bpm-display"><strong>{deck.grid ? (deck.grid.bpm * deck.state.tempo).toFixed(1) : '—'}</strong><span>BPM</span></div>
          <div className="track-time"><small>ELAPSED</small><strong>{track ? fmt(deck.position * track.duration) : '0:00'}</strong></div>
          <div className="track-time remaining"><small>REMAIN</small><strong>−{track ? fmt((1 - deck.position) * track.duration) : '0:00'}</strong></div>
        </div>
        <span className="analysis-status">{syncLocked ? `SYNC LOCKED · FOLLOWING ${leader}` : deck.analysisStatus === 'analyzing' ? 'ANALYZING BPM…' :
          deck.analysisStatus === 'unknown' ? 'NO STEADY BEAT · SET BPM BELOW' :
          deck.analysisStatus === 'manual' ? 'MANUAL BEAT GRID' : deck.grid ? 'AUTO BPM · BEAT GRID READY' : 'LOCAL AUDIO · NO UPLOADS'}</span>
      </div>
      <div className="waveform-wrap">
        <Waveform peaks={track?.peaks ?? null} position={deck.position} onSeek={deck.seek}
          cueNorm={deck.state.cueNorm} loopIn={deck.state.loopIn} loopOut={deck.state.loopOut}
          loopEnabled={deck.state.loopEnabled} label={`${label} waveform`}
          grid={deck.grid} duration={track?.duration ?? 0} color={deck.state.id === 'A' ? '#36a9ff' : '#ff5265'} />
      </div>

      <div className="deck-workbench"><TempoControl deck={deck} locked={syncLocked} />
        <div className="deck-utility">      <div className="cue-tools"><button className="btn ghost" onClick={deck.setCue} disabled={!track}>SET CUE</button>
        <span>{deck.state.cueNorm !== null && track ? `Cue ${fmt(deck.state.cueNorm * track.duration)}` : 'Choose a position, then set cue'}</span></div>

      <div className="loop-controls" role="group" aria-label={`${label} loop controls`}>
        <span className="control-caption">MANUAL LOOP</span>
        <button className="btn ghost" disabled={!track || syncLocked} onClick={() => deck.loopAction('LOOP_IN')}>In</button>
        <button className="btn ghost" disabled={!track || syncLocked || deck.state.loopIn === null ||
          deck.position - deck.state.loopIn < Math.min(0.01 / track.duration, 1)}
          onClick={() => deck.loopAction('LOOP_OUT')}>Out</button>
        <button className={`btn ghost ${deck.state.loopEnabled ? 'active' : ''}`}
          disabled={syncLocked || !validLoop(deck.state)} aria-pressed={deck.state.loopEnabled}
          onClick={() => deck.loopAction('TOGGLE_LOOP')}>{deck.state.loopEnabled ? 'Exit loop' : 'Enable loop'}</button>
        <button className="btn ghost" disabled={deck.state.loopIn === null}
          onClick={() => deck.loopAction('CLEAR_LOOP')}>Clear</button>
        <span className="marker-readout">
          {deck.state.loopIn !== null && track ? `IN ${fmt(deck.state.loopIn * track.duration)}` : 'Set In, then Out'}
          {deck.state.loopOut !== null && track ? ` · OUT ${fmt(deck.state.loopOut * track.duration)}` : ''}
          {deck.state.cueNorm !== null && track ? ` · CUE ${fmt(deck.state.cueNorm * track.duration)}` : ''}
        </span>
      </div>

      <details className="beat-tools" open><summary>BPM & BEAT GRID</summary><div className="beat-controls" role="group" aria-label={`${label} beatmatching`}>
        <button className="btn ghost" disabled={!track || loading} onClick={deck.tapTempo}>Tap tempo</button>
        <label className="bpm-input">Track BPM
          <input type="number" aria-label={`${label} track BPM`} min={30} max={300} step={.1}
            key={`${track?.pathL}-${deck.grid?.bpm ?? 'empty'}`} defaultValue={deck.grid?.bpm ?? ''}
            disabled={!track || loading} placeholder="BPM"
            onBlur={e => { if(e.target.value) deck.manualGrid(Number(e.target.value)); }}
            onKeyDown={e => { if(e.key === 'Enter') e.currentTarget.blur(); }} />
        </label>
        <button className="btn ghost" disabled={!deck.grid || deck.grid.bpm < 60} onClick={() => deck.manualGrid(deck.grid!.bpm / 2)}>÷2</button>
        <button className="btn ghost" disabled={!deck.grid || deck.grid.bpm > 150} onClick={() => deck.manualGrid(deck.grid!.bpm * 2)}>×2</button>
        <button className="btn ghost" disabled={!deck.grid} onClick={deck.alignBeat}>Set beat here</button>
      </div></details>

</div><JogWheel deck={deck} /></div>
      <div className="transport">
        <button className="btn cue-btn" onClick={deck.jumpCue} disabled={deck.state.cueNorm === null} title="Return to the saved cue">CUE</button>
        <button className={`btn play-btn ${deck.state.playing ? 'stop' : 'start'}`}
          onClick={() => void deck.togglePlay().catch(err => setError(String(err)))} disabled={!track}
          title="Play or pause this deck independently of Sync">
          {deck.state.playing ? 'Ⅱ PAUSE' : '▶ PLAY'}
        </button>
        <button className={`btn sync-btn ${syncLocked ? 'locked' : ''}`} disabled={!canSync || loading} onClick={onSync}
          aria-pressed={syncLocked} title="Lock tempo and beats without starting playback. Press again to unlock.">{syncLocked ? 'SYNC ●' : 'SYNC'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

// DeckPanel — everything for one deck: load button, track name, waveform, the mixer
// strip (DeckControls), and transport. Driven by a UseDeck, so deck A and deck B are
// the same component with different state.

import { useRef, useState } from 'react';
import type { UseDeck } from '../useDeck';
import Waveform from './Waveform';
import { loadDemoSong } from '../demoSong';
import JogWheel from './JogWheel';
import TempoControl from './TempoControl';
import { STEM_MODES } from '../stemModes';
import { CLOUD_STEMS, localStemFetch } from '../stemConnection';
import { validLoop } from '../transport';

interface Props {
  deck: UseDeck;
  label: string;
  ensureAudio: () => Promise<void>; // boots the AudioContext on first user gesture
  canSync: boolean;
  onSelect: () => void;
  selected: boolean;
  onSync: () => void;
  onBeatLock: () => void;
  syncLocked: boolean;
  leader?: string;
  onRemember: (file: File, demo: boolean) => void;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function DeckPanel({ deck, label, ensureAudio, canSync, onSelect, selected, onSync, onBeatLock, syncLocked, leader, onRemember }: Props) {
  const cuePointer = useRef<number | null>(null);
  const releaseCuePointer = (e: React.PointerEvent) => {
    if (cuePointer.current !== e.pointerId) return;
    cuePointer.current = null; deck.cueUp();
  };
  const [utilityOpen, setUtilityOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 950px)').matches);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importSummary, setImportSummary] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = async (file: File, demo = false) => {
    setError(null); setImportSummary('');
    setLoading(true);
    try {
      await ensureAudio();
      await deck.load(file);
      onRemember(file, demo);
      return true;
    } catch (err) {
      setError(String(err));
      return false;
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const loadDemo = async () => {
    setLoading(true); setError(null);
    try { await ensureAudio(); await loadFile(await loadDemoSong(), true); }
    catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  };

  const importYoutube = async (event: React.FormEvent) => {
    event.preventDefault();
    setImportSummary('');
    setLoading(true); setError(null); setImportStatus('Downloading from YouTube and converting to MP3…');
    try {
      // Safari needs audio unlocked while the submit gesture is still active.
      await ensureAudio();
      const started = performance.now();
      const response = await localStemFetch('/api/import/youtube', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl }), signal: AbortSignal.timeout(620000),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Import failed');
      setImportStatus('Receiving MP3 audio…');
      const name = JSON.parse(response.headers.get('X-Track-Name') || '"YouTube track.mp3"');
      const file = new File([await response.blob()], name, { type: 'audio/mpeg' });
      const received = performance.now();
      setImportStatus('Loading deck…');
      if (await loadFile(file)) {
        const imported = Number(response.headers.get('X-Import-Seconds'));
        const seconds = response.headers.has('X-Import-Seconds') && Number.isFinite(imported) && imported >= 0 ? imported : (received-started)/1000;
        const cached = response.headers.get('X-Import-Cache') === 'hit';
        setImportSummary(`${cached ? 'Import cache' : 'Download + conversion'}: ${seconds.toFixed(1)}s · deck load: ${((performance.now()-received)/1000).toFixed(1)}s`);
        setYoutubeUrl('');
      }
    } catch (err) {
      setError(err instanceof TypeError ? 'Open the Mac-connected DeckFlow view and start the companion to import YouTube audio.' : String(err));
    } finally { setLoading(false); setImportStatus(''); }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void loadFile(file);
  };

  const { track } = deck.state;

  return (
    <section className={`deck deck-${deck.state.id} ${selected ? 'selected-deck' : ''}`} aria-label={label} onPointerDownCapture={onSelect} onFocusCapture={onSelect}>
      <header className="deck-head">
        <span className="deck-label"><b>{deck.state.id}</b> {label.toUpperCase()} {selected ? '· SPACE ▶/Ⅱ' : ''}</span>
        <button className="btn ghost" onClick={() => void loadDemo()} disabled={loading}>
          DEMO
        </button>
        <button className="btn ghost" onClick={() => {
          // Unlock Safari audio while the click still has user activation.
          void ensureAudio().catch(err => setError(String(err)));
          fileInputRef.current?.click();
        }} disabled={loading}>
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

      <form className="youtube-import" onSubmit={event => void importYoutube(event)}>
        <input type="url" aria-label={`YouTube link for ${label}`} placeholder="Paste YouTube video link"
          required value={youtubeUrl} disabled={loading} onChange={event => setYoutubeUrl(event.target.value)} />
        <button className="btn ghost" disabled={loading || !youtubeUrl.trim()}>IMPORT MP3</button>
        {loading && importStatus && <progress className="import-progress" aria-label={`${label} YouTube import in progress`} />}
        {importSummary && <small className="import-timing">{importSummary}</small>}
        <small role="status">{importStatus || `Import audio you own or have permission to use · up to ${CLOUD_STEMS ? 10 : 20} minutes`}</small>
      </form>
      <div className="track-display">
        <div className="track-name" title={track?.name}>{track ? track.name : 'LOAD A TRACK TO BEGIN'}</div>
        <div className="track-stats">
          <div className="bpm-display"><strong>{deck.grid ? (deck.grid.bpm * deck.state.tempo).toFixed(1) : '—'}</strong><span>BPM</span></div>
          <div className="track-time"><small>ELAPSED</small><strong>{track ? fmt(deck.position * track.duration) : '0:00'}</strong></div>
          <div className="track-time remaining"><small>REMAIN</small><strong>−{track ? fmt((1 - deck.position) * track.duration) : '0:00'}</strong></div>
        </div>
        <span className="analysis-status">{syncLocked ? `SYNC LOCKED · FOLLOWING ${leader}` : deck.analysisStatus === 'analyzing' ? 'ANALYZING BPM…' :
          deck.analysisStatus === 'unknown' ? 'NO STEADY BEAT · SET BPM BELOW' :
          deck.analysisStatus === 'manual' ? 'MANUAL BEAT GRID' : deck.grid ? 'AUTO BPM · BEAT GRID READY' : CLOUD_STEMS ? 'CLOUD AUDIO PROCESSING' : 'LOCAL AUDIO · NO UPLOADS'}</span>
      </div>
      <div className="waveform-wrap">
        <Waveform peaks={track?.peaks ?? null} position={deck.position} onSeek={deck.seek}
          cueNorm={deck.state.cueNorm} hotCues={deck.state.hotCues} loopIn={deck.state.loopIn} loopOut={deck.state.loopOut}
          loopEnabled={deck.state.loopEnabled} label={`${label} waveform`}
          grid={deck.grid} duration={track?.duration ?? 0} color={deck.state.id === 'A' ? '#36a9ff' : '#ff5265'} />
      </div>

      <div className="deck-workbench"><TempoControl deck={deck} locked={syncLocked} />
        <details className="deck-utility" open={utilityOpen} onToggle={e => setUtilityOpen(e.currentTarget.open)}><summary className="utility-summary">Cue, loops & beat grid</summary>      <div className="cue-tools"><button className="btn ghost" onClick={deck.setCue} disabled={!track}>SET CUE</button>
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

</details><JogWheel deck={deck} /></div>
      <div className="stem-controls" role="group" aria-label={`${label} stem controls`}>
        <span className="control-caption">STEMS</span>
        {STEM_MODES.map(mode => <button key={mode.id}
          className={`btn ghost ${deck.stemMode === mode.id ? 'active' : ''}`} disabled={!deck.stemsReady}
          aria-pressed={deck.stemMode === mode.id} onClick={() => deck.selectStems(mode.id)}>{mode.label}</button>)}
        {deck.stemsReady && deck.preparedQuality === 'fast' && <button className="btn ghost"
          title="Prepare this track with two passes. Full Mix plays while preparing."
          onClick={deck.upgradeStems}>BETTER QUALITY</button>}
        <small role="status">{deck.stemStatus}</small>
        {deck.stemsFailed && track && <button className="btn ghost" onClick={deck.retryStems}>RETRY STEMS</button>}
      </div>
      <div className="hot-cues" role="group" aria-label={`${label} hot cues`}>
        <span>HOT CUES</span>{deck.state.hotCues.map((cue, index) => <button key={index}
          className={`btn ghost ${cue !== null ? 'active' : ''}`} disabled={!track}
          aria-label={`${label} hot cue ${index + 1}${cue === null ? ' empty' : ` at ${fmt(cue * (track?.duration ?? 0))}`}`}
          title="Empty: set here. Saved: jump and play. Shift-click: clear."
          onClick={e => deck.hotCue(index, e.shiftKey)}>{index + 1}<small>{cue === null ? 'SET' : fmt(cue * (track?.duration ?? 0))}</small></button>)}
      </div>
      <div className="transport">
        <button className={`btn cue-btn ${deck.state.cuePreview ? 'active' : ''}`} disabled={!track}
          title="Playing: stop at cue. Paused: hold to preview; release to return. Press Play while holding to continue."
          onPointerDown={e => { if (e.button !== 0 || cuePointer.current !== null) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); cuePointer.current = e.pointerId; deck.cueDown(); }}
          onPointerUp={releaseCuePointer} onPointerCancel={releaseCuePointer} onLostPointerCapture={releaseCuePointer} onBlur={() => { cuePointer.current = null; deck.cueUp(); }}
          onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) deck.cueDown(); } }}
          onKeyUp={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); deck.cueUp(); } }}
          onClick={e => { if (e.detail === 0) { deck.cueDown(); deck.cueUp(); } }}>CUE</button>
        <button className={`btn play-btn ${deck.state.playing ? 'stop' : 'start'}`}
          onClick={() => void deck.togglePlay().catch(err => setError(String(err)))} disabled={!track}
          title="Play or pause this deck independently of Sync">
          {deck.state.playing ? 'Ⅱ PAUSE' : '▶ PLAY'}
        </button>
        <button className={`btn sync-btn ${syncLocked ? 'locked' : ''}`} disabled={!canSync || loading} onClick={onSync}
          title="Match tempo; align beats when both decks play. Never starts playback.">SYNC</button>
        <button className={`btn ghost ${syncLocked ? 'active' : ''}`} disabled={!canSync || loading} onClick={onBeatLock}
          aria-pressed={syncLocked} title="Keep tempo and beats following the other deck; press again to unlock.">BEAT LOCK</button>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

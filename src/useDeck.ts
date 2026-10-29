// Graph-driving controls live in the reducer; meter/playhead updates stay separate.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { getRuntime } from './audio';
import { decodeTrack, publishTrack } from './track';
import { initialDeckState, METER_EVENT_SUFFIX } from './deck';
import { reducer, clamp01, type EqBand, type Action } from './transport';
import type { BeatGrid } from './bpmAnalysis';
import type { StemMode } from './stemModes';
import { prepareStems } from './stemClient';
import type { StemQuality } from './stemProgress';

export function useDeck(id: string, audioReady: boolean) {
  const [state, dispatch] = useReducer(reducer, id, initialDeckState);
  const [position, setPosition] = useState(0);
  const [level, setLevel] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const positionRef = useRef(position);
  const [stemStatus, setStemStatus] = useState('Load a track to prepare stems automatically');
  const [stemsReady, setStemsReady] = useState(false);
  const [stemsFailed, setStemsFailed] = useState(false);
  const [stemMode, setStemMode] = useState<StemMode>('full');
  const [preparedQuality, setPreparedQuality] = useState<StemQuality>('fast');
  const stemAbort = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  const requestedQualityRef = useRef<StemQuality>('fast');
  const prepare = useCallback(async (file: File, gen: number, requestedQuality: StemQuality = 'fast') => {
    const rt = getRuntime(); if (!rt) return;
    stemAbort.current?.abort(); const controller = new AbortController(); stemAbort.current = controller;
    const token = rt.stems[id].token();
    const quality = requestedQuality;
    requestedQualityRef.current = quality;
    setStemsFailed(false);
    setStemStatus('Connecting to local separator…');
    try {
      await prepareStems(file, rt, id, token, controller.signal, text => { if (loadGen.current === gen) setStemStatus(text); }, quality);
      if (loadGen.current !== gen || controller.signal.aborted) return;
      setPreparedQuality(quality); setStemsReady(true); setStemStatus(`STEMS READY · ${quality === 'fast' ? 'Fast' : 'Best Quality'} · switch live`);
    } catch (error) { if (!controller.signal.aborted && loadGen.current === gen) { setStemsFailed(true); setStemStatus(error instanceof Error ? error.message : String(error)); } }
  }, [id]);
  useEffect(() => () => stemAbort.current?.abort(), []);
  const loadGen = useRef(0);
  const scratchGesture = useRef<{ resume: boolean; position: number } | null>(null);
  const ignoreSnapshotsUntil = useRef(0);
  const [grid, setGrid] = useState<BeatGrid | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'ready' | 'manual' | 'unknown'>('idle');
  const workerRef = useRef<Worker | null>(null);
  const taps = useRef<number[]>([]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const showPosition = useCallback((norm: number) => {
    positionRef.current = clamp01(norm);
    setPosition(positionRef.current);
  }, []);

  // Render optimistically, then discard buffered pre-seek snapshots (50ms polling).
  const transport = useCallback((action: Action) => {
    const next = reducer(stateRef.current, action);
    stateRef.current = next;
    if (next.seekGen !== state.seekGen) {
      showPosition(next.baseNorm);
      ignoreSnapshotsUntil.current = performance.now() + 120;
    }
    dispatch(action);
  }, [showPosition, state.seekGen]);

  useEffect(() => {
    if (!audioReady) return;
    const rt = getRuntime();
    if (!rt) return;
    const update = () => {
      if (performance.now() < ignoreSnapshotsUntil.current) return;
      const current = stateRef.current;
      if (!current.track) return;
      if (scratchGesture.current) return;
      const p = rt.players[id].position() / current.track.duration;
      showPosition(p);
      if (p >= 1 && current.playing && !current.loopEnabled) transport({ type: 'END' });
    };
    const timer = window.setInterval(update, 33);
    const onMeter = (e: { source?: string; min: number; max: number }) => {
      if (e.source === `${id}${METER_EVENT_SUFFIX}`) {
        setLevel(clamp01(Math.max(Math.abs(e.min), Math.abs(e.max))));
      }
    };
    rt.core.on('meter', onMeter);
    return () => {
      window.clearInterval(timer);
      rt.core.off('meter', onMeter);
    };
  }, [id, audioReady, showPosition, transport]);

  const load = useCallback(async (file: File) => {
    const rt = getRuntime();
    if (!rt) throw new Error('Enable audio before loading a track.');
    if (scratchGesture.current) { scratchGesture.current = null; rt.scratch[id].stop(); }
    const gen = ++loadGen.current;
    stemAbort.current?.abort();
    setStemsFailed(false); setStemsReady(false); setStemMode('full');
    setStemStatus('Waiting for track to load…');
    const decoded = await decodeTrack(rt, file);
    if (gen !== loadGen.current) return;
    // Each successful load gets distinct VFS paths, preserving an old playing deck
    // until the new track is fully published and committed to state.
    rt.stems[id].reset();
    const track = await publishTrack(rt, `${id}:${gen}`, decoded);
    if (gen !== loadGen.current) return;
    showPosition(0);
    ignoreSnapshotsUntil.current = performance.now() + 120;
    dispatch({ type: 'LOAD', track });
    lastFile.current = file;
    void prepare(file, gen);
    setGrid(null);
    setAnalysisStatus('analyzing');
    taps.current = [];
    workerRef.current?.terminate();
    try {
      const worker = new Worker(new URL('./bpmWorker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      worker.onmessage = (event: MessageEvent<{ grid: BeatGrid | null }>) => {
        if (gen !== loadGen.current || workerRef.current !== worker) return;
        setGrid(event.data.grid);
        setAnalysisStatus(event.data.grid ? 'ready' : 'unknown');
        worker.terminate();
      };
      worker.onerror = () => {
        if (gen === loadGen.current && workerRef.current === worker) setAnalysisStatus('unknown');
        worker.terminate();
      };
      worker.postMessage({ samples: decoded.analysisPcm, sampleRate: decoded.analysisSampleRate }, [decoded.analysisPcm.buffer]);
    } catch { setAnalysisStatus('unknown'); }
  }, [id, showPosition, prepare]);

  const upgradeStems = () => {
    const rt = getRuntime(); if (!rt || !lastFile.current) return;
    rt.stems[id].reset(); rt.scratch[id].select('full');
    setStemMode('full'); setStemsReady(false);
    void prepare(lastFile.current, loadGen.current, 'best');
  };
  const retryStems = () => { if (lastFile.current) void prepare(lastFile.current, loadGen.current, requestedQualityRef.current); };
  const selectStems = (mode: StemMode) => {
    if (!stemsReady) return;
    setStemMode(mode); getRuntime()?.stems[id].select(mode); getRuntime()?.scratch[id].select(mode);
  };
  const seek = useCallback((norm: number) => transport({ type: 'SEEK', norm }), [transport]);
  const togglePlay = useCallback(async () => {
    const rt = getRuntime();
    if (rt?.ctx.state === 'suspended') await rt.ctx.resume();
    transport(stateRef.current.playing && !stateRef.current.cuePreview ? { type: 'PAUSE' } : { type: 'PLAY' });
  }, [transport]);
  const setVolume = useCallback((value: number) => dispatch({ type: 'SET_VOLUME', value }), []);
  const setEq = useCallback((band: EqBand, value: number) => dispatch({ type: 'SET_EQ', band, value }), []);
  const setFilter = useCallback((value: number) => dispatch({ type: 'SET_FILTER', value }), []);
  const setTempo = useCallback((value: number) => dispatch({ type: 'SET_TEMPO', value }), []);
  const hotCue = (index: number, clear = false) => transport({ type: 'HOT_CUE', index, position: positionRef.current, clear });
  const scratchDown = () => {
    const rt = getRuntime(); if (!rt || !stateRef.current.track || scratchGesture.current) return;
    const position = positionRef.current;
    scratchGesture.current = { resume: stateRef.current.playing, position };
    rt.scratch[id].start(position * stateRef.current.track.duration);
    transport({ type: 'PAUSE' });
  };
  const scratchMove = (position: number) => {
    if (!scratchGesture.current || !stateRef.current.track) return;
    const norm = clamp01(position); scratchGesture.current.position = norm; showPosition(norm);
    getRuntime()?.scratch[id].move(norm * stateRef.current.track.duration);
  };
  const scratchUp = useCallback(() => {
    const gesture = scratchGesture.current; if (!gesture) return;
    scratchGesture.current = null;
    transport({ type: 'SEEK', norm: gesture.position });
    if (gesture.resume) transport({ type: 'PLAY' });
    getRuntime()?.scratch[id].stop();
  }, [id, transport]);
  const cueDown = () => { transport({ type: 'CUE_DOWN', position: positionRef.current }); };
  const cueUp = useCallback(() => transport({ type: 'CUE_UP' }), [transport]);
  useEffect(() => {
    const release = () => { cueUp(); scratchUp(); };
    const hidden = () => { if (document.hidden) release(); };
    window.addEventListener('blur', release);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden); };
  }, [cueUp, scratchUp]);
  const setCue = () => dispatch({ type: 'SET_CUE', position: positionRef.current });
  const jumpCue = () => { if (state.cueNorm !== null) seek(state.cueNorm); };
  const loopAction = (type: 'LOOP_IN' | 'LOOP_OUT' | 'TOGGLE_LOOP' | 'CLEAR_LOOP') =>
    transport({ type, position: positionRef.current });

  const readPosition = () => state.track
    ? clamp01((getRuntime()?.players[id].position() ?? 0) / state.track.duration) : 0;
  const manualGrid = (bpm: number, offset = grid?.offset ?? 0) => {
    if (!state.track || !Number.isFinite(bpm) || bpm < 30 || bpm > 300) return;
    workerRef.current?.terminate();
    workerRef.current = null;
    setGrid({ bpm: Math.round(bpm * 10) / 10, offset, confidence: 1 });
    setAnalysisStatus('manual');
  };
  const tapTempo = () => {
    const now = performance.now();
    const previous = taps.current[taps.current.length - 1];
    if (previous !== undefined && now - previous < 180) return;
    if (previous !== undefined && now - previous > 2000) taps.current = [];
    taps.current = [...taps.current.slice(-7), now];
    if (taps.current.length >= 3) {
      const intervals = taps.current.slice(1).map((v,i)=>v-taps.current[i]).sort((a,b)=>a-b);
      const ms = intervals[Math.floor(intervals.length/2)];
      // Taps measure output tempo, so remove this deck's varispeed ratio.
      manualGrid(60000 / ms / state.tempo, readPosition() * state.track!.duration);
    }
  };
  const alignBeat = () => { if (grid && state.track) manualGrid(grid.bpm, readPosition() * state.track.duration); };
  const follow = (tempo: number) => {
    const current = stateRef.current;
    if (current.tempo !== tempo || current.loopEnabled) {
      dispatch({ type: 'FOLLOW', tempo });
    }
  };
  const toggleKeyLock = () => dispatch({ type: 'KEY_LOCK' });
  const syncTo = (norm: number, tempo: number) => transport({ type: 'SYNC', norm, tempo });

  return { state, position, level, stemStatus, stemsReady, stemsFailed, stemMode, preparedQuality, upgradeStems, retryStems, selectStems, load, togglePlay, seek, setVolume, setEq, setFilter,
    setTempo, setCue, jumpCue, cueDown, cueUp, hotCue, scratchDown, scratchMove, scratchUp, loopAction, grid, analysisStatus, manualGrid, tapTempo,
    alignBeat, syncTo, readPosition, follow, toggleKeyLock };
}
export type UseDeck = ReturnType<typeof useDeck>;

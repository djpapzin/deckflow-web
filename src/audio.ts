// Shared audio clock: two pitch-preserving sources feed four mono mixer inputs.
import WebRenderer from '@elemaudio/web-renderer';
import SignalsmithStretch from './vendor/SignalsmithStretch.mjs';
import stretchWorkletUrl from './vendor/SignalsmithStretch.mjs?url';
import { DeckPlayer } from './playback';
import { ScratchPlayer } from './scratch';
import { StemPlayback } from './stemPlayback';

// Serve the original worklet module directly. Serializing the bundled factory
// with Function.toString loses its closure bindings after production minification.
SignalsmithStretch.moduleUrl = stretchWorkletUrl;

export interface AudioRuntime {
  ctx: AudioContext;
  core: WebRenderer;
  players: Record<string, DeckPlayer>;
  scratch: Record<string, ScratchPlayer>;
  stems: Record<string, StemPlayback>;
  lookAhead: number;
}

let runtime: AudioRuntime | null = null;
let initializing: Promise<AudioRuntime> | null = null;

/** Request media playback routing on supporting browsers (not ambient/game audio).
 * Call from the user's playback/load gesture; feature detection keeps other
 * browsers working without the experimental Audio Session API.
 */
export async function resumeAudioContext(ctx: AudioContext): Promise<void> {
  if (typeof navigator !== 'undefined') {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    try { if (session && session.type !== 'playback') session.type = 'playback'; }
    catch { /* Unsupported session policy must not prevent normal playback. */ }
  }
  if (ctx.state === 'closed') throw new Error('Audio is closed. Reload DeckFlow and load your track again.');
  // WebKit can report "interrupted" after a call, app switch or screen lock.
  if (String(ctx.state) !== 'running') await ctx.resume();
  if (String(ctx.state) !== 'running') throw new Error('Audio is interrupted. Return to DeckFlow and tap Play again.');
}

/**
 * Boots the AudioContext + Elementary WebRenderer. Must be called from a user
 * gesture (click/tap) — browsers refuse to start an AudioContext otherwise.
 * Safe to call repeatedly; it initializes once and resumes a suspended context.
 */
export async function initAudio(): Promise<AudioRuntime> {
  if (runtime) {
    await resumeAudioContext(runtime.ctx);
    return runtime;
  }

  if (!initializing) initializing = bootAudio().finally(() => { initializing = null; });
  const rt = await initializing;
  await resumeAudioContext(rt.ctx);
  return rt;
}

async function bootAudio(): Promise<AudioRuntime> {
  const ctx = new AudioContext();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([buildAudio(ctx), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Audio startup timed out. Click Load Track or Demo again to retry.')), 30000);
    })]);
  } catch (error) {
    if (ctx.state !== 'closed') await ctx.close();
    throw error;
  } finally { clearTimeout(timer); }
}

async function buildAudio(ctx: AudioContext): Promise<AudioRuntime> {
  // Resume during the initiating gesture, before worklets wait for processing.
  // Safari may otherwise keep the worklet startup promise pending forever.
  await resumeAudioContext(ctx);
  const core = new WebRenderer();

  // The renderer resolves to a WebAudio node that contains the WASM runtime.
  // The third arg is the event-poll interval (ms): how often the worklet flushes
  // meter/snapshot events to the main thread. 50ms (20Hz) is plenty for a playhead
  // and meters, and keeps the worklet→main message rate low enough that a busy main
  // thread can't let the queue back up.
  try {
    const node = await core.initialize(
      ctx,
      {
        // Elementary 4.x sizes its native input buffers from numberOfInputs.
        // Give it four MONO inputs, rather than one four-channel input.
        numberOfInputs: 4,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        channelInterpretation: 'discrete',
        outputChannelCount: [2], // stereo out — the browser gives us one stereo bus
      },
      50,
    );

    node.connect(ctx.destination);
    const players: Record<string, DeckPlayer> = {};
    const scratch: Record<string, ScratchPlayer> = {};
    const stems: Record<string, StemPlayback> = {};
    await ctx.audioWorklet.addModule(`${import.meta.env.BASE_URL}scratch-worklet.js`);
    let latency = .12;
    for (const [i, id] of ['A', 'B'].entries()) {
      const stretch = await SignalsmithStretch(ctx, {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      const split = ctx.createChannelSplitter(2);
      const normalGain = ctx.createGain();
      const originalGain = ctx.createGain();
      stretch.connect(originalGain); originalGain.connect(normalGain); normalGain.connect(split);
      scratch[id] = new ScratchPlayer(ctx, normalGain, () => latency + .03);
      scratch[id].node.connect(split);
      split.connect(node, 0, i * 2);
      split.connect(node, 1, i * 2 + 1);
      latency = Math.max(latency, await stretch.latency());
      players[id] = new DeckPlayer(stretch, () => ctx.currentTime);
      stems[id] = new StemPlayback(ctx, normalGain, originalGain, players[id], () => latency + .03);
    }

    if (ctx.state === 'closed') throw new Error('Audio startup was cancelled; please retry.');
    runtime = { ctx, core, players, scratch, stems, lookAhead: latency + .03 };
    return runtime;
  } catch (error) {
    if (ctx.state !== 'closed') await ctx.close();
    throw error;
  }
}

export function getRuntime(): AudioRuntime | null {
  return runtime;
}

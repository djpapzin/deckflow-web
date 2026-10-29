// Shared audio clock: two pitch-preserving sources feed four mono mixer inputs.
import WebRenderer from '@elemaudio/web-renderer';
import SignalsmithStretch from './vendor/SignalsmithStretch.mjs';
import stretchWorkletUrl from './vendor/SignalsmithStretch.mjs?url';
import { DeckPlayer } from './playback';
import { ScratchPlayer } from './scratch';
import scratchWorkletUrl from '../public/scratch-worklet.js?url';

// Serve the original worklet module directly. Serializing the bundled factory
// with Function.toString loses its closure bindings after production minification.
SignalsmithStretch.moduleUrl = stretchWorkletUrl;

export interface AudioRuntime {
  ctx: AudioContext;
  core: WebRenderer;
  players: Record<string, DeckPlayer>;
  scratch: Record<string, ScratchPlayer>;
  lookAhead: number;
}

let runtime: AudioRuntime | null = null;
let initializing: Promise<AudioRuntime> | null = null;

/**
 * Boots the AudioContext + Elementary WebRenderer. Must be called from a user
 * gesture (click/tap) — browsers refuse to start an AudioContext otherwise.
 * Safe to call repeatedly; it initializes once and resumes a suspended context.
 */
export async function initAudio(): Promise<AudioRuntime> {
  if (runtime) {
    if (runtime.ctx.state === 'suspended') await runtime.ctx.resume();
    return runtime;
  }

  if (!initializing) initializing = bootAudio().finally(() => { initializing = null; });
  return initializing;
}

async function bootAudio(): Promise<AudioRuntime> {
  const ctx = new AudioContext();
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
    await ctx.audioWorklet.addModule(scratchWorkletUrl);
    let latency = .12;
    for (const [i, id] of ['A', 'B'].entries()) {
      const stretch = await SignalsmithStretch(ctx, {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
      });
      const split = ctx.createChannelSplitter(2);
      const normalGain = ctx.createGain();
      stretch.connect(normalGain); normalGain.connect(split);
      scratch[id] = new ScratchPlayer(ctx, normalGain, () => latency + .03);
      scratch[id].node.connect(split);
      split.connect(node, 0, i * 2);
      split.connect(node, 1, i * 2 + 1);
      latency = Math.max(latency, await stretch.latency());
      players[id] = new DeckPlayer(stretch, () => ctx.currentTime);
    }

    if (ctx.state === 'suspended') await ctx.resume();

    runtime = { ctx, core, players, scratch, lookAhead: latency + .03 };
    return runtime;
  } catch (error) {
    await ctx.close();
    throw error;
  }
}

export function getRuntime(): AudioRuntime | null {
  return runtime;
}

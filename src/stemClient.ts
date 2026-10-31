import type { AudioRuntime } from './audio';
import { estimateStemSeconds, stemCountdown, type StemQuality } from './stemProgress';
import { localStemFetch, requireStemConnection, CLOUD_STEMS } from './stemConnection';
export async function prepareStems(file: File, rt: AudioRuntime, id: string, token: number, signal: AbortSignal, status: (text: string) => void, quality: StemQuality = 'best') {
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await localStemFetch(path, { ...init, signal });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || `Stem service: ${response.status}`);
    }
    return response;
  };
  await requireStemConnection();
  const probeController = new AbortController();
  const cancelProbe = () => probeController.abort();
  signal.addEventListener('abort', cancelProbe, { once:true });
  const probeTimer = setTimeout(cancelProbe, 10000);
  try {
    const probe = await localStemFetch('/api/health', { signal: probeController.signal });
    if (!probe.ok || !(await probe.json()).ready) throw new Error('Not ready');
  } catch { throw new Error(CLOUD_STEMS ? 'Cloud separator is temporarily unavailable. Please retry shortly.' : 'Start the DeckFlow stem service on your Mac. If this browser blocks the connection, open http://127.0.0.1:8787.'); }
  finally { clearTimeout(probeTimer); signal.removeEventListener('abort', cancelProbe); }
  status(CLOUD_STEMS ? 'Uploading to cloud separator…' : 'Sending to local separator…');
  const { id: job, cached } = await (await request(`/api/stems?quality=${quality}`, { method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:file })).json();
  const duration = rt.players[id].duration;
  const estimate = CLOUD_STEMS ? Math.max(estimateStemSeconds(duration, quality), duration * (quality === 'fast' ? 5 : 10) + 20) : estimateStemSeconds(duration, quality);
  let processingStarted: number | undefined;
  let splitSeconds: number | null = null;
  const reused = cached === true;
  for (;;) {
    signal.throwIfAborted();
    const { status: state, processing } = await (await request(`/api/stems/${job}`)).json();
    if (state === 'ready') {
      splitSeconds = Number.isFinite(processing?.seconds) && processing.seconds >= 0 ? processing.seconds : processingStarted === undefined ? null : (performance.now()-processingStarted)/1000;
      break;
    }
    if (state === 'error' || state === 'missing') throw new Error('Separation failed. Retry or check the local service log.');
    if (state === 'queued') {
      status('Queued · waiting for the other track…');
    } else {
      processingStarted ??= performance.now();
      status(`${quality === 'fast' ? 'Fast' : 'Best Quality'} · ${stemCountdown(estimate, (performance.now() - processingStarted) / 1000)}`);
    }
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled','AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1000);
      signal.addEventListener('abort', cancel, { once:true });
    });
  }
  status('Loading aligned stems…');
  const loadingStarted = performance.now();
  // Transfer/decode one full-song stem at a time to avoid exhausting Safari
  // and macOS network buffers with four large WAV responses at once.
  const buffers: AudioBuffer[] = [];
  for (const stem of ['vocals','drums','bass','other']) {
    signal.throwIfAborted();
    buffers.push(await rt.ctx.decodeAudioData(await (await request(`/api/stems/${job}/${stem}.wav`)).arrayBuffer()));
  }
  signal.throwIfAborted();
  if (buffers.some(b => Math.abs(b.duration - rt.players[id].duration) > .1)) throw new Error('Stem duration does not match this track');
  await rt.stems[id].load(buffers,token);
  signal.throwIfAborted();
  rt.scratch[id].loadStems(buffers);
  return { splitSeconds, reused, stemLoadSeconds:(performance.now()-loadingStarted)/1000 };
}

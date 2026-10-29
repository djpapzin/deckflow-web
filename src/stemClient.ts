import type { AudioRuntime } from './audio';
const BASE = location.port === '8787' ? '' : 'http://127.0.0.1:8787';
export async function prepareStems(file: File, rt: AudioRuntime, id: string, token: number, signal: AbortSignal, status: (text: string) => void) {
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${BASE}${path}`, { ...init, signal });
    if (!response.ok) throw new Error(`Stem service: ${response.status}`);
    return response;
  };
  const probeController = new AbortController();
  const cancelProbe = () => probeController.abort();
  signal.addEventListener('abort', cancelProbe, { once:true });
  const probeTimer = setTimeout(cancelProbe, 2500);
  try {
    const probe = await fetch(`${BASE}/api/health`, { signal: probeController.signal });
    if (!probe.ok || !(await probe.json()).ready) throw new Error('Not ready');
  } catch { throw new Error('Start the DeckFlow stem service on your Mac. If this browser blocks the connection, open http://127.0.0.1:8787.'); }
  finally { clearTimeout(probeTimer); signal.removeEventListener('abort', cancelProbe); }
  status('Sending to local separator…');
  const { id: job } = await (await request('/api/stems', { method:'POST', headers:{'Content-Type':'application/octet-stream'}, body:file })).json();
  for (;;) {
    signal.throwIfAborted();
    const { status: state } = await (await request(`/api/stems/${job}`)).json();
    if (state === 'ready') break;
    if (state === 'error' || state === 'missing') throw new Error('Separation failed. Retry or check the local service log.');
    status(state === 'queued' ? 'Queued for separation…' : 'Separating vocals and instruments…');
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(new DOMException('Cancelled','AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, 1500);
      signal.addEventListener('abort', cancel, { once:true });
    });
  }
  status('Loading aligned stems…');
  const buffers = await Promise.all(['vocals','instrumental'].map(async stem => rt.ctx.decodeAudioData(await (await request(`/api/stems/${job}/${stem}.wav`)).arrayBuffer())));
  signal.throwIfAborted();
  if (buffers.some(b => Math.abs(b.duration - rt.players[id].duration) > .1)) throw new Error('Stem duration does not match this track');
  await rt.stems[id].load(buffers[0],buffers[1],token);
  signal.throwIfAborted();
  rt.scratch[id].loadStems(buffers[0], buffers[1]);
}

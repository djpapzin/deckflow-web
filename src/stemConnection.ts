/** Requests go only to the loopback companion, never a remote audio service. */
export const STEM_BASE = location.port === '8787' ? '' : 'http://127.0.0.1:8787';
let connected = !STEM_BASE;
export function localStemFetch(path: string, init: RequestInit = {}) {
  return fetch(`${STEM_BASE}${path}`, { ...init, targetAddressSpace:'loopback' } as RequestInit);
}
export async function connectMacStems(signal?: AbortSignal) {
  // Call directly from a click: the browser may need a user gesture for permission.
  const response = await localStemFetch('/api/health', { signal });
  if (!response.ok || !(await response.json()).ready) throw new Error('Start the DeckFlow stem service on your Mac, then connect again.');
  connected = true;
}
export async function requireStemConnection() {
  if (connected) return;
  try {
    const permission = await navigator.permissions.query({name:'loopback-network'} as unknown as PermissionDescriptor);
    if (permission.state === 'granted') return;
    if (permission.state === 'denied') throw new Error('Allow loopback/local network access for this site in browser permissions, then click Connect Mac Stems.');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Allow loopback')) throw error;
    // Older browsers may not recognize this permission name.
  }
  throw new Error('Click CONNECT MAC STEMS above to allow this site to reach your Mac, then retry stems.');
}

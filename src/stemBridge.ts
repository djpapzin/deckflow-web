const MAC_ORIGIN='http://127.0.0.1:8787';
let popup: Window | null = null;
let channel='';
let ready=false;
let sequence=0;
let panel: HTMLIFrameElement | null = null;
type Pending={resolve:(r:Response)=>void;reject:(e:Error)=>void;cleanup:()=>void};
const pending=new Map<string,Pending>();
let connected: (()=>void) | undefined;
let failed: (()=>void) | undefined;
window.addEventListener('message',event=>{
  const d=event.data;
  if(event.origin!==MAC_ORIGIN||event.source!==popup||!d||d.channel!==channel)return;
  if(d.type==='ready'){ready=true;connected?.();return;}
  if(d.type==='connection-error'){failed?.();return;}
  if(d.type!=='response')return;
  const task=pending.get(d.id);if(!task)return;pending.delete(d.id);task.cleanup();
  if(d.error)task.reject(new Error(d.error));
  else task.resolve(new Response(d.body,{status:d.status,headers:{'Content-Type':d.contentType||'application/octet-stream'}}));
});
export function bridgeReady(){return ready&&!!popup&&!popup.closed;}
export function connectStemBridge(signal?:AbortSignal):Promise<void>{
  if(bridgeReady())return Promise.resolve();
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
    ready=false;channel=crypto.randomUUID();
    const finish=(error?:Error)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);connected=undefined;failed=undefined;error?reject(error):resolve();};
    const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
    const timer=setTimeout(()=>finish(new Error('Mac connection window did not respond')),30000);
    connected=()=>finish();failed=()=>finish(new Error('Mac service is not ready'));
    signal?.addEventListener('abort',cancel,{once:true});
    panel?.remove();panel=document.createElement('iframe');
    panel.title='DeckFlow Mac stem connection';
    panel.src=`${MAC_ORIGIN}/connect?origin=${encodeURIComponent(location.origin)}&channel=${encodeURIComponent(channel)}`;
    panel.setAttribute('sandbox','allow-scripts allow-same-origin');
    panel.style.cssText='position:fixed;bottom:12px;right:12px;width:380px;height:180px;max-width:90vw;border:1px solid #36a9ff;border-radius:8px;z-index:1000;background:#15191e';
    document.body.appendChild(panel);popup=panel.contentWindow;
    if(!popup)finish(new Error('Could not open the Mac connection panel.'));
  });
}
export function bridgeFetch(path:string,init:RequestInit={}):Promise<Response>{
  if(!bridgeReady())return Promise.reject(new Error('Reconnect the Mac stem connection window.'));
  return new Promise((resolve,reject)=>{
    const signal=init.signal,id=String(++sequence);
    if(signal?.aborted){reject(new DOMException('Cancelled','AbortError'));return;}
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{pending.delete(id);cleanup();popup?.postMessage({type:'cancel',channel,id},MAC_ORIGIN);reject(new DOMException('Cancelled','AbortError'));};
    const timer=setTimeout(()=>{pending.delete(id);cleanup();reject(new Error('Mac service request timed out'));},30000);
    signal?.addEventListener('abort',cancel,{once:true});pending.set(id,{resolve,reject,cleanup});
    popup!.postMessage({type:'request',channel,id,path,method:init.method||'GET',body:init.body},MAC_ORIGIN);
  });
}

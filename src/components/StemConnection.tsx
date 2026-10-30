import { useState } from 'react';
import { connectMacStems, STEM_BASE } from '../stemConnection';
export default function StemConnection({onConnected}:{onConnected:()=>void}) {
  const [state,setState]=useState<'idle'|'connecting'|'ready'|'error'>('idle');
  const [message,setMessage]=useState('Connect to prepare stems on this Mac.');
  if (!STEM_BASE) {
    const view=location.pathname.startsWith('/live/')?'production':location.pathname.startsWith('/dev/')?'dev':null;
    return view ? <p className="intro" role="status">Mac-connected {view} · stems run locally</p> : null;
  }
  const view=location.origin==='https://dev.deckflow.djpapzin.com'?'dev':location.origin==='https://deckflow.djpapzin.com'?'live':null;
  if (view) return <div className="intro">
    <a className="btn ghost" href={`http://127.0.0.1:8787/${view}/`}>CONNECT MAC STEMS</a>{' '}
    Open the Mac-connected {view==='live'?'production':'dev'} view before loading music.
  </div>;
  const connect=async()=>{
    setState('connecting');setMessage('Opening the Mac connection window…');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try {
      await connectMacStems(controller.signal);setState('ready');setMessage('Mac stem service connected.');onConnected();
    } catch {
      setState('error');setMessage('Could not connect. Start the Mac service, allow the connection window to open, and keep it open while using stems.');
    } finally {clearTimeout(timer);}
  };
  return <div className="intro" aria-label="Mac stem service connection">
    <button className="btn ghost" disabled={state==='connecting'} onClick={()=>void connect()}>{state==='connecting'?'CONNECTING…':state==='ready'?'RECONNECT MAC STEMS':'CONNECT MAC STEMS'}</button>{' '}
    <span role="status">{message}</span>{state==='error'&&<>{' '}<a href="http://127.0.0.1:8787/" target="_blank" rel="noreferrer">Open local DeckFlow</a></>}
  </div>;
}

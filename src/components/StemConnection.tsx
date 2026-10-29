import { useState } from 'react';
import { connectMacStems, STEM_BASE } from '../stemConnection';
export default function StemConnection({onConnected}:{onConnected:()=>void}) {
  const [state,setState]=useState<'idle'|'connecting'|'ready'|'error'>('idle');
  const [message,setMessage]=useState('Connect to prepare stems on this Mac.');
  if (!STEM_BASE) return null;
  const connect=async()=>{
    setState('connecting');setMessage('Allow access to this Mac if your browser asks…');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
    try {
      await connectMacStems(controller.signal);setState('ready');setMessage('Mac stem service connected.');onConnected();
    } catch {
      setState('error');setMessage('Could not connect. Start the Mac service and allow local/loopback access in this site’s browser permissions.');
    } finally {clearTimeout(timer);}
  };
  return <div className="intro" aria-label="Mac stem service connection">
    <button className="btn ghost" disabled={state==='connecting'} onClick={()=>void connect()}>{state==='connecting'?'CONNECTING…':state==='ready'?'RECONNECT MAC STEMS':'CONNECT MAC STEMS'}</button>{' '}
    <span role="status">{message}</span>{state==='error'&&<>{' '}<a href="http://127.0.0.1:8787/" target="_blank" rel="noreferrer">Open local DeckFlow</a></>}
  </div>;
}

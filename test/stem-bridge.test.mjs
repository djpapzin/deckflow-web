import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/stemBridge.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replace(/export /g,'');
function fixture(blocked=false){
 let listener,url;const messages=[];
 const popup={closed:false,postMessage:(message,origin)=>messages.push({message,origin})};
 const frames=[];const document={createElement:()=>({style:{},contentWindow:popup,setAttribute(){},remove(){}}),body:{appendChild:frame=>frames.push(frame)}};
 const window={addEventListener:(_type,fn)=>listener=fn,open:value=>{url=value;return blocked?null:popup;}};
 const api=new Function('window','location','crypto','document',code+';return {bridgeReady,connectStemBridge,bridgeFetch};')(window,{origin:'https://dev.deckflow.djpapzin.com'},{randomUUID:()=> 'test-channel'},document);
 const event=(data,origin='http://127.0.0.1:8787',source=popup)=>listener({data:{channel:'test-channel',...data},origin,source});
 return {api,event,popup,messages,frames,get url(){return frames[0]?.src||url;}};
}
test('bridge requires matching origin, opener and channel before accepting readiness or results',async()=>{
 const f=fixture(),connected=f.api.connectStemBridge();assert.match(f.url,/127\.0\.0\.1:8787\/connect/);
 f.event({type:'ready'},'https://evil.example');f.event({type:'ready'},undefined,{});f.event({type:'ready',channel:'wrong'});assert.equal(f.api.bridgeReady(),false);
 f.event({type:'ready'});await connected;assert.equal(f.api.bridgeReady(),true);
 const result=f.api.bridgeFetch('/api/health');const {id}=f.messages.at(-1).message;
 f.event({type:'response',id,status:200,contentType:'application/json',body:new TextEncoder().encode('{"ready":true}').buffer});
 assert.deepEqual(await (await result).json(),{ready:true});assert.equal(f.messages.at(-1).origin,'http://127.0.0.1:8787');
});
test('bridge cancellation reaches local fetch and closed windows require reconnect',async()=>{
 const f=fixture(),connected=f.api.connectStemBridge();f.event({type:'ready'});await connected;
 const controller=new AbortController(),response=f.api.bridgeFetch('/api/health',{signal:controller.signal});controller.abort();await assert.rejects(response,{name:'AbortError'});assert.equal(f.messages.at(-1).message.type,'cancel');
 f.popup.closed=true;await assert.rejects(f.api.bridgeFetch('/api/health'),/Reconnect/);
});

test('persistent embedded localhost panel completes its handshake',async()=>{
 const f=fixture(true),connected=f.api.connectStemBridge();assert.equal(f.frames.length,1);assert.match(f.frames[0].src,/127\.0\.0\.1:8787\/connect/);
 f.event({type:'ready'});await connected;assert.equal(f.api.bridgeReady(),true);
});

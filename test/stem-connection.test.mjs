import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/stemConnection.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;$/gm,'').replace(/export /g,'');
function connection({port='',state='prompt',ready=true}={}) {
 const calls=[];
 const api=new Function('bridgeReady','connectStemBridge','bridgeFetch','location','navigator','fetch',code+';return {localStemFetch,connectMacStems,requireStemConnection};')( ()=>false,async()=>{},()=>{}, {port},{permissions:{query:async()=>{if(state==='unsupported')throw TypeError('unknown');return {state};}}},async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ready})};});
 return {api,calls};
}
test('hosted requests require an explicit connection; fetch declares loopback and preserves cancellation',async()=>{
 const {api,calls}=connection();await assert.rejects(api.requireStemConnection(),/CONNECT MAC STEMS/);assert.equal(calls.length,0);
 const controller=new AbortController();await api.connectMacStems(controller.signal);await api.requireStemConnection();
 assert.equal(calls[0].url,'http://127.0.0.1:8787/api/health');assert.equal(calls[0].options.targetAddressSpace,'loopback');assert.equal(calls[0].options.signal,controller.signal);
});
test('local hosting and granted permission work automatically; denied/unsupported permissions have guidance',async()=>{
 await connection({port:'8787'}).api.requireStemConnection();await connection({state:'granted'}).api.requireStemConnection();
 await assert.rejects(connection({state:'denied'}).api.requireStemConnection(),/browser permissions/);
 await assert.rejects(connection({state:'unsupported'}).api.requireStemConnection(),/CONNECT MAC STEMS/);
 const {api}=connection({ready:false});await assert.rejects(api.connectMacStems(),/Start the DeckFlow/);await assert.rejects(api.requireStemConnection());
});

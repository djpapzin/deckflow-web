import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import OfflineRenderer from '@elemaudio/offline-renderer';
const require=createRequire(import.meta.url);
let code=ts.transpileModule(readFileSync(new URL('../src/deck.ts',import.meta.url),'utf8'),
 {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
code=code.replace("'@elemaudio/core'",JSON.stringify(pathToFileURL(require.resolve('@elemaudio/core')).href));
const {initialDeckState,buildDeckSignal}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const sr=48000;
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
for(let channel=0;channel<4;channel++)test(`mixer preserves source channel ${channel} and isolates the other three`,async()=>{
 const core=new OfflineRenderer();await core.initialize({numInputChannels:4,numOutputChannels:4,sampleRate:sr});
 const a=buildDeckSignal({...initialDeckState('A'),track:{pathL:'A'}});
 const b=buildDeckSignal({...initialDeckState('B'),track:{pathL:'B'}});
 await core.render(a.left,a.right,b.left,b.right);
 const input=Array.from({length:4},(_,c)=>Float32Array.from({length:sr},(_,i)=>c===channel?.2*Math.sin(i*2*Math.PI*440/sr):0));
 const output=Array.from({length:4},()=>new Float32Array(sr));
 core.process(input,output);
 for(let c=0;c<4;c++){
  const level=rms(output[c].subarray(sr/2));
  if(c===channel)assert.ok(level>.1,`channel ${channel} produced ${level}`);
  else assert.ok(level<.00001,`channel ${channel} leaked into ${c}: ${level}`);
 }
});

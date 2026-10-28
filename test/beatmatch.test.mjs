import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import ts from 'typescript';
async function load(name) {
 const src=readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const {detectBpm}=await load('bpmAnalysis');
const {syncSettings}=await load('beatmatch');
function clicks(bpm,offset=.173,duration=24) {
 const sampleRate=11025, pcm=new Float32Array(sampleRate*duration);
 for(let t=offset;t<duration;t+=60/bpm) {
  for(let i=0;i<sampleRate*.12;i++) {
   const at=Math.round(t*sampleRate)+i;if(at>=pcm.length)break;
   pcm[at]+=Math.sin(i/sampleRate*2*Math.PI*70)*Math.exp(-i/sampleRate*40)*.7;
  }
 }
 return {pcm,sampleRate};
}
for(const bpm of [90,120,124,150]) test(`detects ${bpm} BPM percussion and its phase`,()=>{
 const {pcm,sampleRate}=clicks(bpm);
 const grid=detectBpm(pcm,sampleRate);
 assert.ok(grid, 'grid should be detected');
 assert.ok(Math.abs(grid.bpm-bpm)<.5,JSON.stringify(grid));
 const period=60/bpm;
 const error=Math.abs(((grid.offset-.173+period*1.5)%period)-period*.5);
 assert.ok(error<.025,`beat offset error ${error}`);
});
test('silence, steady tone and too-short clips do not invent BPM',()=>{
 assert.equal(detectBpm(new Float32Array(11025*10),11025),null);
 assert.equal(detectBpm(new Float32Array(11025),11025),null);
 const tone=Float32Array.from({length:11025*5},(_,i)=>.1*Math.sin(i/11025*2*Math.PI*440));
 assert.equal(detectBpm(tone,11025),null);
});
test('sync matches effective BPM including the reference rate and beat phase',()=>{
 const target={bpm:124,offset:.12,duration:100,position:.4,tempo:1};
 const reference={bpm:120,offset:.2,duration:100,position:.356,tempo:1.1};
 const next=syncSettings(target,reference);
 assert.ok(next); assert.ok(Math.abs(next.tempo*124-132)<1e-9);
 const phase=d=>(((d.position*d.duration-d.offset)*d.bpm/60)%1+1)%1;
 assert.ok(Math.abs(phase({...target,position:next.norm})-phase(reference))<1e-9);
 assert.ok(Math.abs(next.norm-target.position)*100<60/124);
});
test('sync refuses rates outside the supported range and fits near track edges',()=>{
 const base={bpm:120,offset:.1,duration:100,position:0,tempo:1};
 assert.equal(syncSettings({...base,bpm:60},{...base,bpm:180}),null);
 assert.equal(syncSettings({...base,bpm:240},{...base,bpm:60}),null);
 for(const position of [0,.9999]) {
  const result=syncSettings({...base,position},{...base,position:.423});
  assert.ok(result.norm>=0 && result.norm<1);
 }
});
const {makeDemoTrack}=await load('demo');
for(const [deck,bpm] of [['A',120],['B',124]]) test(`detects the actual ${deck} demo without reading its filename`,async()=>{
 const bytes=await makeDemoTrack(deck).arrayBuffer();
 const view=new DataView(bytes), pcm=new Float32Array(Math.floor((bytes.byteLength-44)/16));
 for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(44+i*16,true)/32768;
 const grid=detectBpm(pcm,11025);
 assert.ok(grid);assert.ok(Math.abs(grid.bpm-bpm)<.25,JSON.stringify(grid));
});
test('unstructured noise does not invent a steady beat',()=>{
 let seed=1234;
 const pcm=Float32Array.from({length:11025*20},()=>{
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;
   return (seed/4294967296-.5)*.3;
 });
 assert.equal(detectBpm(pcm,11025),null);
});

import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
async function load(name) {
 const code=ts.transpileModule(readFileSync(new URL(`../src/${name}.ts`,import.meta.url),'utf8'),
  {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText;
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
const {DeckPlayer,positionAt}=await load('playback');
const {syncSettings,driftCorrection}=await load('beatmatch');
const state=(id,tempo=1)=>({id,track:{pathL:id,duration:600},playing:true,baseNorm:0,seekGen:1,tempo,
 keyLock:true,loopEnabled:false,loopIn:null,loopOut:null});
function setup(){
 let now=0;const commands=[];
 const node={schedule:async change=>{commands.push(change);}};
 const player=new DeckPlayer(node,()=>now);
 return {player,commands,time:t=>{now=t;}};
}
test('future start, tempo change and pause preserve transport position',()=>{
 const x=setup(),s=state('A');x.player.apply(s,.2);
 assert.equal(x.player.position(.1),0);assert.equal(x.player.position(1.2),1);
 x.time(1.2);x.player.apply({...s,tempo:1.25},1.4);
 assert.ok(Math.abs(x.player.position(2.4)-2.45)<1e-9);
 x.time(2.4);x.player.apply({...s,tempo:1.25,playing:false},2.6);
 assert.ok(Math.abs(x.player.position(8)-2.7)<1e-9);
 assert.equal(x.commands.at(-1).semitones,0);
});
test('seek and loop positions use the audio clock and survive loop exit',()=>{
 const x=setup(),s={...state('A'),baseNorm:.01,loopEnabled:true,loopIn:.01,loopOut:.02};
 x.player.apply(s,.2);
 assert.ok(Math.abs(x.player.position(13.7)-7.5)<1e-9);
 x.time(13.7);x.player.apply({...s,seekGen:2,baseNorm:7.5/600,loopEnabled:false},13.9);
 assert.ok(Math.abs(x.player.position(14.9)-8.5)<1e-9);
 assert.equal(positionAt({output:0,input:1,rate:1,active:false,loopStart:0,loopEnd:0},50),1);
});
test('shared clock stays phase-aligned for two minutes through tempo changes, pause/resume and seeking',()=>{
 const a=setup(),b=setup();let sA=state('A'),sB=state('B',120/124);
 const gridA={bpm:120,offset:.1,duration:600},gridB={bpm:124,offset:.13,duration:600};
 let force=true, maxError=0;
 for(let tick=0;tick<1200;tick++){
  const t=tick/10,when=t+.15;a.time(t);b.time(t);
  if(tick===100)sA={...sA,tempo:1.1};
  if(tick===300)sA={...sA,playing:false};
  if(tick===350)sA={...sA,playing:true};
  if(tick===500)sA={...sA,tempo:.9};
  if(tick===700)sA={...sA,seekGen:2,baseNorm:.3};
  const rate=gridA.bpm*sA.tempo/gridB.bpm;
  sB={...sB,tempo:rate,playing:sA.playing};
  a.player.apply(sA,when,'B');b.player.apply(sB,when,'B');
  const targetPos=b.player.position(when),leaderPos=a.player.position(when);
  const setting=syncSettings({...gridB,position:targetPos/600,tempo:rate},{...gridA,position:leaderPos/600,tempo:sA.tempo});
  assert.ok(setting);
  const error=setting.norm*600-targetPos;
  const correction=driftCorrection(rate,error,sA.playing,force);
  if(correction.seek||Math.abs(b.player.segment(when).rate-correction.rate)>.00005){
   b.player.schedule({...(correction.seek?{input:setting.norm*600}:{}),rate:correction.rate},when,true);
  }
  force=false;
  if(tick%100===99){
   const phaseA=(a.player.position(when)-gridA.offset)*gridA.bpm/60;
   const phaseB=(b.player.position(when)-gridB.offset)*gridB.bpm/60;
   const error=Math.abs((phaseA-phaseB)-Math.round(phaseA-phaseB));
   maxError=Math.max(maxError,error);
  }
 }
 assert.ok(maxError<.01,`phase error ${maxError} beats`);
});
test('small drift is corrected gradually; large jumps realign',()=>{
 assert.equal(driftCorrection(1,.03,true).seek,false);
 assert.ok(driftCorrection(1,.03,true).rate>1);
 assert.ok(driftCorrection(1,-.03,true).rate<1);
 assert.equal(driftCorrection(1,.2,true).seek,true);
 assert.equal(driftCorrection(1,.03,false).seek,true);
 assert.equal(driftCorrection(1,.001,true).rate,1);
 assert.equal(driftCorrection(1.5,.03,true).rate,1.5);
});
test('unlock restores nominal tempo instead of leaving a drift nudge applied',()=>{
 const x=setup(),s=state('B');x.player.apply(s,.15,'B');
 x.time(1);x.player.schedule({rate:1.015},1.15,true);
 x.time(2);x.player.apply(s,2.15,'free');
 assert.equal(x.player.segment(2.15).rate,1);
});

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
const {syncSettings,driftCorrection,synchronizePlayers}=await load('beatmatch');
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
test('shared clock stays phase-aligned for two minutes through tempo changes, independent pause/resume and seeking',()=>{
 const a=setup(),b=setup();let sA=state('A'),sB=state('B',120/124);
 const gridA={bpm:120,offset:.1,duration:600},gridB={bpm:124,offset:.13,duration:600};
 let force=true, maxError=0;
 for(let tick=0;tick<1200;tick++){
  const t=tick/10,when=t+.15;a.time(t);b.time(t);
  if(tick===100)sA={...sA,tempo:1.1};
  if(tick===300)sA={...sA,playing:false};
  if(tick===350)sA={...sA,playing:true};
  if(tick===400)sB={...sB,playing:false};
  if(tick===450)sB={...sB,playing:true};
  if(tick===500)sA={...sA,tempo:.9};
  if(tick===700)sA={...sA,seekGen:2,baseNorm:.3};
  const rate=gridA.bpm*sA.tempo/gridB.bpm;
  sB={...sB,tempo:rate};
  a.player.apply(sA,when,'B');b.player.apply(sB,when,'B');
  if (!sA.playing || !sB.playing) { force=true; continue; }
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

test('one-shot Sync matches 124 to 125 at the scheduled instant without drifting for ten minutes',()=>{
 const a=setup(),b=setup();
 const duration=1200;
 a.player.schedule({input:10,active:true,rate:1},0);
 b.player.schedule({input:10*125/124,active:true,rate:1},0);
 a.time(.2);b.time(.2);
 const when=.2+.23;
 const result=synchronizePlayers(
  {bpm:124,offset:0,duration,tempo:1,playing:true},
  {bpm:125,offset:0,duration,tempo:1,playing:true},b.player,a.player,when,true);
 assert.ok(result);assert.equal(result.tempo,125/124);
 assert.equal(b.player.segment(.42).rate,1);
 for(const seconds of [when,1,10,60,300,600]) {
  const beatsA=a.player.position(seconds)*125/60,beatsB=b.player.position(seconds)*124/60;
  assert.ok(Math.abs((beatsB-beatsA)-Math.round(beatsB-beatsA))<1e-9);
 }
 assert.equal(b.commands.at(-1).active,true);
});
test('Sync on a paused deck changes BPM without moving or starting it',()=>{
 const a=setup(),b=setup();
 a.player.schedule({input:8,active:true,rate:1},0);b.player.schedule({input:3,active:false,rate:1},0);
 synchronizePlayers({bpm:124,offset:0,duration:600,tempo:1,playing:false},
 {bpm:125,offset:0,duration:600,tempo:1,playing:true},b.player,a.player,.4,true);
 assert.equal(b.player.position(10),3);assert.equal(b.player.segment(10).active,false);
 assert.equal(b.player.segment(10).rate,125/124);
});
test('late stems join at current song position and mirror future seeks, tempo and pause',()=>{
 const {player,time}=setup();player.schedule({input:5,rate:1.2,active:true},0);time(10);
 const stemCommands=[[],[]];const nodes=stemCommands.map(commands=>({schedule:async change=>{commands.push(change);}}));
 player.setCompanions(nodes,10.2);
 assert.equal(stemCommands[0][0].input,player.position(10.2));
 player.schedule({input:20,rate:125/124},11);player.schedule({active:false},12);
 assert.deepEqual(stemCommands[0],stemCommands[1]);
 assert.equal(stemCommands[0][1].input,20);assert.equal(stemCommands[0][1].rate,125/124);
 assert.equal(stemCommands[0][2].active,false);
 player.setCompanions([]);const count=stemCommands[0].length;player.schedule({active:true},13);
 assert.equal(stemCommands[0].length,count);
});

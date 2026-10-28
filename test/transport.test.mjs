import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/transport.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { reducer, validLoop } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const initial = () => ({ id:'A', track:{duration:10}, playing:true, baseNorm:0, seekGen:0,
  tempo:1, volume:1, eqLow:0, eqMid:0, eqHigh:0, filterCutoff:0,
  cueNorm:null, loopIn:null, loopOut:null, loopEnabled:false });
test('tempo is bounded without resetting transport', () => {
  let s = initial(); s.baseNorm = .3;
  assert.equal(reducer(s, {type:'SET_TEMPO',value:4}).tempo, 1.5);
  const next = reducer(s,{type:'SET_TEMPO',value:.01});
  assert.equal(next.tempo,.5); assert.equal(next.baseNorm,.3); assert.equal(next.seekGen,0);
});
test('manual loops reject reversed and tiny ranges; exit rebases at current playhead', () => {
  let s = reducer(initial(), {type:'LOOP_IN',position:.2});
  assert.equal(s.loopOut,null);
  assert.equal(reducer(s,{type:'LOOP_OUT',position:.1}),s);
  assert.equal(reducer(s,{type:'LOOP_OUT',position:.20001}),s);
  s = reducer(s,{type:'LOOP_OUT',position:.6});
  assert.ok(validLoop(s)); assert.ok(s.loopEnabled); assert.equal(s.baseNorm,.2);
  const exit = reducer(s,{type:'TOGGLE_LOOP',position:.35});
  assert.equal(exit.baseNorm,.35); assert.equal(exit.loopEnabled,false);
  assert.equal(exit.seekGen,s.seekGen+1);
  const restart = reducer(exit,{type:'TOGGLE_LOOP',position:.9});
  assert.equal(restart.baseNorm,.2); assert.ok(restart.loopEnabled);
});
test('seeking out of a loop disables it; clearing does not jump back', () => {
  const s = {...initial(),loopIn:.2,loopOut:.6,loopEnabled:true};
  assert.equal(reducer(s,{type:'SEEK',norm:.8}).loopEnabled,false);
  assert.equal(reducer(s,{type:'SEEK',norm:.4}).loopEnabled,true);
  const clear = reducer(s,{type:'CLEAR_LOOP',position:.45});
  assert.equal(clear.baseNorm,.45); assert.equal(clear.loopIn,null); assert.equal(clear.loopOut,null);
  assert.equal(clear.loopEnabled,false);
});
test('new tracks clear cue, loop, tempo and position but preserve mixer settings', () => {
  const s = {...initial(),cueNorm:.3,loopIn:.2,loopOut:.6,loopEnabled:true,tempo:1.2,eqLow:-6,volume:.4};
  const next = reducer(s,{type:'LOAD',track:{duration:20}});
  assert.equal(next.cueNorm,null); assert.equal(next.loopEnabled,false);
  assert.equal(next.loopIn,null); assert.equal(next.loopOut,null);
  assert.equal(next.tempo,1); assert.equal(next.baseNorm,0); assert.equal(next.playing,false);
  assert.equal(next.eqLow,-6); assert.equal(next.volume,.4);
});
test('end stops a non-looping deck and leaves an active loop alone', () => {
  assert.equal(reducer(initial(),{type:'END'}).playing,false);
  const s = {...initial(),loopEnabled:true}; assert.equal(reducer(s,{type:'END'}),s);
});
test('cue is clamped; transport ignores commands when no track is loaded', () => {
  assert.equal(reducer(initial(),{type:'SET_CUE',position:2}).cueNorm,1);
  const empty = {...initial(),track:null,playing:false};
  for (const action of [{type:'PLAY'},{type:'SEEK',norm:.4},{type:'LOOP_IN',position:.3}]) {
    assert.equal(reducer(empty,action),empty);
  }
});
test('sync atomically seeks and changes rate, exits loops, and starts with a playing reference',()=>{
 const s={...initial(),playing:false,loopIn:.2,loopOut:.6,loopEnabled:true};
 const synced=reducer(s,{type:'SYNC',norm:.42,tempo:120/124,start:true});
 assert.equal(synced.baseNorm,.42);assert.equal(synced.tempo,120/124);
 assert.equal(synced.loopEnabled,false);assert.equal(synced.playing,true);
 assert.equal(synced.seekGen,s.seekGen+1);
 assert.equal(reducer({...s,playing:true},{type:'SYNC',norm:.3,tempo:1,start:false}).playing,true);
});
test('follow mirrors pause/resume and tempo without resetting track position; Key Lock toggles independently',()=>{
 const s={...initial(),keyLock:true,loopEnabled:true};
 const paused=reducer(s,{type:'FOLLOW',tempo:1.1,playing:false});
 assert.equal(paused.tempo,1.1);assert.equal(paused.playing,false);assert.equal(paused.loopEnabled,false);
 assert.equal(paused.seekGen,s.seekGen);assert.equal(paused.baseNorm,s.baseNorm);
 const resumed=reducer(paused,{type:'FOLLOW',tempo:1.2,playing:true});
 assert.equal(resumed.playing,true);assert.equal(resumed.keyLock,true);
 assert.equal(reducer(resumed,{type:'KEY_LOCK'}).keyLock,false);
});

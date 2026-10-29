import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
function processor() {
  let Processor;
  runInNewContext(readFileSync(new URL('../public/scratch-worklet.js', import.meta.url),'utf8'), {
    AudioWorkletProcessor:class { constructor(){this.port={};} }, sampleRate:1000,
    registerProcessor:(_,P)=>{Processor=P;}
  });
  const p=new Processor();
  const send=d=>p.port.onmessage({data:d});
  const render=()=>{const out=[new Float32Array(128),new Float32Array(128)];p.process([], [out]);return out;};
  return {p,send,render};
}
test('platter renders actual forward and reverse stereo PCM, holds silently, and stops',()=>{
  const {send,render}=processor();
  const left=Float32Array.from({length:1000},(_,i)=>i/1000),right=left.map(x=>-x);
  send({type:'load',channels:[left,right]});send({type:'start',position:.4});
  assert.ok(render()[0].every(x=>x===0));
  send({type:'move',position:.6,seconds:.02});const forward=render();
  assert.ok(forward[0][100]>forward[0][1]);assert.equal(forward[1][50],-forward[0][50]);
  send({type:'move',position:.3,seconds:.02});const reverse=render();
  assert.ok(reverse[0][100]<reverse[0][1]);
  assert.ok(render()[0].slice(4).every(x=>x===0));
  send({type:'stop'});assert.ok(render()[0].every(x=>x===0));
});
test('scratching beyond either end emits finite silence',()=>{
  const {send,render}=processor();send({type:'load',channels:[new Float32Array(100),new Float32Array(100)]});
  for(const position of [-1,10]) {send({type:'start',position});send({type:'move',position:position+1,seconds:.01});assert.ok(render()[0].every(Number.isFinite));}
});

test('stationary pointer movement stays silent rather than emitting a DC pulse',()=>{
  const {send,render}=processor();
  send({type:'load',channels:[new Float32Array(1000).fill(.8),new Float32Array(1000).fill(.8)]});
  send({type:'start',position:.4});send({type:'move',position:.4,seconds:.02});
  assert.ok(render()[0].every(x=>x===0));
});
test('scratch attack and stop ramp rather than abruptly switching full amplitude',()=>{
  const {send,render}=processor();
  send({type:'load',channels:[new Float32Array(1000).fill(.9),new Float32Array(1000).fill(.9)]});
  send({type:'start',position:.2});send({type:'move',position:.8,seconds:.05});
  const moving=render()[0]; assert.ok(moving[0]<.4); assert.ok(moving[4]>.8);
  send({type:'stop'});const stopped=render()[0]; assert.ok(stopped[0]<moving[127]);assert.ok(stopped.slice(4).every(x=>x===0));
});
test('scratch follows both reprise modes without drums or restarting the platter',()=>{
 const {send,render}=processor();
 const stereo=value=>[new Float32Array(1000).fill(value),new Float32Array(1000).fill(value)];
 send({type:'load',channels:stereo(.8)});
 send({type:'stems',stems:[stereo(.2),stereo(.5),stereo(.1),stereo(.15)]});
 send({type:'start',position:.2});send({type:'move',position:.5,seconds:.05});
 send({type:'mix',gains:[0,1,0,1,1]});assert.ok(Math.abs(render()[0][20]-.45)<1e-6);
 send({type:'move',position:.7,seconds:.05});send({type:'mix',gains:[0,0,0,1,1]});assert.ok(Math.abs(render()[0][20]-.25)<1e-6);
});

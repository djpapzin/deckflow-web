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
  assert.ok(render()[0].every(x=>x===0));
  send({type:'stop'});assert.ok(render()[0].every(x=>x===0));
});
test('scratching beyond either end emits finite silence',()=>{
  const {send,render}=processor();send({type:'load',channels:[new Float32Array(100),new Float32Array(100)]});
  for(const position of [-1,10]) {send({type:'start',position});send({type:'move',position:position+1,seconds:.01});assert.ok(render()[0].every(Number.isFinite));}
});

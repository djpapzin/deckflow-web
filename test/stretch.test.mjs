import {test} from 'node:test';
import assert from 'node:assert/strict';
import {worklet} from './helpers/stretch.mjs';
const sr=48000;
function tone(frequency,seconds=8){return Float32Array.from({length:sr*seconds},(_,i)=>.2*Math.sin(i*2*Math.PI*frequency/sr));}
function frequency(samples){
 let crossings=0,first=-1,last=-1;
 for(let i=1;i<samples.length;i++)if(samples[i-1]<=0&&samples[i]>0){if(first<0)first=i;last=i;crossings++;}
 return (crossings-1)*sr/(last-first);
}
function rms(samples){return Math.sqrt(samples.reduce((s,x)=>s+x*x,0)/samples.length);}
for(const rate of [.5,.8,1.25,1.5])test(`WASM preserves 440 Hz at ${rate}x tempo, stereo stays separate`,async()=>{
 const w=await worklet(sr);
 w.command('addBuffers',[tone(440),tone(660)]);
 w.command('schedule',{active:true,input:0,rate,semitones:0,output:.2});
 const [left,right]=w.render(sr*3);
 const l=left.subarray(sr,sr*2),r=right.subarray(sr,sr*2);
 assert.ok(rms(l)>.05);assert.ok(rms(r)>.05);
 assert.ok(Math.abs(frequency(l)-440)<2,`L ${frequency(l)}`);
 assert.ok(Math.abs(frequency(r)-660)<2,`R ${frequency(r)}`);
});
test('Key Lock off intentionally restores varispeed pitch',async()=>{
 const w=await worklet(sr);w.command('addBuffers',[tone(440),tone(440)]);
 w.command('schedule',{active:true,input:0,rate:1.25,semitones:12*Math.log2(1.25),output:.2});
 const [audio]=w.render(sr*3);
 assert.ok(Math.abs(frequency(audio.subarray(sr,sr*2))-550)<3);
});
test('future tempo and pause changes retain current segment until scheduled time',async()=>{
 const w=await worklet(sr);w.command('addBuffers',[tone(440),tone(440)]);
 w.command('schedule',{active:true,input:0,rate:1,semitones:0,output:.2});
 w.render(sr*.5);
 const when=w.now()+.5;
 w.command('schedule',{active:false,input:.8,rate:1,output:when});
 assert.equal(w.processor.timeMap[0].active,true);
 assert.equal(w.processor.timeMap.at(-1).active,false);
 const [before]=w.render(sr*.2);assert.ok(rms(before)>.05);
 const [after]=w.render(sr*1);assert.ok(rms(after.subarray(Math.floor(sr*.7)))<.005);
});
test('tempo changes preserve pitch during playback, seeking and looping stay finite',async()=>{
 const w=await worklet(sr);w.command('addBuffers',[tone(440),tone(440)]);
 w.command('schedule',{active:true,input:0,rate:1,semitones:0,output:.2});
 w.render(sr);
 w.command('schedule',{active:true,rate:1.4,output:w.now()+.2});
 const [changed]=w.render(sr*2);
 assert.ok(Math.abs(frequency(changed.subarray(sr))-440)<2);
 w.command('schedule',{input:1,loopStart:1,loopEnd:1.5,active:true,rate:1.2,output:w.now()+.2});
 const [loop]=w.render(sr*3);
 assert.ok(loop.every(Number.isFinite));assert.ok(rms(loop.subarray(sr))>.03);
});
for(const rate of [.5,1.5])test(`rendered content advances at ${rate}x while retaining each note's pitch`,async()=>{
 const w=await worklet(sr),pcm=tone(440,8);
 for(let i=sr*2;i<pcm.length;i++)pcm[i]=.2*Math.sin(i*2*Math.PI*880/sr);
 w.command('addBuffers',[pcm,pcm.slice()]);
 w.command('schedule',{active:true,input:0,rate,semitones:0,output:.2});
 const transition=.2+2/rate;
 const [audio]=w.render(sr*(transition+1));
 const before=audio.subarray(Math.floor(sr*(transition-.5)),Math.floor(sr*(transition-.3)));
 const after=audio.subarray(Math.floor(sr*(transition+.3)),Math.floor(sr*(transition+.5)));
 assert.ok(Math.abs(frequency(before)-440)<3,`before ${frequency(before)}`);
 assert.ok(Math.abs(frequency(after)-880)<3,`after ${frequency(after)}`);
});

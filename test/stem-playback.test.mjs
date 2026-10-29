import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const modesCode=ts.transpileModule(readFileSync(new URL('../src/stemModes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {stemGains}=await import(`data:text/javascript;base64,${Buffer.from(modesCode).toString('base64')}`);
const src=ts.transpileModule(readFileSync(new URL('../src/stemPlayback.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replace(/^import .*;$/gm,'').replace('export class','class');
test('stem switches only change gains; retirement disconnects processors',async()=>{
 let disposed=0,attachments=0; const values=[];
 const gain=()=>({gain:{value:0,cancelScheduledValues(){},setValueAtTime(v){this.value=v;},setTargetAtTime(v){this.value=v;values.push(v);}},connect(){},disconnect(){}});
 const ctx={currentTime:10,createGain:gain};const original=gain(),output=gain();
 const factory=async()=>({addBuffers:async()=>{},connect(){},disconnect(){},dispose:async()=>{disposed++;}});
 const Class=new Function('SignalsmithStretch','stemGains',src+'\nreturn StemPlayback;')(factory,stemGains);
 const player={setCompanions(nodes){attachments++;assert.ok(nodes.length===0||nodes.length===4);}};
 const stems=new Class(ctx,output,original,player,()=>.2);stems.reset();
 const buffer={numberOfChannels:2,getChannelData:()=>new Float32Array(100)};
 await stems.load([buffer,buffer,buffer,buffer],stems.token());const prior=attachments;
 for(const mode of ['full','acapella','beat','instrumental','vocal-reprise','instrumental-reprise']) {
   stems.select(mode);assert.deepEqual(values.slice(-5),stemGains(mode));
 }
 assert.equal(attachments,prior);
 stems.reset();assert.equal(disposed,4);assert.equal(stems.ready,false);
});

test('reprise modes exclude drums while retaining bass and melody, with optional vocals',()=>{
 assert.deepEqual(stemGains('vocal-reprise'),[0,1,0,1,1]);
 assert.deepEqual(stemGains('instrumental-reprise'),[0,0,0,1,1]);
 const instrumentalSong=[0,0,.3,.2,.1];
 const mix=mode=>stemGains(mode).reduce((sum,g,i)=>sum+g*instrumentalSong[i],0);
 assert.equal(mix('vocal-reprise'),mix('instrumental-reprise'));
});

test('Beat isolates drums with vocals, original, bass and melody muted',()=>{
 assert.deepEqual(stemGains('beat'),[0,0,1,0,0]);
});

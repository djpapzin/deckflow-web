import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/audio.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText.replace(/^import .*;$/gm,'').replace(/export /g,'').replaceAll('import.meta.env.BASE_URL', "'/'");
test('Safari startup resumes before renderer initialization, closes failed contexts, and permits retry',async()=>{
 const events=[];
 class Context {
  state='suspended';
  async resume(){events.push('resume');this.state='running';}
  async close(){events.push('close');this.state='closed';}
 }
 class Renderer {
  async initialize(ctx){assert.equal(ctx.state,'running');events.push('initialize');throw Error('test initialization failure');}
 }
 const init=new Function('AudioContext','WebRenderer','SignalsmithStretch','stretchWorkletUrl',code+';return initAudio;')(Context,Renderer,{},'/stretch.mjs');
 await assert.rejects(init(),/test initialization failure/);
 await assert.rejects(init(),/test initialization failure/);
 assert.deepEqual(events,['resume','initialize','close','resume','initialize','close']);
});


test('mobile playback requests media routing and resumes interrupted contexts on a gesture',async()=>{
 const events=[];
 const session={get type(){return 'auto';},set type(value){events.push(value);}};
 const resume=new Function('navigator','SignalsmithStretch','stretchWorkletUrl',code+';return resumeAudioContext;')({audioSession:session},{},'/stretch.mjs');
 const ctx={state:'interrupted',async resume(){events.push('resume');this.state='running';}};
 await resume(ctx);assert.deepEqual(events,['playback','resume']);
});

test('audio routing is optional; a still-interrupted context produces a visible error',async()=>{
 for(const navigator of [{},{get audioSession(){return {set type(v){throw Error('unsupported');}};}}]) {
  const resume=new Function('navigator','SignalsmithStretch','stretchWorkletUrl',code+';return resumeAudioContext;')(navigator,{},'/stretch.mjs');
  await resume({state:'running'});
  await assert.rejects(resume({state:'interrupted',async resume(){}}),/tap Play again/);
  await assert.rejects(resume({state:'closed'}),/Reload DeckFlow/);
 }
});

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

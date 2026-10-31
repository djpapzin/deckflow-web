import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/savedBeatGrid.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replaceAll('export ','');
function setup(storage){ return new Function('localStorage','crypto',source+';return {beatGridKey,readBeatGrid,saveBeatGrid};')(storage,webcrypto); }
function storage(){ const data=new Map();return {get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)}; }
test('manual BPM survives a new reader and belongs to exact audio bytes',async()=>{
 const db=storage(),api=setup(db);
 const a=await api.beatGridKey(new Blob(['song A'])),b=await api.beatGridKey(new Blob(['song B']));
 assert.notEqual(a,b);assert.equal(a,await api.beatGridKey(new Blob(['song A'])));
 api.saveBeatGrid(a,{bpm:120,offset:1.5,confidence:1});
 assert.deepEqual(setup(db).readBeatGrid(a,45),{bpm:120,offset:1.5,confidence:1});
 assert.equal(api.readBeatGrid(b,45),null);
 assert.equal(api.readBeatGrid(a,1),null);
});
test('invalid or unavailable storage falls back without blocking audio',()=>{
 const db=storage(),api=setup(db);
 db.setItem('deckflow:manual-grid:v1:x','broken'); assert.equal(api.readBeatGrid('x',45),null);
 db.setItem('deckflow:manual-grid:v1:x',JSON.stringify({bpm:0,offset:0})); assert.equal(api.readBeatGrid('x',45),null);
 const blocked=setup({getItem(){throw Error('denied');},setItem(){throw Error('denied');}});
 assert.equal(blocked.readBeatGrid('x',45),null);assert.doesNotThrow(()=>blocked.saveBeatGrid('x',{bpm:120,offset:0,confidence:1}));
});
test('only the latest hundred manual grids are retained and unrelated data survives',()=>{
 const db=storage(),api=setup(db);db.setItem('other-setting','keep');
 for(let i=0;i<105;i++)api.saveBeatGrid(String(i),{bpm:120,offset:0,confidence:1});
 assert.equal(db.length,101);assert.equal(db.getItem('other-setting'),'keep');
 assert.equal(api.readBeatGrid('0',45),null);assert.equal(api.readBeatGrid('104',45).bpm,120);
});

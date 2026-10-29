import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/useDeck.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}}).outputText.replace(/^import .*;$/gm,'').replace('export function','function').replaceAll('import.meta.url',JSON.stringify(import.meta.url));
test('failed Best Quality retries Best, while loading a new track returns to Fast',async()=>{
 const qualities=[];
 const rt={stems:{A:{reset(){},token(){return 1;}}},scratch:{A:{select(){}}}};
 const names=['useCallback','useEffect','useReducer','useRef','useState','getRuntime','decodeTrack','publishTrack','initialDeckState','reducer','clamp01','prepareStems'];
 const values=[f=>f,()=>{},(_r,id,init)=>[init(id),()=>{}],v=>({current:v}),v=>[v,()=>{}],()=>rt,async()=>({analysisPcm:new Float32Array(1)}),async()=>({duration:100}),id=>({id}),()=>{},v=>v,async(_file,_rt,_id,_token,_signal,_status,quality)=>{qualities.push(quality);if(quality==='best')throw Error('test upgrade failure');}];
 const hook=new Function(...names,source+'\nreturn useDeck;')(...values);
 const deck=hook('A',true);
 await deck.load({name:'song'});await Promise.resolve();
 deck.upgradeStems();await Promise.resolve();
 deck.retryStems();await Promise.resolve();
 await deck.load({name:'next song'});await Promise.resolve();
 assert.deepEqual(qualities,['fast','best','best','fast']);
});

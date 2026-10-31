import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const text=readFileSync(new URL('../src/components/DeckPanel.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('DeckPanel.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(node){
 if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='importYoutube') handler=node.initializer.getText(ast);
 ts.forEachChild(node,visit);
}
visit(ast);
const compiled=ts.transpileModule('const handler = '+handler+';', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
test('first YouTube import unlocks audio synchronously before starting conversion',async()=>{
 const events=[];let unlock;
 const ready=new Promise(resolve=>{unlock=resolve;});
 const run=new Function('ensureAudio','localStemFetch','setLoading','setError','setImportStatus','youtubeUrl','loadFile','setYoutubeUrl','setImportSummary',compiled+'return handler;')(
  ()=>{events.push('audio');return ready;},
  async()=>{events.push('fetch');throw Error('end test at request');},
  ()=>{},()=>{},()=>{},'https://youtu.be/aqz-KE-bpKQ',()=>{},()=>{},()=>{});
 const pending=run({preventDefault(){}});
 assert.deepEqual(events,['audio']);
 unlock();await pending;
 assert.deepEqual(events,['audio','fetch']);
});

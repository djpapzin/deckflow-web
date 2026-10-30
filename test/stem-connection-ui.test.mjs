import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../src/components/StemConnection.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText.replace(/^import .*;$/gm,'').replace('export default function','function');
function render(origin,pathname='/',base='http://127.0.0.1:8787',cloud=false) {
 return new Function('CLOUD_STEMS','useState','connectMacStems','STEM_BASE','location','_jsx','_jsxs',code+';return StemConnection;')(cloud,v=>[v,()=>{}],()=>{},base,{origin,pathname},(type,props)=>({type,props}),(type,props)=>({type,props}))({onConnected(){}});
}
function links(node){if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(links);return [...(node.type==='a'?[node.props.href]:[]),...links(node.props?.children)];}
test('production connects only to the live Mac view and dev only to the dev view',()=>{
 assert.deepEqual(links(render('https://deckflow.djpapzin.com')),['http://127.0.0.1:8787/live/']);
 assert.deepEqual(links(render('https://dev.deckflow.djpapzin.com')),['http://127.0.0.1:8787/dev/']);
 assert.ok(JSON.stringify(render('http://127.0.0.1:8787','/live/','')).includes('production'));
 assert.ok(JSON.stringify(render('http://127.0.0.1:8787','/dev/','')).includes('dev'));
});

test('cloud view explains audio uploads and does not send friends to a Mac companion',()=>{
 const view=render('https://deckflow.djpapzin.com','/','https://stems.deckflow.djpapzin.com',true);
 assert.deepEqual(links(view),[]);assert.match(JSON.stringify(view),/audio uploads/);
});

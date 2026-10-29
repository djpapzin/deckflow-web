import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const {isTransportSpace}=await import(`data:text/javascript;base64,${Buffer.from(compile('../src/keyboard.ts')).toString('base64')}`);
test('Space shortcut permits transport, ignores repeats, typing, Cue and handled keys',()=>{
  const base={code:'Space',repeat:false,ctrlKey:false,metaKey:false,altKey:false,defaultPrevented:false,target:null};
  assert.equal(isTransportSpace(base),true);
  for(const key of ['repeat','ctrlKey','metaKey','altKey','defaultPrevented']) assert.equal(isTransportSpace({...base,[key]:true}),false);
  assert.equal(isTransportSpace({...base,code:'KeyA'}),false);
  assert.equal(isTransportSpace({...base,target:{closest:()=>({})}}),false);
});
function jog(deck) {
  let src=compile('../src/components/JogWheel.tsx');
  src=src.replace(/^import .*;$/gm,'').replace('export default function','function');
  return new Function('useRef','_jsx','_jsxs',src+'\nreturn JogWheel;')(()=>({current:null}),(_,props)=>props,(_,props)=>props)({deck});
}
test('actual platter handlers scratch in both directions and release once, ignoring other pointers',()=>{
  let starts=0,releases=0;const moves=[];
  const handlers=jog({state:{id:'A',playing:true,track:{duration:100}},position:.5,grid:null,
    scratchDown:()=>starts++,scratchMove:p=>moves.push(p),scratchUp:()=>releases++});
  const target={getBoundingClientRect:()=>({left:0,top:0,width:100,height:100}),setPointerCapture:()=>{}};
  const e=(x,y,pointerId=1,button=0)=>({clientX:x,clientY:y,pointerId,button,currentTarget:target,preventDefault:()=>{}});
  handlers.onPointerDown(e(100,50,1,2));assert.equal(starts,0);
  handlers.onPointerDown(e(100,50));handlers.onPointerDown(e(100,50,2));assert.equal(starts,1);
  handlers.onPointerMove(e(50,100));handlers.onPointerMove(e(100,50));assert.ok(moves[0]>.5);assert.equal(moves[1],.5);
  handlers.onPointerUp(e(100,50,2));assert.equal(releases,0);
  handlers.onPointerCancel(e(100,50));handlers.onLostPointerCapture(e(100,50));assert.equal(releases,1);
});

const {waveformView}=await import(`data:text/javascript;base64,${Buffer.from(compile('../src/waveformView.ts')).toString('base64')}`);
test('moving waveform stays centered from beginning to end and overview stays within bounds',()=>{
  for(const position of [0,.01,.5,.99,1]) {
    const {start,win}=waveformView(6000,.08,position,true);
    assert.ok(Math.abs((position*6000-start)/win-.5)<1e-10);
    const overview=waveformView(6000,.08,position,false);
    assert.ok(overview.start>=0);assert.ok(overview.start+overview.win<=6000);
  }
  const slow=waveformView(6000,8*.8/100,.5,true),fast=waveformView(6000,8*1.2/100,.5,true);
  assert.equal(fast.win/slow.win,1.5);
});
function panel(deck) {
  const src=compile('../src/components/DeckPanel.tsx').replace(/^import .*;$/gm,'').replace('export default function','function');
  return new Function('useRef','useState','_jsx','_jsxs','Waveform','JogWheel','TempoControl','validLoop','STEM_MODES',src+'\nreturn DeckPanel;')(
    ()=>({current:null}),v=>[v,()=>{}],(type,props)=>({type,props}),(type,props)=>({type,props}),'Waveform','JogWheel','TempoControl',()=>false,[{id:'full',label:'FULL MIX'},{id:'acapella',label:'ACAPELLA'},{id:'instrumental',label:'INSTRUMENTAL'},{id:'vocal-reprise',label:'VOCAL REPRISE'},{id:'instrumental-reprise',label:'INSTRUMENTAL REPRISE'}]
  )({deck,label:'Deck A',ensureAudio:async()=>{},canSync:true,onSync:()=>{},onBeatLock:()=>{},onSelect:()=>{},selected:true,onRemember:()=>{}});
}
function buttons(node) {
  if (!node || typeof node!=='object') return [];
  if(Array.isArray(node)) return node.flatMap(buttons);
  return [...(node.type==='button'?[node.props]:[]),...buttons(node.props?.children)];
}
test('actual Cue and numbered pad handlers dispatch holds, releases and shift-clear',()=>{
  const calls=[];const deck={stemMode:'full',stemsReady:false,stemStatus:"",state:{id:'A',track:{duration:100},hotCues:[null,.1,null,.3,null],cueNorm:0,eqLow:0},position:.2,
    cueDown:()=>calls.push('down'),cueUp:()=>calls.push('up'),hotCue:(i,clear)=>calls.push([i,clear])};
  const all=buttons(panel(deck));const cue=all.find(b=>b.children==='CUE');
  const event={button:0,pointerId:1,currentTarget:{setPointerCapture:()=>{}},preventDefault:()=>{},key:' ',repeat:false};
  cue.onPointerDown(event);cue.onPointerCancel(event);cue.onKeyDown({...event,repeat:true});cue.onKeyDown(event);cue.onKeyUp(event);
  assert.deepEqual(calls,['down','up','down','up']);
  const pads=all.filter(b=>b['aria-label']?.startsWith('Deck A hot cue '));assert.equal(pads.length,5);
  pads[0].onClick({shiftKey:false});pads[4].onClick({shiftKey:true});
  assert.deepEqual(calls.slice(-2),[[0,false],[4,true]]);
});

test('five stem modes have distinct labels and dispatch their selected mode',()=>{
 const selected=[];
 const all=buttons(panel({state:{id:'A',track:{duration:45},hotCues:Array(5).fill(null),cueNorm:0},stemMode:'vocal-reprise',stemsReady:true,
   stemStatus:'ready',selectStems:mode=>selected.push(mode),position:0}));
 const modes=all.filter(b=>['FULL MIX','ACAPELLA','INSTRUMENTAL','VOCAL REPRISE','INSTRUMENTAL REPRISE'].includes(b.children));
 assert.equal(modes.length,5);assert.equal(modes.filter(b=>b['aria-pressed']).length,1);
 for(const mode of modes) mode.onClick();
 assert.deepEqual(new Set(selected),new Set(['full','acapella','instrumental','vocal-reprise','instrumental-reprise']));
 assert.equal(all.some(b=>b.children==='VOCALS'),false);
});

test('Retry Stems appears only after failure, never during preparation or when ready',()=>{
 const deck={state:{id:'A',track:{duration:45},hotCues:Array(5).fill(null),cueNorm:0},stemMode:'full',stemStatus:'',position:0};
 for(const [stemsReady,stemsFailed,expected] of [[false,false,false],[true,false,false],[false,true,true]]) {
  const all=buttons(panel({...deck,stemsReady,stemsFailed}));
  assert.equal(all.some(b=>b.children==='RETRY STEMS'),expected);
 }
});

// Run the shipped AudioWorklet/WASM in a simulated render thread, not a browser.
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
export async function worklet(sampleRate=48000) {
 let Processor, resolveReady;
 const ready=new Promise(resolve=>{resolveReady=resolve;});
 const replies=new Map();
 class Base {
  constructor(){this.port={postMessage(data){
   if(data[0]==='ready')resolveReady();else replies.set(data[0],data[1]);
  }};}
 }
 const context=vm.createContext({ AudioWorkletProcessor:Base,registerProcessor:(_name,cls)=>{Processor=cls;},
   sampleRate,currentTime:0,console,WebAssembly,TextDecoder,Float32Array,Uint8Array,Uint32Array,Int32Array,
   ArrayBuffer,crypto:webcrypto,performance,atob,setTimeout,clearTimeout });
 const code=readFileSync(new URL('../../src/vendor/SignalsmithStretch.mjs',import.meta.url),'utf8')
   .replace('export default _export;','');
 vm.runInContext(code,context);
 const processor=new Processor({numberOfOutputs:1,outputChannelCount:[2]});
 await ready;
 let id=0, frame=0;
 return {
   processor,
   now:()=>frame/sampleRate,
   command(method,...args){const request=id++;processor.port.onmessage({data:[request,method,...args]});return replies.get(request);},
   render(frames){
    const length=Math.ceil(frames/128)*128;
    const out=[new Float32Array(length),new Float32Array(length)];
    for(let i=0;i<length;i+=128){
     context.currentTime=frame/sampleRate;
     const block=[new Float32Array(128),new Float32Array(128)];
     processor.process([[]],[block],{});
     out[0].set(block[0],i);out[1].set(block[1],i);frame+=128;
    }
    context.currentTime=frame/sampleRate;
    return out;
   }
 };
}

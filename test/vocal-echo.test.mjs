import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

test('echo repeats only the preceding beat, decays, and clears on cue jumps', () => {
  let Processor;
  const sampleRate = 48000;
  const beat = Math.round(sampleRate * 60 / 118);
  vm.runInNewContext(readFileSync(new URL('../public/vocal-echo-worklet.js', import.meta.url), 'utf8'), {
    sampleRate,
    AudioWorkletProcessor: class { port = {}; },
    registerProcessor: (_name, implementation) => { Processor = implementation; },
  });
  const processor = new Processor();
  const render = (left, right) => {
    const output = [new Float32Array(beat), new Float32Array(beat)];
    processor.process([[left, right]], [output]);
    return output;
  };
  const left = new Float32Array(beat).fill(.25);
  const right = new Float32Array(beat).fill(-.125);
  const zero = new Float32Array(beat);
  render(new Float32Array(beat).fill(.9), zero);
  assert.ok(render(left, right)[0].every(value => value === 0));
  processor.port.onmessage({ data: { seconds: 60 / 118 } });
  for (let i = 0; i < 8; i++) {
    const [l, r] = render(zero, zero);
    assert.ok(Math.abs(l[beat >> 1] - .25 * .52 * .48 ** i) < 1e-7);
    assert.ok(Math.abs(r[beat >> 1] + .125 * .52 * .48 ** i) < 1e-7);
    assert.equal(l[0], 0);
    assert.equal(l.at(-1), 0);
  }
  assert.ok(render(zero, zero)[0].every(value => value === 0));
  render(left, right);
  processor.port.onmessage({ data: { seconds: 60 / 118 } });
  processor.port.onmessage({ data: 'clear' });
  assert.ok(render(zero, zero)[0].every(value => value === 0));
});

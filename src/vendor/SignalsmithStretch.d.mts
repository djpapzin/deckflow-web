export interface StretchSchedule {
  output?: number; input?: number; rate?: number; active?: boolean;
  semitones?: number; loopStart?: number; loopEnd?: number;
}
export interface StretchNode extends AudioWorkletNode {
  dispose(): Promise<void>;
  schedule(change: StretchSchedule): Promise<unknown>;
  addBuffers(channels: Float32Array[], transfer?: ArrayBuffer[]): Promise<number>;
  dropBuffers(): Promise<unknown>;
  configure(config: {preset?: 'default' | 'cheaper'; blockMs?: number; intervalMs?: number}): Promise<unknown>;
  latency(): Promise<number>;
}
declare const SignalsmithStretch: {
  (context: AudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
  moduleUrl?: string;
};
export default SignalsmithStretch;

// DeckControls — the per-deck mixer strip: 3-band EQ, DJ filter, and volume + meter.
// Driven entirely by a UseDeck instance, so it drops straight into a second deck in P3.

import type { UseDeck } from '../useDeck';
import Knob from './Knob';
import Fader from './Fader';

const dB = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}`;

function filterLabel(v: number): string {
  if (Math.abs(v) < 0.02) return 'OFF';
  return v < 0 ? `LP ${Math.round(-v * 100)}` : `HP ${Math.round(v * 100)}`;
}

export default function DeckControls({ deck, tempoLocked = false }: { deck: UseDeck; tempoLocked?: boolean }) {
  const { state, level } = deck;

  return (
    <div className="deck-controls">
      <div className="tempo-control">
        <label htmlFor={`tempo-${state.id}`}>TEMPO {state.id}</label>
        <output htmlFor={`tempo-${state.id}`}>{((state.tempo - 1) * 100).toFixed(1)}%</output>
        <input id={`tempo-${state.id}`} type="range" min={0.5} max={1.5} step={0.001}
          value={state.tempo} onChange={(e) => deck.setTempo(Number(e.target.value))} disabled={!state.track || tempoLocked} />
        <button className="btn ghost" onClick={() => deck.setTempo(1)} disabled={!state.track || tempoLocked}>{tempoLocked ? 'Follows leader' : 'Reset tempo'}</button>
        <button className={`btn ghost ${state.keyLock ? 'active' : ''}`} aria-pressed={state.keyLock}
          onClick={deck.toggleKeyLock} title="Keep the original pitch when tempo changes">Key Lock {state.keyLock ? 'ON' : 'OFF'}</button>
      </div>
      <div className="eq-group">
        <Knob label="HIGH" value={state.eqHigh} min={-12} max={12} onChange={(v) => deck.setEq('eqHigh', v)} format={dB} />
        <Knob label="MID" value={state.eqMid} min={-12} max={12} onChange={(v) => deck.setEq('eqMid', v)} format={dB} />
        <Knob label="LOW" value={state.eqLow} min={-12} max={12} onChange={(v) => deck.setEq('eqLow', v)} format={dB} />
      </div>
      <Knob
        label="FILTER"
        value={state.filterCutoff}
        min={-1}
        max={1}
        onChange={deck.setFilter}
        format={filterLabel}
      />
      <Fader value={state.volume} level={level} onChange={deck.setVolume} label={`Deck ${state.id}`} />
    </div>
  );
}

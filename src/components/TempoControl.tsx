import type { UseDeck } from '../useDeck';

export default function TempoControl({ deck, locked }: { deck: UseDeck; locked: boolean }) {
  const { state } = deck;
  return <div className="tempo-control">
    <label htmlFor={`tempo-${state.id}`}>PITCH / TEMPO</label>
    <output htmlFor={`tempo-${state.id}`}>{state.tempo >= 1 ? '+' : ''}{((state.tempo - 1) * 100).toFixed(1)}<small>%</small></output>
    <div className="pitch-rail"><span>−</span>
      <input id={`tempo-${state.id}`} type="range" min={.5} max={1.5} step={.001}
        aria-label={`Deck ${state.id} tempo`} value={state.tempo} disabled={!state.track || locked}
        onChange={e => deck.setTempo(Number(e.target.value))} />
      <span>+</span>
    </div>
    <button className="btn ghost" disabled={!state.track || locked} onClick={() => deck.setTempo(1)}>{locked ? 'LOCKED' : 'RESET'}</button>
    <button className={`btn key-lock ${state.keyLock ? 'active' : ''}`} aria-pressed={state.keyLock}
      onClick={deck.toggleKeyLock} title="Preserve original pitch while changing tempo">KEY LOCK <b>{state.keyLock ? 'ON' : 'OFF'}</b></button>
  </div>;
}

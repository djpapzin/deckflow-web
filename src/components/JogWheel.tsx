import { useRef } from 'react';
import type { UseDeck } from '../useDeck';

export default function JogWheel({ deck, showRemaining = false, onToggleTime }: { deck: UseDeck; showRemaining?: boolean; onToggleTime?: () => void }) {
  const gesture = useRef<{ angle: number; position: number; pointerId: number } | null>(null);
  const duration = deck.state.track?.duration ?? 0;
  const seconds = deck.position * duration;
  const timerSeconds = showRemaining ? Math.max(0,duration-seconds) : seconds;
  const minutes = Math.floor(timerSeconds / 60);
  const displayTime = `${showRemaining ? '−' : ''}${minutes.toString().padStart(2,'0')}:${(timerSeconds % 60).toFixed(1).padStart(4,'0')}`;
  const angle = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
  };
  const release = (pointerId?: number) => {
    if (!gesture.current || (pointerId !== undefined && pointerId !== gesture.current.pointerId)) return;
    gesture.current = null; deck.scratchUp();
  };
  return <div className={`jog-wheel ${deck.state.playing ? 'spinning' : ''} ${duration ? '' : 'empty'}`}
    role="slider" aria-label={`Deck ${deck.state.id} jog wheel`} tabIndex={duration ? 0 : -1}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(deck.position * 100)}
    aria-valuetext={`${seconds.toFixed(1)} seconds`} aria-disabled={!duration}
    title="Hold and drag the platter to scratch forward or backward. Release to resume. Arrow keys seek."
    onPointerDown={e => {
      if (!duration || e.button !== 0 || gesture.current) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); deck.scratchDown();
      gesture.current = { angle: angle(e), position: deck.position, pointerId: e.pointerId };
    }}
    onPointerMove={e => {
      if (!gesture.current || !duration || e.pointerId !== gesture.current.pointerId) return;
      const a = angle(e);
      let delta = a - gesture.current.angle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      const secondsPerTurn = deck.grid ? 8 * 60 / deck.grid.bpm : 4;
      const position = Math.max(0, Math.min(1, gesture.current.position + delta / (Math.PI * 2) * secondsPerTurn / duration));
      gesture.current = { angle: a, position, pointerId: e.pointerId }; deck.scratchMove(position);
    }}
    onPointerUp={e => release(e.pointerId)} onPointerCancel={e => release(e.pointerId)}
    onLostPointerCapture={e => release(e.pointerId)}
    onBlur={() => release()}
    onKeyDown={e => {
      if (!duration || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); deck.seek(Math.max(0, Math.min(1, deck.position + (e.key === 'ArrowRight' ? .25 : -.25) / duration)));
    }}>
    <div className="jog-ticks" />
    <div className="vinyl" style={{ transform: `rotate(${seconds * 200}deg)` }}><span className="vinyl-line" /></div>
    <div className="jog-label"><small>DECK {deck.state.id}</small><button className="jog-time-toggle" aria-label={`Deck ${deck.state.id} platter time: ${showRemaining ? 'remaining' : 'elapsed'}. Click to toggle`}
      onPointerDown={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onClick={onToggleTime}>{displayTime}</button><b>{deck.grid ? (deck.grid.bpm * deck.state.tempo).toFixed(1) : '—'} <i>BPM</i></b><span>{deck.state.playing ? 'PLAYING' : duration ? 'READY' : 'LOAD TRACK'}</span></div>
    <span className="platter-marker" />
  </div>;
}

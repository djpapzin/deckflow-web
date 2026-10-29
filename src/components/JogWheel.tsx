import { useRef } from 'react';
import type { UseDeck } from '../useDeck';

export default function JogWheel({ deck }: { deck: UseDeck }) {
  const gesture = useRef<{ angle: number; position: number } | null>(null);
  const duration = deck.state.track?.duration ?? 0;
  const seconds = deck.position * duration;
  const minutes = Math.floor(seconds / 60);
  const displayTime = `${minutes.toString().padStart(2,'0')}:${(seconds % 60).toFixed(1).padStart(4,'0')}`;
  const angle = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
  };
  return <div className={`jog-wheel ${deck.state.playing ? 'spinning' : ''} ${duration ? '' : 'empty'}`}
    role="slider" aria-label={`Deck ${deck.state.id} jog wheel`} tabIndex={duration ? 0 : -1}
    aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(deck.position * 100)}
    aria-valuetext={`${seconds.toFixed(1)} seconds`} aria-disabled={!duration}
    title="Drag around the platter to seek. Arrow keys move a quarter second."
    onPointerDown={e => {
      if (!duration) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      gesture.current = { angle: angle(e), position: deck.position };
    }}
    onPointerMove={e => {
      if (!gesture.current || !duration) return;
      const a = angle(e);
      let delta = a - gesture.current.angle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      const secondsPerTurn = deck.grid ? 8 * 60 / deck.grid.bpm : 4;
      const position = Math.max(0, Math.min(1, gesture.current.position + delta / (Math.PI * 2) * secondsPerTurn / duration));
      gesture.current = { angle: a, position }; deck.seek(position);
    }}
    onPointerUp={() => { gesture.current = null; }} onPointerCancel={() => { gesture.current = null; }}
    onLostPointerCapture={() => { gesture.current = null; }}
    onKeyDown={e => {
      if (!duration || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault(); deck.seek(Math.max(0, Math.min(1, deck.position + (e.key === 'ArrowRight' ? .25 : -.25) / duration)));
    }}>
    <div className="jog-ticks" />
    <div className="vinyl" style={{ transform: `rotate(${seconds * 200}deg)` }}><span className="vinyl-line" /></div>
    <div className="jog-label"><small>DECK {deck.state.id}</small><strong>{displayTime}</strong><b>{deck.grid ? (deck.grid.bpm * deck.state.tempo).toFixed(1) : '—'} <i>BPM</i></b><span>{deck.state.playing ? 'PLAYING' : duration ? 'READY' : 'LOAD TRACK'}</span></div>
    <span className="platter-marker" />
  </div>;
}

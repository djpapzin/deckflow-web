// Knob — a small rotary control. Drag vertically to change; double-click to reset.
// Used for the 3-band EQ and the DJ filter. Ported from the desktop EQKnob, with the
// Tailwind classes swapped for plain CSS.

import { useCallback, useRef } from 'react';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

export default function Knob({
  label,
  value,
  min,
  max,
  defaultValue = 0,
  onChange,
  format,
}: Props) {
  const dragRef = useRef<{ startY: number; startValue: number; pointerId: number } | null>(null);
  const rotation = ((value - min) / (max - min)) * 270 - 135;
  const release = (e: React.PointerEvent) => {
    if (dragRef.current?.pointerId === e.pointerId) dragRef.current = null;
  };
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 || dragRef.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startValue: value, pointerId: e.pointerId };
  }, [value]);

  return (
    <div className="knob">
      <span className="knob-label">{label}</span>
      <div
        className="knob-body"
        role="slider" tabIndex={0} aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
        onPointerDown={handlePointerDown}
        onPointerMove={e => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== e.pointerId) return;
          const next = drag.startValue + (drag.startY-e.clientY)*(max-min)/150;
          onChange(Math.max(min,Math.min(max,Math.round(next*100)/100)));
        }}
        onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
        onKeyDown={e => {
          if (e.key === 'Home') { e.preventDefault(); onChange(defaultValue); }
          if (['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)) {
            e.preventDefault();
            const step=(max-min)/100 * (['ArrowUp','ArrowRight'].includes(e.key)?1:-1);
            onChange(Math.max(min,Math.min(max,value+step)));
          }
        }}
        onDoubleClick={() => onChange(defaultValue)}
      >
        <div className="knob-dial" style={{ transform: `rotate(${rotation}deg)` }}>
          <div className="knob-tick" />
        </div>
      </div>
      <span className="knob-value">{format ? format(value) : value.toFixed(1)}</span>
    </div>
  );
}

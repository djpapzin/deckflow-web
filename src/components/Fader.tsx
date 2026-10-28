// Fader — vertical volume fader with a live level meter beside it.
// The meter level is the post-fader signal reported by el.meter in the deck graph.

interface Props {
  value: number; // 0..1
  level: number; // 0..1 meter
  onChange: (value: number) => void;
  label: string;
}

export default function Fader({ value, level, onChange, label }: Props) {
  return (
    <div className="fader">
      <span className="knob-label">VOL</span>
      <div className="fader-body">
        <input
          className="fader-input"
          type="range"
          aria-label={`${label} volume`}
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
        />
        <div className="meter" role="meter" aria-label={`${label} audio level`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}>
          <div className="meter-fill" style={{ height: `${Math.min(100, level * 100)}%` }} />
        </div>
      </div>
      <span className="knob-value">{Math.round(value * 100)}</span>
    </div>
  );
}

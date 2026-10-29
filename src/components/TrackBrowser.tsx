import { useRef, useState } from 'react';

export interface SessionTrack { id: string; file: File; demo: boolean }
export const fileId = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
interface Props {
  tracks: SessionTrack[];
  addFiles: (files: File[]) => void;
  load: (track: SessionTrack, deck: 'A' | 'B') => Promise<void>;
  info: Record<string, { bpm?: number; duration?: number; decks: string }>;
}
export default function TrackBrowser({ tracks, addFiles, load, info }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [demosOnly, setDemosOnly] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('Files stay on your device. This session clears when you reload.');
  const visible = tracks.filter(t => (!demosOnly || t.demo) && t.file.name.toLowerCase().includes(query.toLowerCase()));
  const loadInto = async (track: SessionTrack, deck: 'A' | 'B') => {
    setBusy(`${track.id}:${deck}`);
    try { await load(track, deck); setMessage(`${track.file.name} loaded into Deck ${deck}.`); }
    catch (error) { setMessage(`Could not load this audio: ${String(error)}`); }
    finally { setBusy(null); }
  };
  const importFiles = (files: File[]) => {
    const audio = files.filter(f => f.type.startsWith('audio/') || /\.(wav|mp3|flac|aif|aiff|m4a|ogg|aac)$/i.test(f.name));
    addFiles(audio); setMessage(audio.length ? `${audio.length} audio file${audio.length === 1 ? '' : 's'} added to this session.` : 'Choose supported audio files.');
  };
  return <section className="track-browser" aria-label="Music browser"
    onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); importFiles(Array.from(e.dataTransfer.files)); }}>
    <div className="browser-toolbar"><span>▸ SESSION / LOCAL FILES</span><span className="file-count">{tracks.length} FILES</span>
      <label><span className="search-icon">⌕</span><input aria-label="Search music" placeholder="Search tracks…" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <button className="btn" onClick={() => input.current?.click()}>+ ADD MUSIC</button>
      <input ref={input} type="file" multiple accept="audio/*,.wav,.mp3,.flac,.aiff,.aif,.m4a,.ogg" hidden aria-label="Import music files"
        onChange={e => { importFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
    </div>
    <div className="browser-body"><aside className="browser-sidebar">
      <button className={!demosOnly ? 'selected' : ''} onClick={() => setDemosOnly(false)}>▤ All tracks <b>{tracks.length}</b></button>
      <button className={demosOnly ? 'selected' : ''} onClick={() => setDemosOnly(true)}>♫ Demo tracks <b>{tracks.filter(t => t.demo).length}</b></button>
      <p>LOCAL SESSION<br />No uploads<br />No account needed</p>
    </aside><div className="track-table-wrap"><table className="track-table"><thead><tr><th>TRACK TITLE</th><th>BPM</th><th>LENGTH</th><th>DECK</th><th>LOAD</th></tr></thead>
      <tbody>{visible.map(track => {
        const meta = info[track.id];
        return <tr key={track.id}><td title={track.file.name}><span className="track-file-icon">♫</span>{track.file.name}</td>
          <td>{meta?.bpm?.toFixed(1) ?? '—'}</td><td>{meta?.duration ? `${Math.floor(meta.duration / 60)}:${Math.floor(meta.duration % 60).toString().padStart(2,'0')}` : '—'}</td>
          <td>{meta?.decks || '—'}</td><td><button className="btn load-a" disabled={!!busy} onClick={() => void loadInto(track,'A')}>A</button><button className="btn load-b" disabled={!!busy} onClick={() => void loadInto(track,'B')}>B</button></td></tr>;
      })}</tbody></table>
      {!visible.length && <div className="browser-empty"><strong>{tracks.length ? 'NO MATCHING TRACKS' : 'YOUR MUSIC. YOUR MIX.'}</strong>
        <p>{tracks.length ? 'Try another search or switch to All tracks.' : 'Add your music, drop audio files here, or load a demo above.'}</p>
        {!tracks.length && <button className="btn" onClick={() => input.current?.click()}>ADD MUSIC TO SESSION</button>}
      </div>}
    </div></div><div className="browser-status" role="status">{message}</div>
  </section>;
}

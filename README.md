# DeckFlow Web

A browser DJ mixing prototype with two decks, automatic BPM detection, continuous
Sync, and pitch-preserving Key Lock. The compact blue/red console is inspired by
the Mix Lab for VDJ 8 reference: outer pitch rails, inner circular time/BPM
displays, central mixer, and a searchable music browser below. No account or music
upload required.

## Use it

Open the GitHub Pages link shown in this repository's About section. Desktop Chrome
or Edge is a good starting point; use headphones or speakers connected to your computer.

1. Use **ADD MUSIC** (or drop audio files into the music browser), then load a row
   into **A** or **B**. You can also use **LOAD TRACK** or **DEMO** on each deck.
2. Play Deck A, then press **Sync on Deck B** to match once, or **Beat Lock** to keep B following A.
3. With Beat Lock active, change A's tempo. B follows; **Key Lock ON** preserves pitch.
4. Use the EQ, filters, channel volume and crossfader to mix.
5. Sync never starts or pauses a song. Press Play on each deck yourself; tempo
   stays linked with Beat Lock, and beat alignment engages when both decks are playing. Press
   Beat Lock again to unlock.

Correct an inaccurate beat grid with **Track BPM**, **Tap tempo**, **÷2 / ×2**,
and **Set beat here**. The upper blue/red rhythm waveforms scroll through an eight-second window;
individual deck waveforms show the whole track. Both support seeking and wheel zoom.
Hold and drag a platter clockwise/counterclockwise to scratch forward/backward; hovering does nothing.
Release to resume if it was playing. Scratching uses direct stereo PCM playback (speed changes pitch),
while normal playback uses pitch-preserving time stretch. Focus loss releases a held platter.

Five **HOT CUES** per deck: click an empty slot to mark the current position; click a saved slot
to jump and play. Shift-click clears a slot. Markers appear on the waveforms. They last for the loaded
track in this session. The main **CUE** button stops at the saved cue while playing; while paused,
hold it to set/preview the current position, then release to return. Play during preview keeps playback going.
Click a deck to select it; **Space** toggles that deck's playback (typing fields and main Cue keep their own keys).
Cue and manual loops work independently; Sync exits the follower's loop. A track replacement,
follower end, or unsupported tempo releases Beat Lock. Beat Lock realigns after a scratch when both decks play.
Scratching adds a second in-memory stereo PCM copy per deck. Mouse scratch responsiveness depends on the
browser and pointer event rate; this is not a claim of matching VirtualDJ's native audio engine.

Audio is decoded and processed in your browser's memory. Nothing uploads your music.
Reloading clears the session. Browser codec support varies; WAV is a useful fallback.
Use the demos for a first test before loading long files on a phone.

This is a teaching prototype: beat grids can be wrong, variable-tempo tracks need
attention, and extreme stretching can cause artifacts. There is a short transport
response delay, one stereo output, and no headphone bus, recording or saved library.

## Development

Node.js 22 or later:

```sh
npm ci
npm test
npm run dev
```

`npm run build` produces a static site in `dist/`. Every push to `main` runs the test
suite and deploys that build to GitHub Pages. Pull requests run tests/build only.

## Origins and third-party code

Adapted from IBM SkillsBuild's [Build a DJ Application lab](https://github.com/academic-initiative/skillsbuild/tree/main/ibm-bob/ai-in-arts-dj-app),
with BPM analysis, persistent beat sync and Signalsmith Stretch added using Codex.
See [NOTICE.md](NOTICE.md) and the vendored Signalsmith license. This project is not
affiliated with VirtualDJ, Native Instruments or IBM. No blanket license is claimed
for the upstream IBM material; retain its provenance when reusing it.

# DeckFlow Web

A browser DJ mixing prototype with two decks, automatic BPM detection, continuous
Sync, and pitch-preserving Key Lock. No account or music upload required.

## Use it

Open the GitHub Pages link shown in this repository's About section. Desktop Chrome
or Edge is a good starting point; use headphones or speakers connected to your computer.

1. Load a track on each deck, or try **Load demo**.
2. Play Deck A, then press **Sync on Deck B** to lock B to A.
3. Change A's tempo. B follows; **Key Lock ON** preserves pitch.
4. Use the EQ, filters, channel volume and crossfader to mix.
5. Press the lit Sync button to unlock. While locked, use the leader's Play/Pause.

Correct an inaccurate beat grid with **Track BPM**, **Tap tempo**, **÷2 / ×2**,
and **Set beat here**. Waveforms support click-to-seek and wheel zoom. Cue and manual
loops work independently; Sync exits the follower's loop. A track replacement,
follower end, or unsupported tempo releases Sync.

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

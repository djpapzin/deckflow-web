# DeckFlow Web v1.0

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

## Automatic live stems (Mac companion)

Run `scripts/start-stems.command`, then open http://127.0.0.1:8787 in your browser.
Requires the installed audio-separator CLI at ~/.local/share/deckflow-stems/venv/bin/audio-separator,
the htdemucs.yaml model (downloaded automatically into ~/.local/share/deckflow-stems/models), and the UVR bundled ffmpeg.
The companion binds only to 127.0.0.1 and hosts the production app locally.
The GitHub Pages app can also connect to the companion if the browser allows localhost requests;
the localhost app avoids cross-origin/local-network restrictions.

Loading a track automatically queues local separation; the original remains playable.
Once STEMS READY appears, select exactly one mode: FULL MIX uses the original recording;
INSTRUMENTAL mixes drums, bass and other instruments; ACAPELLA uses vocals; VOCAL REPRISE
mixes vocals, bass and other instruments without drums; INSTRUMENTAL REPRISE mixes bass
and other instruments without vocals or drums. There is no duplicate Vocals control. Stem players share
all scheduled transport, tempo, key-lock, loop and Sync changes; switching gains does not seek.
Scratch playback uses the selected stem pair too. Preparation separates vocals, drums, bass and other instruments. Drum removal may leave
some percussion bleed. Tracks with no vocals should have similar reprise versions, but vocal
separation artifacts can make them differ slightly. First processing takes time;
repeat loads reuse cached results. There is extra memory overhead for the four stereo stems.

Tracks (up to 100 MB) and results stay in ~/Library/Application Support/DeckFlow/stems.
This cache persists across reloads; remove its contents manually when no jobs are running
to reclaim space. One job runs at a time, with up to eight queued/active jobs and a 30-minute
job timeout. Separation errors leave normal playback usable; RETRY STEMS retries preparation.
Replacing a deck discards stale UI/audio attachment results but a queued separation may finish
and remain cached. The companion must remain running. No music is sent to an external server.

Clicking DEMO on either deck loads the 45-second Let's Go Fishin’ vocal demo, paused; nothing loads automatically at startup.
The demo is by Karissa Hobbs (CC BY 3.0); attribution is available beside the console
and in public/demo-song-license.txt. Playback starts only when Play is pressed.

## Development and releases

Production is `https://deckflow.djpapzin.com`, deployed by GitHub Pages from `main`.
The development preview is `https://dev.deckflow.djpapzin.com`, deployed to the
separate Cloudflare Pages project `deckflow-dev` by `.github/workflows/dev.yml`.
Pushes to `dev` run tests and build with `VITE_APP_ENV=development`, showing a
DEV PREVIEW badge. The preview sends a noindex header. It still needs the local
stem companion; it is not a hosted separation service.

The dev workflow requires the encrypted GitHub secrets `CLOUDFLARE_DEV_API_TOKEN`
(Pages Edit permission for the hosting account) and `CLOUDFLARE_ACCOUNT_ID`.
Promote tested changes through a `dev` → `main` pull request after Codex review.
Pushing `dev` does not deploy production.

### Connect the hosted dev preview to your Mac

Start the local stem companion, then click **CONNECT MAC STEMS** on the dev site.
Keep the small Mac connection window or embedded panel open while using stems.
The companion serves this panel from loopback only. It accepts messages only from
the trusted dev origin and requesting window, and relays only fixed stem API paths.
Audio and model processing remain on your Mac. No public tunnel is required.
The localhost app continues to access the companion directly.

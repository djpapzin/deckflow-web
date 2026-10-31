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
This opens `http://127.0.0.1:8787/dev/`, the Mac-connected dev view. It serves the
latest public dev build through the loopback companion, so the browser can use
same-origin stem requests. Only fixed frontend assets are fetched from the dev
site; songs and stem audio remain local. The hosted dev address and production
site retain their separate deployments. Start this view before loading music.

## Roadmap

Status updated **31 October 2026**. “Live” means published to production;
“Dev / testing” means available for feedback on dev but not yet promoted.

### Live

Production: [deckflow.djpapzin.com](https://deckflow.djpapzin.com/).

- Two-deck browser mixing: BPM detection, Sync, continuous Beat Lock, pitch-preserving
  tempo changes, EQ, channel volume and crossfader. Sync does not start playback.
- Scratching, main cue, five hot cues, manual In/Out loops, Space play/pause and
  moving waveforms. The existing layout is blue/red with a central mixer.
- Mobile landscape layout, portrait rotation prompt and iPhone Safari audio fix.
  DJ confirmed iPhone scratching, cues and crossfader; broader Android testing remains planned.
- Oracle-hosted stems and YouTube imports: hosted users do not need the Mac companion.
  Fast is the default; Better Quality requests an upgrade. Stem modes include Full Mix,
  Instrumental, Acapella, Beat, Vocal Reprise and Instrumental Reprise.
- Public YouTube audio converts to MP3 and loads before automatic stem preparation.
  Import only audio you own or have permission to use. Restricted videos, session expiry
  and YouTube verification can still prevent imports.
- YouTube MP3 caching (256 MiB, six-hour expiry), separate import/deck-load and
  split/stem-load timing labels, and guarded Oracle storage admission/cleanup.
- Optional Mac-connected views: with the local companion running,
  [local production](http://127.0.0.1:8787/live/) and
  [local dev](http://127.0.0.1:8787/dev/) use local processing instead of Oracle.
  The companion also supports local YouTube imports.

Oracle is currently a limited tester backend, not a service sized for many simultaneous
users. A recent full-song Fast run took about **21 minutes to split**, followed by
roughly **74 seconds to transfer/load stems**. Download caching speeds up repeated
imports; it does not speed up a first-time separation. Timings vary with load.

### Dev / testing — not promoted to production

Preview: [dev.deckflow.djpapzin.com](https://dev.deckflow.djpapzin.com/).
Pull request: [Mix Lab layout, beat loops and switchable timers](https://github.com/djpapzin/deckflow-web/pull/11).

- Refined Mix Lab-inspired layout: tighter console, compact shared waveforms,
  mirrored loop/cue panels beside the platters, and expandable import/connection details.
- Instant **1, 2, 4, 8, 16 and 32 beat loops**, with active-button exit.
  A detected or manually entered BPM is required; Beat Lock followers cannot set loops.
- Click track or platter timers to toggle elapsed and remaining time, with keyboard
  handling isolated from the Space transport shortcut.
- Remember manually entered BPM and beat-grid offsets for the exact audio file
  across refresh and loading that song again, including the demo. This stores bounded
  browser-local metadata, not audio, and does not assign a made-up demo BPM.
- Compact waveform cue labels fitted to the shorter canvases.
- User-supplied [Mix Lab reference](docs/references/README.md) saved with the project,
  outside the shipped website assets, for continuing layout feedback.

Validation so far: DJ reported the app and loop controls working; the demo BPM reload
issue was then fixed and verified on hosted dev. The functional update at `2dd7568` passed 75 frontend
tests, TypeScript, build, dev deployment and Codex review. Continue user feedback and
mobile checks before promotion. Merge/publication requires DJ’s explicit approval.

### Planned

- Finish matching the saved reference through DJ’s layout and control-feel feedback.
- Promote the reviewed dev changes after testing and explicit approval.
- Reduce first-time Oracle stem processing time through bounded CPU/model-loading
  benchmarks; evaluate separate GPU hosting if needed. Preserve current stem quality
  and avoid disrupting other VPS services; no GPU rollout is approved or implemented.
- Improve progress estimates, loading diagnostics and failure recovery as testing
  reveals gaps. Current timings and countdowns are estimates, not completion guarantees.
- Broaden real-device Android and iPhone testing, especially loops, timers, audio,
  scratching and mixing in landscape.
- Before expanding beyond a small tester group, evaluate authentication, user/job
  isolation, capacity, fair-use limits and operating costs. Existing queue/rate/storage
  guards are live; this additional scaling work is not complete.

## Oracle service operation

### Oracle tester backend

Hosted builds use `VITE_STEM_API_URL=https://api-deckflow.djpapzin.com`; Mac-connected
views on port 8787 continue to use their local companion. Cloud uploads are
limited to 30 MB and ten minutes, with one CPU separation worker and two queued
or processing jobs. Temporary stem jobs expire after six hours (cleanup every
five minutes). A 4 GiB cache budget reserves room for pending work and refuses new
jobs if doing so would reduce free space below 12 GiB. Limits apply only to the
DeckFlow service's generated data; other VPS files are never cleaned up.

The deployment templates in `server/deploy/` configure a dedicated `deckflow`
user, CPU quota of 1.5 cores, one Torch thread, 6 GiB memory ceiling and separate
Cloudflare Tunnel. The API binds to loopback port 8790; HTTPS traffic arrives
through the tunnel. Existing VPS services and firewall rules are unchanged.
Each IP is limited to six new processing/import requests per hour, with a global
24-request hourly cap. This is a small tester service, not a public-scale SLA.
YouTube may require a server-side account session on data-centre IP addresses.
Import errors leave the current deck intact. Files and library entries remain in the browser, but audio
is sent to Oracle when preparing cloud stems.

The service owner can optionally set `DECKFLOW_YTDLP_BIN` to an absolute path to
an official yt-dlp executable and `DECKFLOW_YOUTUBE_COOKIES_FILE` to a protected
YouTube cookie file in `/etc/deckflow/youtube.env`. Omit both for anonymous imports
using the existing Python environment. Keep the session outside the repository,
owned by the service user with mode `600`, in a private directory. The service
reads it without modifying it and passes a disposable private copy to each
download. Requests cannot choose a cookie file or downloader, and credentials
are never included in API responses. Only use the account authorized by the
owner; sessions can expire and YouTube can still refuse a download.
Shared-session imports accept only videos explicitly marked public with no age
restriction. Private, unlisted, member-only, paid and unknown-visibility videos
are rejected before download and checked again before any audio is returned.

Initial Oracle benchmark: 45 seconds of demo audio took about 220 seconds in Fast
mode on the busy shared A1 CPU. Full songs can take many minutes. Countdown uses
this approximate five-times-duration baseline for Fast and ten-times for Best.
The one-thread setting reduces CPU work under contention without changing the
model, passes or overlap. See [Oracle performance measurements](docs/oracle-performance.md)
for the bounded benchmark and its limits; a full-song speedup is not guaranteed.

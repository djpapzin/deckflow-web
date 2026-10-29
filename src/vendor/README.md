# Signalsmith Stretch

Official Web Audio release from Signalsmith-Audio/signalsmith-stretch at commit
`88061fd4eda56a2353c5d65c74aa3f4ccf76f9da` (web/release/SignalsmithStretch.mjs).
Source: https://github.com/Signalsmith-Audio/signalsmith-stretch
MIT license retained in Signalsmith-LICENSE.txt. WASM is embedded in the module;
no CDN or external runtime service is used.

Local schedule fix (covered by the worklet tests): the upstream schedule handler
looked for `outputTime` instead of the documented `output`, and discarded the
current segment before a future change became active. It now uses `output` for
queue insertion and `currentTime` for pruning/reporting the active segment.

Local lifecycle extension: `dispose()` ends retired stem processors and drops their source buffers.

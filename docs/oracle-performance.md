# Oracle CPU efficiency benchmark

The shared four-core A1 VPS took roughly 18 minutes to prepare Fast stems for
the 150-second Caminandes 3 YouTube import. Its load average was around 16–19;
the low-priority worker averaged about 60% of a CPU core during that run.
Increasing its priority, CPU quota or worker count would compete with the other
services, so this experiment kept those settings unchanged.

## Thread comparison, 30 October 2026

The test used a six-second excerpt from 00:30 of the same imported track, the
existing htdemucs checkpoint, one shift, 25% overlap, stereo 44.1 kHz and fixed
random seeds. A single resident model ran configurations in order 2, 1, 2.
The benchmark joined the existing DeckFlow service cgroup, sharing its aggregate
1.5-core CPU ceiling and 6 GiB memory ceiling, at nice 19 (lower priority than
the service's nice 15). No other service configuration was changed.

| Threads | Wall seconds | CPU seconds |
| --- | ---: | ---: |
| 2, first run | 90.925 | 52.665 |
| 1 | 79.854 | 45.897 |
| 2, repeat | 93.312 | 52.157 |

Against the average two-thread baseline, one thread used about 12.4% less CPU
time and finished about 13.3% sooner. Its sample difference RMS was
8.56e-8 relative to the two-thread result; the repeated two-thread output matched
exactly. No audible playback was used. This is a numerical comparison on one
short clip, not a listening study or a full-song timing guarantee.

The deployment template therefore uses one Torch thread. Model, quality modes,
cache version, overlap, CPU quota, memory ceiling and service priority stay the
same. Cached stems remain compatible. Local Mac defaults are unaffected.

The result suggests a modest saving, not near-instant separation. A projection
of 18 minutes to roughly 15–16 minutes assumes the short-clip gain carries over
and similar server load; it has not been measured on another full-song run.
For a large, reliable improvement without contention on this VPS, use a separate
worker, preferably with GPU acceleration, and measure quality and cost first.

References: [PyTorch threading guidance](https://pytorch.org/blog/optimizing-libtorch/)
and [Demucs inference options](https://github.com/facebookresearch/demucs#separating-tracks).

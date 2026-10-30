# Cloud storage admission

The public stem service keeps its 4 GiB generated-cache cap, 12 GiB minimum
free disk headroom, two-job queue and six-hour expiry. It does not evict fresh
completed stems or alter other services to admit a request.

A false rejection was found while testing two full songs: about 1.7 GiB was
cached, but each active/new job was charged a full 1.25 GiB reservation,
regardless of duration. Written active output was also counted in cache usage
and again in its full reservation. Oracle itself had about 40 GiB free.

Cloud uploads now pass a small input-space check, then ffprobe measures their
duration using a temporary file. Admission reserves five stereo 44.1 kHz
float32 WAVs (four sources plus the compatibility instrumental), the uploaded
original and 64 MiB headroom. Fast and Best have the same disk output budget.
Only the unwritten part of each active job's reservation is charged alongside
actual cache usage. Probe files are removed on success and rejection. Invalid
and over-ten-minute audio is rejected before queueing. Cached jobs still bypass
new-work admission; local Mac processing is unchanged.

Regression tests cover the 1.7 GiB/two-song case with sparse files, exact cache
and disk boundaries, maximum-length output sizing, HTTP admission, invalid
metadata and probe cleanup. These tests run locally without new Oracle
inference jobs. The live service is unchanged until a reviewed deployment.

A genuinely full cache or low disk still rejects new work; this change removes
false reservations, not the limits themselves. A tester reporting an import
failure needs the displayed error before we can attribute it to this guard.

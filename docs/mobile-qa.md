# Mobile layout QA

Development-only change: two decks plus 120px mixer at phone landscape widths;
44px primary buttons, EQ hit areas and fader inputs; hot cues wrap rather than
shrink. Advanced cue/loop/grid controls initially collapse on small screens.
Portrait displays a rotate hint and stacks the decks below 600px. The hint does
not block use or lock device orientation. Vertical scrolling remains necessary.

Verified with the Codex in-app browser at 667x375 and 844x390 landscape, and
390x844 portrait. No page-wide horizontal overflow at those sizes. The rotate
hint appears in portrait and is absent in landscape. Browser pointer tests with
muted demo playback cover transport, hot cue, crossfader, EQ drag/reset and
forward/reverse platter scratch. Both channels were kept at zero.

Pointer-handler regressions cover touch cancellation, lost capture, unrelated
second pointers for EQ and Cue, and fine master-volume adjustment. Knobs now
use pointer capture instead of window listeners. Native range controls remain
native. These are simulated-size and pointer tests, not physical iOS/Android
hardware testing. Real-device multi-touch, scrolling during playback, browser
chrome/safe areas and audio activation remain release QA items. Production is
unchanged pending review and explicit promotion.

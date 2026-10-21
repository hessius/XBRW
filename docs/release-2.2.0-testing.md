# 2.2.0 testing checklist

Package acceptance, integration and release qualification are separate.
Record the exact app commit, native build, platform, machine and firmware for
each device result. Software transports do not qualify BLE or NFC hardware.

## Package A: brew correctness

The maintainer accepted #247 provisionally on the contributor's report of
machine verification. No maintainer hardware pass is recorded here.
Source #247 is `a997dac823b9c9ec7ede78914c8d86b9faec4e8e`; #246 is
`687c0f7e029abf8b11473e2edfe18492de097d7e`.
The standalone preflight differs from the full cumulative preview, so a preview
result does not qualify this integration or a different built commit.

- [ ] On an already-startable machine, retry without an unnecessary cancel.
- [ ] After a fault, send one cancel and wait for its reply or bounded timeout.
  Record commands and beeps.
- [ ] Repeated CANCEL taps share one cancellation. Cancel during preflight or
  upload sends no later recipe/commit and never restores manual START.
- [ ] A tank-low refusal allows another attempt after refilling without
  spending a dose on the refusal. A low flag alone during a running pour does
  not end a successful brew. Check tap-fed behavior where available.
- [ ] Explicit `0x0F` says "No beans detected"; generic `40517` during grinding
  says grinding stopped. Both offer TRY AGAIN; mini bar and history agree.
- [ ] Mid-brew no-water has no TRY AGAIN; preflight water refusal is retryable.
- [ ] Interrupted uploads cannot later START. Reconnection cannot resume old
  cancellation/upload continuations or automatically resend an upload.
- [ ] A connection replaced during preflight is not disconnected or retried by
  the superseded request. Genuine preflight link failures still get one retry.
- [ ] If either cancel write fails during startup, the app reports an
  unconfirmed stop, finishes the history record once and offers no START or
  retry. Check the machine rather than assuming the stop succeeded.
- [ ] Pause/resume remains intact. State `0x1F` also means armed/loaded and is
  not by itself evidence that a brew is paused or safe to cancel.

## Deferred wrong-recipe investigation

[#251](https://github.com/hessius/XBRW/issues/251) needs a real A-loaded,
reconnect, B-selected capture and fresh state/ack evidence. No conditional-cancel
mitigation is implemented or accepted. Confirm whether cancellation actually
clears the recipe buffer before choosing one.

## Package B: grouped native layout and accessibility

- [ ] Android: duplicate a recipe, open and close every affected sheet, and
  confirm the Fabric host crash is absent on a rebuilt client.
- [ ] Rename a borrowed multiline name untouched, edit it while details arrive,
  and check that saving follows the visible name.
- [ ] Check magenta ON and outlined OFF switches on dark and accent surfaces;
  confirm disabled states and screen-reader labels.
- [ ] Check missing/blank machine model display without claiming detection.
- [ ] Enable card photos: list circles stay bottom-right beside brew evidence;
  graph size, long-name width and uniform card tint do not change.
- [ ] At narrow widths and large text, compact photos yield to metadata,
  actions remain reachable, and profiles never overlap the name or figures.
- [ ] Four pictured recipes sharing one pod URL fill each eligible auto cover.
  Below four usable pictures, including failed loads, the glyph returns.
  Personal/tag shelves retain mixed member accents and photos.
- [ ] Fresh install defaults card photos OFF and shelf previews ON. Restore
  legacy OFF and explicit new preferences; confirm ABOUT is independent.
- [ ] Editor headers remain photo-free with either ABOUT preference.
- [ ] Measure cold/warm photo-heavy shelf opening under #253. Earlier mounting
  is not evidence of cache hits or a guaranteed native performance improvement.

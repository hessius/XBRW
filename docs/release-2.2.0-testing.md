# 2.2.0 testing checklist

Package acceptance is separate from merging and release qualification.
Record the exact app commit, native build, platform, machine and firmware with
each result. Leave a box open until its result is captured.

## Package A: brew correctness

On 2026-10-20 the maintainer accepted #247 provisionally based on the
contributor's report of machine verification. This is reported external evidence,
not a device pass performed by this session. The maintainer currently has no
machine available for further tests.

The reviewed #247 head is `a997dac823b9c9ec7ede78914c8d86b9faec4e8e`;
#246 is `2cb6303abcdae62bea09fa70773e8c7b1da76720`. These rebased standalone
heads differ from the original cumulative preview. In particular, #247's
vitals/handshake path is not the combined preview's path. Name the actual tested
commit rather than treating a preview pass as proof for another head.

- [ ] On an already-startable machine, retry without an unnecessary cancel.
- [ ] After a fault that needs clearing, send one cancel and wait for the reply
  or the bounded timeout before continuing. Record commands as well as beeps.
- [ ] Repeated CANCEL taps share one cancellation. Cancellation during preflight
  or upload sends no later recipe/commit and never restores manual START.
- [ ] After a tank-low refusal, filling the tank allows a new attempt without
  spending a dose on the refusal. A low flag during a running pour alone must
  not end a successful brew. Check tap-fed behavior where hardware is available.
- [ ] Explicit no-beans state `0x0F` says "No beans detected". Generic idle
  `40517` during grinding says grinding stopped and suggests checking the hopper.
  Both offer TRY AGAIN; the mini bar and history keep the distinction.
- [ ] A no-water failure after starting offers no TRY AGAIN. A preflight
  water refusal remains retryable.
- [ ] Cancelled or interrupted manual uploads cannot later START. Reconnection
  cannot resume an old cancellation/upload or automatically resend a started upload.
- [ ] Pause/resume remains intact: `0x1F` alone must not be treated as proof
  that a loaded recipe can safely be cancelled.

The wrong-recipe A/B report is a separate deferred investigation in
[#251](https://github.com/hessius/XBRW/issues/251), not a completed Package A fix.
No mitigation is implemented or accepted. Hardware must establish the
failure mechanism, state/ack freshness and whether cancellation clears the
loaded recipe before any conditional-cancel design is chosen.

## Later packages

Add focused checks when each package is reviewed. Keep the existing BLE, NFC,
both-platform and external-app release gates; this checklist does not waive them.

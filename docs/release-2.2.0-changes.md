# 2.2.0 change ledger

Accepted development changes for 2.2.0 are integrated into `develop` in packages.
Integration is not release qualification. The cumulative evaluation branch and
draft #252 also contain proposals that have not been accepted; they must not be
merged wholesale. Issue #249 records source heads, decisions and integration.
The shipped 2.1.0 ledger remains unchanged.

## Package A: brew correctness

Source heads:

- #247: `a997dac823b9c9ec7ede78914c8d86b9faec4e8e`.
- #246: `687c0f7e029abf8b11473e2edfe18492de097d7e`.

Cancellation is shared while in flight, waits for the machine's state reply
with a bounded timeout, and does not repeat when the machine is already
startable. Cancellation or connection replacement interrupts pending upload
and retry continuations. A failed upload is not automatically sent again after
relinking, because a lost connection does not prove the recipe was not received.
The tank's pushed low-water flag can refuse a new brew before spending a dose.

Explicit no-beans state `0x0F` remains confirmed `noBeans`. A generic idle
event `40517` during grinding is recorded as `grindingStopped` and suggests
checking the hopper without claiming that the machine reported an empty
hopper. The brew screen, mini bar and history retain this distinction.
A mid-brew no-water fault still offers no retry button; preflight tank-low
refusals remain retryable.

The maintainer accepted #247 provisionally on the contributor's report of
hardware verification. This is not a new maintainer device pass.
[Release testing](release-2.2.0-testing.md) remains open.

The wrong-recipe A/B report is an unconfirmed, separate investigation in
[#251](https://github.com/hessius/XBRW/issues/251). These changes do not establish
its cause or prove that cancellation clears a loaded recipe.

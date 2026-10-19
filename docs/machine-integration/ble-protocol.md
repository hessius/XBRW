# xBloom Studio (J15) BLE Protocol — Research Findings
**Session:** `0c6153e8-108c-429a-947f-7e31ae5eb72d`  
**Compiled:** 2026-08-30 by research subagent  
**Firmware under study:** V12.0D.500 (J15). All protocol claims may differ on other firmware.

---

## Source Inventory & Staleness

| Repo | Author | Licence | Created | Last activity seen | Nature |
|------|--------|---------|---------|-------------------|--------|
| `brAzzi64/xbloom-ble` | brAzzi64 | MIT | 2026-04-14 | ~2026-04 (no CHANGELOG) | Canonical HCI-capture + APK decompile. Single author. Python scripts only. |
| `Janczykkkko/xbloom-ble` | Janczykkkko (Claude Code) | MIT | 2026-06-30 | 2026-07-11 (v2.3.0) | Full Python package on PyPI. Not a fork — independent re-implementation building on brAzzi64. Actively maintained. |
| `Alshekhi/xbloom-studio` | Alshekhi | MIT | ~2026-05 | ~2026-08 (most recent) | Home Assistant integration. Most active repo. Imports cloud API. Has a live-session (held BLE) model. |
| `saya6k/hacs-xbloom` | saya6k | MIT | 2026-06-15 | 2026-07-02 (v1.3.2) | HA integration. Contains the most detailed tea brew sequence and ratio-byte ceil fix. |
| `HomoLand/xbloom-studio-brew` | HomoLand | MIT | ~2026-06 | ~2026-07 | AI-skill BLE runtime. TypeScript/Python hybrid. Most complete command table; adds pour-radius/vibration-amplitude tuning, tea mode, FreeSolo brewer/grinder standalone commands. |

**Protocol is a moving target.** Sources disagree on several command semantics (see §Contradictions). No source claims to have tested more than one unit or more than one firmware revision (V12.0D.500).

---

## A. BLE Capability Inventory

### GATT Structure

**Custom Service UUID:** `0000E0FF-3C17-D293-8E48-14FE2E4DA212` `spec`

| Characteristic | Properties | Role |
|----------------|-----------|------|
| `FFE1` | Write w/o Response, Write | Command channel (app → device) |
| `FFE2` | Notify | Notifications (device → app) |
| `FFE3` | Read, Write w/o Response, Write, Notify | Aux / multi-purpose |

**Write method:** Must use Write Without Response (ATT opcode 0x52 / `response=False` in bleak). Write With Response is rejected with CBATTErrorDomain Code=14. `spec`

**Discovery:** Machine advertises name starting with `XBLOOM` (e.g. `XBLOOM ABC123`) and/or the service UUID above. `spec`

---

### Packet Format

#### Type 1 — `buildCommandString` (func code `0x01`) `spec`
```
58 01 01  [cmd_lo cmd_hi]  [len_b0 len_b1 len_b2 len_b3]  01  [N×4-byte LE ints]  [crc_lo crc_hi]
```

#### Type 2 — `buildCommandString2` (func code `0x02`) `spec`
```
58 01 02  [cmd_lo cmd_hi]  [len_b0 len_b1 len_b2 len_b3]  01  [hex_data bytes]  [crc_lo crc_hi]
```

**Length field:** total frame bytes including header and CRC. `spec`  
**CRC16:** CRC-16/KERMIT (polynomial 0x1021, init 0, reflected input+output, no final XOR). `spec`

> ⚠️ **CONTRADICTION C1 — CRC polynomial description:** brAzzi64 PROTOCOL.md describes the polynomial as `0x8408 (reversed CCITT 0x1021)`, which is mathematically identical to CRC-16/KERMIT. Janczykkkko and HomoLand both call it CRC-16/KERMIT with poly `0x1021`. These are the same algorithm expressed differently; the computed bytes are identical. `corroborated`

> ⚠️ **CONTRADICTION C2 — Frame byte layout:** brAzzi64 describes the length field as 4-byte LE at offset 5, the sub-type constant as `0x01` at offset 9. Janczykkkko's `protocol.py` and HomoLand's `protocol.py` both describe bytes [3..4] as a single LE u16 command, [5..6] as LE u16 length, bytes [7..8] as `0x00 0x00`, then `0x01` payload marker. The raw packet bytes in all sources match, but the semantic interpretation differs: brAzzi64 sees a 2-byte command + 4-byte length, Janczykkkko/HomoLand see a 2-byte command + **2-byte** length + 2 zero bytes. The total length byte count and values are consistent; this is a documentation split, not a wire difference. `inferred`

#### Notification Format (Device → App, FFE2) `spec`
```
58 02 07  [type_byte]  [sub_byte]  [len_u32le]  0xC1  [payload]  [crc_lo crc_hi]
```
- `0xC1` marker precedes the payload.
- STATUS frames have `type_byte = 0x57`; the byte immediately after `0xC1` is the machine state.
- ACK frames have `type_byte` equal to the command byte that was acknowledged.
- Scale weight streams have `type_byte = 0x4B` (water, in **milligrams** as float32 LE → divide by 1000 for grams) or `type_byte = 0x15` (coffee/cup weight, already in grams as float32 LE). `corroborated`

---

### Complete Command Code Table

`spec` = documented in brAzzi64 PROTOCOL.md  
`corroborated` = two or more independent sources agree  
`single-source` = one source only  
`inferred` = deduced from code/context

#### Commands Sent App → Device

| Code | Hex | Name | Type | Payload | Notes | Confidence |
|------|-----|------|------|---------|-------|------------|
| 8100 | 0x1FA4 | **Session Handshake** | T1 | `[185, 1]` (ints) | Must be sent within ~200ms of connect. Machine ignores all subsequent commands without it. | `spec` |
| 8022 | 0x1F56 | **Back to Home** | T1 | (none) | App sends this on initial connect and after cancel. XBRW++ sends it after a user CANCEL, and before a retry on a link that has had no state report yet, to get one (see "One cancel per brew start"). Its echo can carry a longer payload (`56 1F 1C ...`, owner log 2026-10-19) whose layout is not decoded. | `spec` |
| 8102 | 0x1FA6 | **Bypass + Dose** | T1 | `[bypass_vol_floatbits, bypass_temp×10_floatbits, dose_int]` | Sends dose even when bypass disabled (bypass args = 0). Machine needs dose to grind correctly. Skipping causes drift. | `spec` |
| 8104 | 0x1FA8 | **Set Cup** | T1 | `[max_floatbits, min_floatbits]` | Cup weight range. Coffee uses (110.0, 90.0) per HomoLand; brAzzi64 observed (200.0, 80.0) from cloud API; saya6k uses (80.0–90.0, 40.0). See CONTRADICTION C3. | `corroborated` |
| 8001 | 0x1F41 | **Recipe Send (with grind)** | T1h | recipe blob | Pours frame opcode when grinder IS used. | `corroborated` |
| 8004 | 0x1F44 | **Recipe Send (no grind)** | T1h | recipe blob | Pours frame opcode when grinder OFF. Distinct from 8001. | `corroborated` |
| 8002 | 0x1F42 | **Execute / Commit** | T1 | `[1]` | Arms → awaiting-confirm. Byte-exact: `580101421F0C000000017FCF`. | `spec` |
| 40518 | 0x9E46 | **Coffee Pause** | T1 | `[1]` | Seq=0x9E. Pauses a running recipe; state goes to `0x1F`, and `40515` reports volume so far. Inert if already paused. C4 settled. | `hardware 2026-10-08, V12.0D.500` |
| 40519 | 0x9E47 | **Cancel** | T1 | `[1]` | Seq=0x9E. Abort committed/running brew. **Beeps every time.** Answered by its own event and a startable state (`0x41`) about 0.8 s later on V12.0D.500. Send one and wait for that state; see "One cancel per brew start". | `corroborated`; beep and reply `hardware 2026-10-19, V12.0D.500` |
| 40524 | 0x9E4C | **Coffee Resume** | T1 | `[1]` | Resumes a `40518` pause; `40516`, then back to `0x23`. The brew continues, it does not restart. Inert if not paused. | `hardware 2026-10-08, V12.0D.500` |
| 8019 | 0x1F53 | **FreeSolo pour** (named Brewer Pause) | T1 | (none) | **Destructive.** Abandons any running recipe and starts a standalone water pour: `0x03`, then `9006` and `0x41` about 13 s later. It is not a pause. | `hardware 2026-10-08, V12.0D.500` |
| 8021 | 0x1F55 | **FreeSolo stop** (named Brewer Resume) | T1 | (none) | Ends a `8019` pour and reports `0x23`, but no recipe survives to resume. | `hardware 2026-10-08, V12.0D.500` |
| 8013 | 0x1F4D | **Brewer Quit** | T1 | (none) | Quit brewer. | `spec` |
| 8017 | 0x1F51 | **Recipe Start Quit** | T1 | (none) | Exit pre-start recipe screen. | `spec` |
| 8007 | 0x1F47 | **Brewer Enter** | T1 | `[pattern_byte, temp×10_floatbits]` | Navigate to FreeSolo brewer screen. | `single-source` (HomoLand) |
| 4506 | 0x119A | **Brewer Start** | T1 | `[flow×10_floatbits, vol×10_floatbits, temp×10_floatbits, water_feed, pattern]` | FreeSolo water dispense. | `single-source` (HomoLand) |
| 4507 | 0x119B | **Brewer Stop** | T1 | (none) | Stop FreeSolo dispense. | `spec` |
| 8016 | 0x1F50 | **Brewer Set Pattern** | T1 | `[pattern_byte]` | Change pattern mid-brew (live slider). | `single-source` (Alshekhi) |
| 4510 | 0x119E | **Brewer Set Temperature** | T1 | `[temp_c × 10]` | Change temp mid-pour (plain int × 10, not float bits). | `single-source` (Alshekhi) |
| 3500 | 0x0DAC | **Grinder Start** | T1 | `[1000, grind_size, speed]` | The leading 1000 is a constant from GrinderActivity. | `spec` |
| 3505 | 0x0DB1 | **Grinder Stop** | T1 | (none) | Stop grinding. | `spec` |
| 8006 | 0x1F46 | **Grinder Enter** | T1 | `[grind_size, speed]` | Navigate to grinder screen. | `spec` |
| 8012 | 0x1F4C | **Grinder Quit** | T1 | (none) | Exit grinder mode. | `single-source` (HomoLand) |
| 8018 | 0x1F52 | **Grinder Pause** | T1 | (none) | Pause grinder. | `spec` |
| 8020 | 0x1F54 | **Grinder Resume** | T1 | (none) | Resume grinder after pause. | `spec` |
| 8003 | 0x1F43 | **Scale Enter** | T1 | (none) | Navigate to scale screen (HomeActivity.onClickOperator3). | `single-source` (saya6k) |
| 8014 | 0x1F4E | **Scale Exit** | T1 | (none) | Leave scale screen (ScaleActivity.onBackPressed). | `spec` |
| 8500 | 0x2134 | **Scale Tare** | T1 | (none) | Zero the scale instantly. Confirmed on hardware. | `spec` |
| 8005 | 0x1F45 | **Weight Unit** | T1 | `[0=g, 1=oz, 2=ml]` | See CONTRADICTION C5 for unit ordering. | `spec` |
| 8010 | 0x1F4A | **Temperature Unit** | T1 | `[0=°C, 1=°F]` | See CONTRADICTION C6 for unit ordering. | `spec` |
| 4508 | 0x119C | **Water Source** | T1 | `[0=tank, 1=tap]` | | `spec` |
| 8103 | 0x1FA7 | **LED/Display Brightness** | T1 | `[1=low, 8=medium, 15=high]` | | `single-source` (HomoLand) |
| 11510 | 0x2CF6 | **Easy Recipe Send** | T2 | `[slot_index, flags, recipe_blob]` | Slot=0/1/2 (A/B/C). All 3 must be written in one batch. | `corroborated` |
| 11511 | 0x2CF7 | **Mode Switch** | T2 | `"00000000"=PRO` / `"91327856"=EASY` | Byte-exact confirmed on hardware. | `spec` |
| 11512 | 0x2CF8 | **Recipe Order** | T2 | hex payload | Confirmed real in APK decompile (BleCodeFactory.easyModeRecipesOrder). | `corroborated` |
| 40525 | 0x9E4D | **Send Recipe Count** | T1 | `[count]` | Sends count of recipes being synced. | `spec` |
| 11506 | 0x2CF2 | **Read Pour Radius** | T2 | (none) | Read current mechanical pour radius. | `single-source` (HomoLand) |
| 11507 | 0x2CF3 | **Write Pour Radius** | T2 | `[value]` | Range 400–1000, step 80. Mechanical calibration. | `single-source` (HomoLand) |
| 11508 | 0x2CF4 | **Read Vibration Amplitude** | T2 | (none) | Read current vibration amplitude setting. | `single-source` (HomoLand) |
| 11509 | 0x2CF5 | **Write Vibration Amplitude** | T2 | `[value]` | Range 1000–1500, step 100. Mechanical calibration. | `single-source` (HomoLand) |
| 4512 | 0x11A0 | **Tea Recipe Make (Execute)** | T1 | (none) | Execute previously uploaded tea recipe. | `spec` |
| 4513 | 0x11A1 | **Tea Recipe Code (Upload)** | T1 | tea blob | Upload tea recipe blob (same chunked format, different pause encoding). | `spec` |
| 8111 | 0x1FAF | **Easy Mode Begin** | T1 | (none) | Initiate Auto Mode recipe display. | `spec` |
| 40526 | 0x9E4E | **Back to Normal / Slot Recovery** | T1 | (none) | Dismisses incomplete slot saving. APK constant named CurrentGrinder; no slot rollback demonstrated. | `hardware 2026-10-11` |

---

#### Notifications (Device → App, FFE2)

| Code | Hex | Name | Data | Notes | Confidence |
|------|-----|------|------|-------|------------|
| 8100 | 0x1FA4 | Handshake ACK | — | Confirms handshake received | `spec` |
| 40521 | 0x9E49 | Machine Info | 61-byte blob | Serial, model, firmware, water level, mode, grinder size, LED, voltage, temp unit, weight unit, water source. See field map below. | `spec` |
| 0x57 frame | — | Status Frame | state byte after 0xC1 | See state table below | `corroborated` |
| 0x4B frame | — | Water Weight | float32 LE (milligrams) | Brew-record water stream, ~10×/s. Divide by 1000 for grams. | `corroborated` |
| 0x15 frame | — | Coffee/Cup Weight | float32 LE (grams) | Brew-record cup weight stream, ~10×/s. | `corroborated` |
| 20501 | 0x5015 | Scale Weight (alt) | float32 LE | brAzzi64 notation for the weight stream. See CONTRADICTION C7. | `spec` |
| 10507 | 0x290B | Scale Weight (alt-2) | float32 LE | Second alternative notation observed in some captures. | `single-source` (brAzzi64) |
| 40523 | 0x9E4B | Water Volume | float32 LE | Named "tank volume" by the sources, but on this firmware it is the **dispensed** water and it climbs through a brew. `parseNotification` matches it on its low byte `0x4B` alone, so it decodes as a water weight and never reaches the event map. Its neighbour 40522 is the tank flag. | `corroborated` |
| 8023 | 0x1F57 | Machine Activity | LE uint32 | Activity states: 1=Pro idle, 65=Easy idle, 34=brewing, 36=brew done, 16=grinding complete. | `corroborated` |
| 8011 | 0x1F4B | Machine Awake | — | Machine is not sleeping | `spec` |
| 8009 | 0x1F49 | Machine Sleeping | — | Machine entered sleep | `spec` |
| 11511 | 0x2CF7 | Mode Switch ACK | mode code | Status C2 = ACK | `spec` |
| 11510 | 0x2CF6 | Easy Recipe Send ACK | — | One per slot write | `spec` |
| 11512 | 0x2CF8 | Recipe Order ACK | — | | `spec` |
| 40502 | 0x9E36 | Coffee Starting / Grinder Start | — | Machine-side grinding begin | `spec` |
| 40506 | 0x9E3A | Brewer Start | — | Water heater spinning up; fires ~3s after grind start (before pours) | `single-source` (Alshekhi) |
| 40507 | 0x9E3B | Grinder Stop | — | Grinder finished | `spec` |
| 40510 | 0x9E3E | Bloom/Pour Start | pour_index, **zero-based** (see below) | One per pour | `spec` |
| 40511 | 0x9E3F | Brewer Stop | — | Brew complete | `spec` |
| 40512 | 0x9E40 | Enjoy! | — | Final "coffee ready" notification | `spec` |
| 40513 | 0x9E41 | Enjoy (2) | — | Second enjoy notification | `spec` |
| 40515 | 0x9E43 | Pour volume at pause | — | Emitted right after a `40518` pause, carrying a rising float (138, then 184 within one brew). Volume so far is the obvious reading, unconfirmed against the scale. | `hardware 2026-10-08, V12.0D.500` |
| 40516 | 0x9E44 | Pour resumed | — | Emitted right after a `40524` resume, before the state returns to `0x23`. | `hardware 2026-10-08, V12.0D.500` |
| 40517 | 0x9E45 | Error: Idling | — | | `spec` |
| 40520 | 0x9E48 | RD_Bypass | — | The bypass firing, after the drawdown | **`verified`** (capture 2026-09-10) |
| 40522 | 0x9E4A | Tank flag (named Error: No Water) | uint8 | **Not a fault.** Pushed by the machine when the tank changes: `0` = empty or below its low mark, `1` = filled. XBRW++ keeps the latest value per link and refuses a brew before sending anything while it is `0` on a tank-fed machine. See "Event 40522 is the tank flag". | `hardware 2026-09-09 and 2026-10-19, V12.0D.500` |
| 8203 | 0x200B | Error: Gear Position | — | Grinder gear error | `spec` |

### One cancel per brew start `hardware 2026-10-19, V12.0D.500`

> Owner logs, Galaxy Z Fold, Studio V12.0D.500, preview build `4c3cf3a`.
> Every 40519 makes the machine beep, and the app was sending two or three.
>
> TRY AGAIN after a failed brew (no water):
>
> ```
> 09:38:26.426  ->  58 01 01 47 9E 10 00 00 00 01 01 00 00 00 F4 8E   (40519)
> 09:38:26.824  <-  event 40519
> 09:38:27.267  <-  state 0x41 complete (Easy idle)      machine already clear
> 09:38:27.475  ->  58 01 01 47 9E 10 00 00 00 01 01 00 00 00 F4 8E   (40519 again)
> 09:38:27.850  <-  event 40519
> 09:38:28.239  <-  event 40522 (0)
> 09:38:28.488  ->  8102 ... 8104 ... 8001 recipe ... state 0x1f ... 8002 ... 40522 (0) ... state 0x0c no_water
> ```
>
> Before an earlier brew: `09:08:42.362 -> 40519`, `09:08:43.187 <- state 0x41`,
> `09:08:43.922 -> 40519`, `09:08:45.933 -> 8022`, then `8102`.
>
> BREW right after a reconnect, with no fault on the machine:
> `09:40:04.456 -> 8100`, `09:40:04.870 <- info`, `09:40:10.026 -> 40519`,
> `09:40:10.842 <- state 0x41`, `09:40:12.035 -> 8022`, `09:40:12.105 -> 8102`.
> No state frame arrived between the connect and BREW, so the app did not know
> the machine was idle and cancelled anyway (the phase still said the last
> brew had failed).
>
> CANCEL while armed: `09:40:21.866 -> 40519`, `22.254 <- 40519`,
> `22.693 <- state 0x41`, `23.033 -> 40519`, `23.419 <-`, `23.688 -> 40519`,
> `24.064 <-`, `25.695 -> 8022`. Three beeps.
>
> **Cause.** The cancel was a fixed pair, 40519, a 2 s gap, 8022, sent by two
> callers: the brew pre-flight (whenever the last brew had failed or lost
> contact) and CANCEL. Neither looked at the machine's state, neither waited
> for its answer, and a second call inside the gap sent a second 40519. The
> newer paced sequence then dropped the older one's 8022, which is why the
> logs show 40519 twice and 8022 once. In every log the machine had already
> reported `0x41` about 0.8 s after the first 40519.
>
> **Rule since then (`Machine.clearForBrew`, `cancelOnce`, `cancelBrew`).**
> At most one 40519 is in flight; anyone else who wants the machine cleared
> waits for it. After a 40519 the app waits for a startable state report
> (idle `0x01`, ready `0x24`, complete `0x41`), up to `STATE_REPLY_MS`, and
> never sends another. Before a brew, nothing is sent after a clean ending.
> After a failed or lost brew, a last reported state that is startable needs
> nothing, and anything else gets one cancel. A link with no state report yet
> sends 8022 (the official app's connect-time back-to-home) and decides on the
> state that follows it, cancelling once if none comes. A CANCEL sends one
> 40519, waits for the startable report, then sends 8022 as the official app
> does after a cancel; repeated taps join it. A CANCEL pressed while a brew is
> still in its pre-flight stops that brew before the recipe goes out.
>
> **8022 before a recipe.** This document only has the official app sending
> 8022 on connect and after a cancel. Nothing documents it as needed before a
> recipe, so the brew path no longer sends it after its cancel. It is sent
> only as the state question on a link that has no state yet.
>
> **Unverified.** Whether 8022 always produces a 0x57 state frame when the
> state has not changed is not established. The official app's own connect,
> overheard on a shared Android link on 2026-10-19 (`04:15:13`), shows
> `state 0x1d`, `event 8022`, `state 0x01`. The
> owner reports the 8022 echo itself carries `... 00 10 00 41 ...` in a longer
> `56 1F 1C` frame, but the full bytes were not captured, so the echo is not
> parsed. With no state frame the app falls back to one cancel, which is one
> beep, as before. Which second caller sent the duplicate 40519 in the TRY
> AGAIN log is not proven from the log alone: only the pre-flight and CANCEL
> send 40519, and the fix holds whichever it was. None of this has been run
> on the machine yet.

### Event 40522 is the tank flag `hardware 2026-10-19, V12.0D.500`

> Same session. Before the no-water stop: `09:38:28.239 <- 40522 (0)` and
> `09:38:34.285 <- 40522 (0)`, each right before `state 0x0c no_water`. After
> the owner refilled the tank: `09:38:45.669 <- 40522 (1)`, then
> `09:38:46.114 <- state 0x1f armed`. With the 2026-09-09 capture (a
> `40522 (0)` eleven seconds into a brew that went on to finish, the tank
> crossing its low mark) this reads as a tank flag pushed when it changes:
> `0` empty or low, `1` filled. It is not a stop on its own, so it still ends
> no running brew.
>
> The vitals (`waterEnough`, payload[33]) did not catch the 09:38 case: the
> recipe went out and the machine stopped after the start. So the app keeps
> the latest 40522 value per link (forgotten on disconnect) and, on a
> tank-fed machine, refuses a brew while it is `0`, before anything is sent,
> as the amber `notEnoughWater` block with TRY AGAIN. A `40522 (1)` lets the
> next brew through.
>
> **Not done.** A `40522 (1)` arriving while a mid-brew no-water failure is on
> screen could offer TRY AGAIN there. That failure deliberately offers no
> button today (`NO_RETRY`), and changing it is a UI decision left open.

### Event 40520 is the bypass, and there is no pour start for it `verified`

Verified by a full frame log of 2026-09-10: a three-stage recipe with a 5 ml
bypass emitted 40510(0), 40510(1), 40510(2) — and then 40520, 61 s after the
last pour began and 8 s before `BREWER_STOP`. **There is no fourth 40510.**

That matters more than naming the event. Anything that buckets scale readings
by the last announced `pour_index` will fold the bypass's water onto the last
stage, and the long drawdown wait before it will look like a stalled pour. The
app therefore enters a `bypass` phase on 40520 and gives it a lane of its own;
see `docs/superpowers/specs/2026-09-10-brew-bypass-display-design.md`.

The same ordering decides where the drawdown is measured from. `settling` opens
on BREWER_STOP, which this capture puts 69 s after the last pour's water: a
drawdown timed from there would report 8 s of one that had already run for over
a minute. `drawdownFrom` in `library/brew/BrewRecord.ts` therefore reads the
last rise in *brew* water, ignoring the bypass lane, because the bypass goes
straight to the cup partway through the drawdown and its few millilitres would
otherwise restart the measurement.

### `pour_index` is zero-based

Worth stating on its own, because getting it wrong is silently survivable: the
first stage comes out right and every later stage is off by one.

From brAzzi64's HCI snoop of the official Android app (`adb bugreport` with
Bluetooth HCI snoop logging, Pixel 3, 2026-03-28, firmware V12.0D.500). The
recipe was 16 g at 1:16, 256 ml, **six pours**, spiral, grinder off:

```
Δt (s)   Cmd     Name              Payload decode
16.7     40502   Coffee Starting
17.7     40510   Pour Start        pour_index=0   (bloom)
60.9     40510   Pour Start        pour_index=1
83.9     40510   Pour Start        pour_index=2
106.9    40510   Pour Start        pour_index=3
129.9    40510   Pour Start        pour_index=4
155.0    40510   Pour Start        pour_index=5
178.0    40511   Brewer Stop
180.1    40512   Enjoy!
```

Six pours, indices 0 through 5. A stage number for display is therefore
`pour_index + 1`, which is what `Machine.onEvent` does.

This is quoted here rather than cited to a URL because a code comment that
points at a document nobody reviewing the diff can open is not evidence. The
capture also shows no 40515 or 40516 in that session, which is where this
document's `single-source` marking on those two comes from.

| 8204 | 0x200C | Error: Dose/Water | — | Dose or water mismatch | `spec` |
| 8107 | 0x1FAB | Brewer Mode | — | | `spec` |
| 8108 | 0x1FAC | Brewer Temp | — | | `spec` |
| 8105 | 0x1FA9 | Grinder Size | — | | `spec` |
| 8106 | 0x1FAA | Grinder Speed | — | | `spec` |
| 9000 | 0x2328 | In Grinder | — | User navigated to grinder | `spec` |
| 9001 | 0x2329 | In Brewer | — | | `spec` |
| 9002 | 0x232A | In Scale | — | Object placed on scale | `spec` |
| 9003 | 0x232B | Grinder Begin | — | | `spec` |
| 9004 | 0x232C | Grinder Out | — | | `spec` |
| 9005 | 0x232D | Brewer Begin | — | | `spec` |
| 9006 | 0x232E | FreeSolo pour finished | — | Ends the `0x03` pour started by `8019`; the state goes to `0x41` next. | `hardware 2026-10-08, V12.0D.500` |
| 9008 | 0x2330 | Scale Out | — | Object removed from scale | `spec` |
| 9009 | 0x2331 | Grinder Paused | — | | `spec` |
| 9010 | 0x2332 | Brewer Paused | — | | `spec` |
| 40505 | 0x9E39 | Gear Report | — | Gear position report during grind | `spec` |

---

#### Machine State Byte (inside 0x57 notification frame)

| Byte | State Name | Meaning |
|------|-----------|---------|
| 0x01 | idle | Pro-mode home / ready |
| 0x02 | scale/grinder busy? | Observed after 8006 (grinder enter). Undocumented. `observed 2026-09-01, V12.0D.500` |
| 0x03 | dispensing | Standalone FreeSolo pour, entered by `8019`. Ends on `9006` into `0x41`. Also seen after `9001`. `observed 2026-10-08, V12.0D.500` |
| 0x04, 0x05 | scale sub-states | Observed cycling around scale enter/tare/exit. Undocumented. `observed 2026-09-01, V12.0D.500` |
| 0x0C | no_water | No water (checked after commit) |
| 0x0F | no_beans | Waiting for beans |
| 0x10 | brewing | Live pour in progress |
| 0x1D | loading | Recipe being received |
| 0x1F | armed | Recipe loaded, awaiting approval **and also** a recipe paused by `40518`. The two are the same code; only the sender knows which it is. `observed 2026-10-08, V12.0D.500` |
| 0x1E | awaiting_confirm | Waiting for human confirm on device |
| 0x20 | pre_brew | Between `armed` and the first `40502`; purpose unestablished. `observed 2026-10-08, V12.0D.500` |
| 0x22 | starting | Post-confirm: grinding/spinning up |
| 0x23 | brewing (sub) | Mid-pour sub-state | 
| 0x24 | ready | Brew DONE — coffee ready beep (cup still on scale; machine waits for cup removal before → idle) |
| 0x3B | brewing | Brew in progress (alt firmware) |
| 0x41 | complete (Easy idle) | Brew complete OR Auto/Easy-mode home |
| 0x43 | saving_slots | Easy-Mode slot batch being stored |
| 0x25 | slots_saved | Slots stored OK (then → idle) |

`corroborated` for core states (0x01, 0x1F, 0x1E, 0x22, 0x24); `single-source` (Janczykkkko) for 0x23, 0x24 distinction.

> **Observed on hardware 2026-10-08 (V12.0D.500). Pause and resume are `40518`
> and `40524`, and `8019` is not a pause at all.**
>
> Sent into a running recipe, **`40518` pauses it**: acknowledged by its own
> event, followed by `40515` carrying a rising number (138, then 184 on the
> second pause of the same brew), and the state settles on **`0x1F armed`**.
> **`40524` resumes**: acknowledged, followed by `40516`, back to `0x23`.
>
> **The brew continues rather than restarting.** Paused in stage 0 and resumed,
> the machine went on to emit `40510 (1)`, `(2)`, `(3)` and finished through
> `40511`, `40512`, `0x24 ready`, `40513`. No stage index was repeated. The
> cycle was run twice in the one brew and the coffee came out.
>
> Both commands are **inert when they do not apply**: `40524` sent to a running
> brew was acknowledged and changed nothing, and `40518` sent to an
> already-paused brew likewise. A pause UI does not have to track which one is
> safe to send.
>
> **`8019` aborts the recipe into a standalone FreeSolo pour.** It is
> acknowledged, the machine drops to `0x03` and *pours water*, and about
> thirteen seconds later `9006` arrives and it lands in `0x41`. The recipe is
> gone. `8021` returns it to `0x23` but there is no longer a recipe behind that
> state. The earlier reading of this pair as a working pause came from watching
> the state numbers alone, which is exactly the failure the display was warning
> about: the machine's screen said water, the log said `0x23`.
>
> The frames are `58 01 01 46 9E 10 00 00 00 01 01 00 00 00 65 DB` (40518) and
> `58 01 01 4C 9E 10 00 00 00 01 01 00 00 00 ED CC` (40524), pinned in
> `library/machine/__tests__/spikeFrames.test.ts`.

**App-side pause ownership and accounting (not wire fields):**
`Machine.pauseBrew("overflow")` tags only a requested pause confirmed by `40515`;
manual confirmations retain the old phase shape without a `pauseKind` key.
The promise resolves on the native send, not on confirmation. Pending ownership
expires with the acknowledgement window and is cleared on rejection, resume,
terminal phases and link reset; an older request cannot clear a newer one.
`BrewRecorder` snapshots confirmed manual/overflow spans in epoch time, then
publishes owned `pauseIntervals` copies relative to first water (or the pour-open/
brew-start fallback). Pre-water spans clamp to zero after rebasing but still count
toward total `pausedSeconds`. Stalls and held-time overrun subtract only interval
overlap on the sample clock, once; radio gaps alone never imply a pause.

> **Observed on hardware 2026-09-01 (V12.0D.500):** commit (`8002`) **auto-proceeds**. The machine went from commit straight to grinding, in both EASY and PRO, without ever passing through `0x1E`. `0x1E` is corroborated by three sources, so it is kept as a fallback path — but on this unit it is not the normal route.

> **Observed on hardware 2026-09-01:** a single BLE notification may carry **more than one frame**, back to back. Captured verbatim: `58 02 07 FE 2C 10 00 00 00 C1 91 32 78 56 67 74` immediately followed by `58 02 07 4B 9E 10 00 00 00 C1 00 00 00 00 FD 32` — event 11518 and a water-volume reading in one packet. The length field at offset 5 is the **total frame length**, so a reader must walk the packet by it rather than parsing the first frame and discarding the tail.

> **Observed on hardware 2026-09-01:** every command is acknowledged by an **event notification carrying the same code** — `→ 8003` is answered by `← event 8003`, likewise 8500, 8014, 8006, 8012. XBRW++ does not exploit this yet; it would turn a blind acknowledgement timeout into a precise "frame N never arrived".

> **Contradiction, unresolved:** the EASY-mode token appears in notification 11518 as the raw bytes `91 32 78 56`, not as the ASCII `"91327856"` (`39 31 33 32 37 38 35 36`) that command 11511's payload is documented as taking, "byte-exact, confirmed on hardware". These are a notification and a command respectively, so they need not agree — but nobody has tested the raw-byte form of 11511.

> ⚠️ The machine grinds SILENTLY after commit — it emits NO 0x57 status frames for ~20s during grinding before reporting 0x10. A client must not treat this gap as a stall. `single-source` (Janczykkkko, observed on hardware)

---

#### Machine Info Blob (cmd 40521, 61 bytes payload) `spec`

| Offset | Field | Decode |
|--------|-------|--------|
| 0–12 | serialNumber | ASCII |
| 13–18 | theModel | ASCII (0xFF = blank) |
| 19–28 | theVersion | ASCII firmware string |
| 29–32 | areaAp | LE float |
| 33 | waterEnough | uint8 (0=low, 1=ok); reservoir sensor only, ignore for brew preflight when `waterFeed=1` |
| 34 | systemStatus | uint8. Unverified: nobody has checked it against the 0x57 state, and XBRW++ does not read it. Owner logs of 2026-10-19 show a byte near the end of the payload changing between sessions (`01 00 1F 5B 09` against `01 00 1D 5A 09`), which looks state-like (`0x1F` armed, `0x1D` loading) but has not been tied to a named field. Not used until a capture pins it. |
| 35 | userCount | uint8 |
| 36 | waterFeed | uint8 (0=tank, 1=tap) |
| 37 | grinder (raw) | uint8 − 30, min 1 |
| 38 | ledType | uint8 |
| 39 | voltage | uint8 |
| 40 | tempUnit | uint8 (0=°C, 1=°F) |
| 41 | weightUnit | uint8 (0=g, 1=oz) |
| 51–54 | modeType | hex match vs `91327856` → EASY else PRO |
| 55–58 | pouringRadius | LE uint32 |
| 59–62 | vibrationInit | LE uint32 |

> **Observed in the field 2026-10-19 (owner log, not a bench capture):** a Studio on
> firmware V12.0D.210 (serial `J15A01D48G023`) sends a whole, CRC-valid 40521 frame of
> 0x43 bytes, a **55-byte payload** ending with modeType at 51–54. pouringRadius and
> vibrationInit are absent. V12.0D.500 sends 63. XBRW++ accepts 55 bytes or more;
> it used to require 59, which left this machine with no vitals and no serial.

---

### Recipe Blob Format

Used by commands 8001 (grind) / 8004 (no-grind) and by Easy Mode slot saves.

```
[length_byte] [pour_segments...] [grinder_byte] [ratio_byte]
```

**Pour segment (normal, ≤ 127ml):** `[volume, temp_c, pattern, vibration, neg_post_wait, 0x00, rpm, flow×10]` (8 bytes)  
**Pour segment lead chunk (> 127ml):** `[127, temp_c, pattern, vibration]` (4 bytes, repeating until remainder fits in 8-byte trailing segment)  
**RPM byte:** Only non-zero in the FIRST pour's 8-byte segment; subsequent pours get 0. `corroborated`  
**Grinder byte:** 0 = no-grind → encoded as `0xFE` on wire (NOT `0x00`; `0x00` means grind at finest setting). `corroborated`  
**Ratio byte:** `round(total_water_ml / dose_g * 10)`. Range 1–255. See CONTRADICTION C8 for critical details.

**Pattern codes:** `0=center, 1=ring/circular, 2=spiral` `corroborated`  
**Vibration/agitation codes:** `0=none, 1=before, 2=after, 3=both` — this is an independent field from pattern. `corroborated` (HomoLand, Janczykkkko)

**Cup type** (xPod/xDripper/Omni/Other/Tea) is NOT encoded in the recipe blob. It affects the dose range UI only. `spec`

---

## B. Contradictions

### C1 — CRC Polynomial Description `inferred`
brAzzi64 describes CRC as poly `0x8408` (reversed CCITT). Others call it CRC-16/KERMIT with poly `0x1021`. These are the same algorithm; the computed outputs are identical. No real disagreement, only notation difference.

### C2 — Frame Length Field Width `inferred`
brAzzi64: 4-byte LE length at offset 5. Janczykkkko/HomoLand: 2-byte LE length at offset 5 + 2 zero bytes. The raw wire bytes are consistent across all sources; this is a documentation interpretation difference. Effect: zero.

### C3 — Command 8104 (Set Cup) Values `corroborated conflict`
- **brAzzi64:** Values come from xBloom cloud API per cup type. Observed from HCI: `(200.0, 80.0)` for cup types without HCI capture, `(110.0, 90.0)` for xDripper, `(200.0, 80.0)` for "other".
- **HomoLand:** Calls the field `COFFEE_CUP_GEOMETRY_COMPAT` with constant `(110.0, 90.0)` for ALL coffee recipes, explicitly stating "do not change without a controlled hardware A/B." The comment notes "APK 2.2.2 calls this APP_SET_CUP and treats both floats as cup geometry."
- **saya6k brewing.py:** Uses `(80.0–90.0, 40.0)` for coffee brews (grind), `(80.0–90.0, 0.0)` for no-grind.
- **Assessment:** The three implementations send materially different values. The machine reportedly brews correctly regardless (brAzzi64). The field's exact semantics — cup geometry, weight range, or something else — remain unverified. **Do not trust any single value set blindly.**
- **XBRW++ (M3, 2026-09-01):** ~~omits 8104 entirely~~ — **reversed, same day, after hardware testing.** The original reasoning misread the evidence: the sources disagree about the *values*, not about whether the command is sent. All three send it, and `xbloom.py`'s `run_brew` — the only brew sequence we have that is known to work on hardware — sends it between the dose and the recipe. XBRW++ now sends `(200.0, 80.0)`, the reference's default and HCI-confirmed for Free Solo, which is also the widest range and so the conservative choice for a field that appears to govern overflow protection.

### C4 — Command 40518 (0x9E46): Start vs Pause `RESOLVED on hardware`
- **brAzzi64 / Janczykkkko:** Treat this as the post-commit "start" frame (`build_start()`), sent ONLY when the machine stalls in awaiting-confirm. Janczykkkko warns: "sending it into a running brew aborts it back to armed — verified on hardware."
- **saya6k brewing.py (comment):** "Third-party notes (HomoLand/Janczykkkko) claim 40518 acts as 'start' from awaiting-confirm on their unit; tried live on this machine 2026-07-19 and it bounced the state back to `recipe_loaded` instead of starting." saya6k therefore does NOT send 40518 at all and instead waits for the machine to auto-start or prompts the user.
- **HomoLand protocol.py:** Names 40518 as `CMD_COFFEE_PAUSE` but also documents it as `START_OPCODE = 0x46`.
- **Assessment: HIGH-RISK CONTRADICTION.** The same command code may behave differently across units/firmware. On one machine it starts the brew; on another it sends the brew back to armed. **Do not send 40518 unconditionally after commit.** Safe strategy: observe state, send only if machine is in awaiting_confirm AND has been confirmed stable there for several seconds.
- **XBRW++ (M3, 2026-09-01):** the brew path never sends 40518 under any condition. When the machine parks in awaiting-confirm the app asks the user to press the button on the machine, which is a thing they are standing next to anyway. A regression test asserts the frame is absent and has been red-green verified against the guard. The command remains reachable from the machine console behind a confirmation that shows this disagreement verbatim — deliberately, because settling it needs somebody to send it on purpose and watch.
- **Resolved on hardware 2026-10-08 (V12.0D.500): it is Pause.** HomoLand's `CMD_COFFEE_PAUSE` name was right and the `START_OPCODE` reading was wrong. Sent mid-pour it was acknowledged, emitted `40515` with the volume so far, and settled on `0x1F`. Sent again while paused it did nothing. `40524` resumed it and the brew **continued** from where it stopped, finishing normally.
- **Which means saya6k saw a pause and called it a bounce.** "Bounced the state back to `recipe_loaded`" is `0x1F`, and `0x1F` is where a pause lands. The observation was accurate; only the name was wrong. Janczykkkko's "aborts it back to armed" is the same event with the same misreading, and the brew was not aborted, it was waiting.
- **The standing advice does not change.** 40518 is still never sent by the brew path, because pausing a brew nobody asked to pause is as bad as aborting one. It is now safe to *offer*, which is what packages 8 and 9 turn on.

### C5 — Command 8005 (Weight Unit) Payload Values
- **brAzzi64 PROTOCOL.md:** `0=g, 1=oz, 2=ml`
- **HomoLand protocol.py `build_set_weight_unit`:** `ml=0, g=1, oz=2`
- **Assessment:** Direct conflict. These cannot both be correct. No hardware verification to resolve it. **Flag as unverified before implementing.** `single-source conflict`

### C6 — Command 8010 (Temperature Unit) Payload Values
- **brAzzi64 PROTOCOL.md:** `0=°C, 1=°F`
- **HomoLand protocol.py `build_set_temperature_unit`:** `F=0, C=1`
- **Assessment:** Direct conflict. Same note as C5. `single-source conflict`

### C7 — Scale Weight Notification Code
- **brAzzi64:** Uses command code `20501` (0x5015) and `10507` (0x290B) as scale weight notification identifiers.
- **Janczykkkko/HomoLand:** Use `TYPE` byte `0x4B` (water in milligrams) and `0x15` (coffee/cup weight in grams) as the notification type identifiers. These are the byte at offset 3 of the notification frame, not a command code in the same sense.
- **Assessment:** Different layers of abstraction, not an actual wire conflict. The brAzzi64 `CMD_NAMES` table and the Janczykkkko telemetry module are consistent when you align on the frame structure. The water weight is in milligrams (÷1000 for grams); brAzzi64 decodes it differently (directly as float). `inferred`

### C8 — Recipe Tail Byte (Ratio byte) Encoding — CRITICAL `corroborated`
**This was a known bug in brAzzi64's original script, since corrected.** The tail byte is `round(total_water / dose * 10)` (ratio × 10), **NOT** `total_water / 10`.

saya6k adds a further refinement: use **ceiling** not truncation/rounding:
> "18g/250ml truncated to 138 (18×13.8 = 248.4 < 250) and never ground; the same recipe with 139 (250.2) or 140 (252) grinds… A small overshoot is tolerated while any undershoot is fatal."

Janczykkkko uses `round(total/dose*10)`. saya6k uses `math.ceil(ratio * 10)`, clamped to 255.

**Assessment:** Use `min(math.ceil(total_water_ml / dose_g * 10), 255)` to be safe. Truncation can silently cause the machine to skip grinding with no error.

### C9 — No-Grind Wire Byte
**brAzzi64 original:** Sent `grinder_byte = 0` for no-grind recipes.  
**All later sources (Janczykkkko, HomoLand):** Send `0xFE` for no-grind. `0x00` grinds at the finest setting.  
**Assessment:** `0xFE` is the correct value, confirmed by HCI capture of the app's grinder-OFF slot save. `corroborated`

### C10 — Commit + Start Sequencing `RESOLVED on hardware`
- **brAzzi64 / Janczykkkko / HomoLand (theory):** Send 8002 (commit), then observe; send 40518 (start) only if machine stalls.
- **saya6k (observed on hardware 2026-07-19):** Sends 8002, waits for state transition — auto-proceed works. Sending 40518 bounced state backward. Does NOT send 40518.
- **Assessment:** The machine's behavior after commit is firmware/unit dependent. Implement an observe-then-decide strategy. Do not hardcode a 40518 send.
- **Resolved on hardware 2026-10-08 (V12.0D.500):** there was never a start/stall question here. 40518 is Pause (see C4), so sending it after commit could only ever have moved the machine to `0x1F`, which is what saya6k saw. Auto-proceed after `8002` is the only route, and never sending 40518 from the brew path remains correct for a reason that is now plain rather than cautious.

### C11 — Tea Pause Byte Encoding `RESOLVED on hardware`
- **HomoLand (tea.py):** Pause bytes split as `((-remainder)&0xFF, (minutes*32)&0xFF)`.
- **saya6k (brewing.py):** Uses a soak byte in position [1] (positive, scaled by 0.6 = firmware runs it at ~1.67×). Byte [0] = 0 (no inter-pour wait). States the 0.6 scale is "approximate."
- **Assessment:** Fundamentally different encodings. Neither is hardware-confirmed for multi-steep tea. Tea protocol is the least-verified area.
- **XBRW++ (M3, 2026-09-01):** ships **both**, selected by the `teaSteepEncoding` setting. HomoLand's is the default on provenance; saya6k's own note calls its 0.6 scale "approximate". The console offers the switch. One stopwatched sixty-second steep on real hardware settles this, and the wrong choice produces no error at all — the tea simply steeps for the wrong length, which is why the app could not just pick one and hope.
- **Hardware verdict (2026-09-01, J15 firmware V12.0D.500):** the stopwatch was run. Tea brewed with the default `homoland` encoding and the steep timer was correct. HomoLand's encoding is confirmed; saya6k's remains available behind the setting but is no longer the one to reach for. This was the last open M3 acceptance criterion.

---

## C. Notifications / Telemetry

The machine pushes the following data unprompted on FFE2:

| Stream | Frequency | Format | Notes |
|--------|-----------|--------|-------|
| Water weight | ~10×/s | float32 LE, milligrams (÷1000 for g) | Frame type 0x4B. Streams during brew AND at idle (reads ~0 when idle/untared). |
| Coffee/cup weight | ~10×/s | float32 LE, grams | Frame type 0x15. Same timing. |
| Machine status | Event-driven | State byte after 0xC1 in 0x57 frame | State transitions: idle, loading, armed, awaiting_confirm, starting, brewing, complete, etc. |
| Machine activity | Periodic + on-event | LE uint32 in 8023 notification | 1=Pro idle, 65=Easy idle, 34=brewing active, 36=brew done. |
| Machine info | **After each 8100 handshake** (see note) | 61-byte blob in 40521 notification | Contains all persistent machine settings: firmware ver, grinder size, water level, temp unit, weight unit, water source, mode, LED brightness, pour radius, vibration amplitude. |
| Water volume | ~100ms | float32 LE in 40523 notification | Tank water level. |

> **The machine offers a third characteristic, `ffe3`.** Read off hardware
> (2026-09-01, V12.0D.500) with the console's radio dump: the service carries
> `ffe1 Write,WriteWithoutResponse`, `ffe2 Notify`, and
> `ffe3 WriteWithoutResponse,Notify,Write,Read`. No source mentions `ffe3`.
> XBRW++ subscribed only to `ffe2` until this was found, so anything the
> machine sends on `ffe3` was invisible to the app and indistinguishable from
> something it never sends at all. What travels on it is still unknown.

> **The session goes stale, and a stale session is answered with silence.**
> Settled on hardware (2026-09-01, V12.0D.500). A well-formed 40521 sent six
> minutes into a live, connected link produced no reply of any kind. The
> identical frame is answered at connect, where an 8100 precedes it by one
> gap. Sending 8100, waiting a gap, then the same 40521 produced the answer
> immediately. So 8100 is not only a connect-time greeting with a 200 ms
> window — it opens a session that expires, and the machine ignores commands
> sent outside one. No source says this. How long the session lasts is not
> known; somewhere between one gap and six minutes.
>
> The handshake makes the machine **beep**, which rules out sending it
> speculatively or on a timer.

> **A bare 40521 request is ignored; the vitals follow an 8100 (2026-10-19,
> V12.0D.500).** Device log on preview 329229b, machine "Work" just updated to
> V12.0D.500, with every send logged:
>
> ```
> 05:31:02.480  ->  8100                         (connect handshake, beep 1)
> 05:31:02.538  <-  event 8100
> 05:31:03.161  <-  58 02 07 4B 1F 0C 00 00 00 C1 FC 83   (event 8011, see below)
> 05:31:03.624  <-  state 0x1d
> 05:31:03.689  <-  40521 info (75 bytes, V12.0D.500 PRO)   (no request sent)
> 05:31:04.564  <-  state 0x01
> 05:31:09.653  ->  58 01 01 49 9E 0C 00 00 00 01 74 B8   (40521 request)  no reply
> 05:31:13.658  ->  40521 request  no reply
> 05:31:17.692  ->  40521 request  no reply
> 05:31:19.781  ->  8100                         (beep 2)
> 05:31:20.087  <-  event 8100
> 05:31:20.189  <-  40521 info                   (no request sent)
> 05:31:21.789  ->  8102, 8104, 8001 ... the brew (stopped at 0x0f, no beans)
> 05:31:40.147  ->  40521 request  no reply      (the post-brew dial read)
> 05:31:44.118  ->  40521 request  no reply
> 05:31:48.128  ->  40521 request  no reply
> ```
>
> The machine sends 40521 by itself, 0.4 to 1.2 s after acknowledging an 8100,
> and ignores a 40521 request on its own even seven seconds into a fresh
> session. So the 2026-09-01 "stale session" reading above was most likely
> this: the 40521 that "worked" at connect was the one the handshake pushed.
> V12.0D.210 has not been tested this way; its earlier logs show the same
> 8100-then-info pairing, with requests that were not logged at the time.
>
> What XBRW++ does now:
> - Connect sends one 8100 and waits up to `INFO_WAIT_MS` (3 s) for the info
>   it pushes. No 40521, and no second handshake if none comes.
> - BREW uses the vitals this link already heard if they are under
>   `INFO_FRESH_MS` (10 minutes) old, with no handshake and no question, and
>   the brew burst never carries an 8100. Older or missing vitals, or a cached
>   low tank (which may have been filled since), get one 8100 and one wait.
>   A mode switch (`11511`) still renews before the retry.
> - Refresh on the home screen is the only other sender: one 8100.
> - Nothing sends a bare 40521. Settings no longer asks when it opens.
>
> **Unverified on hardware:** that a session opened at connect still takes a
> recipe ten minutes later without a fresh 8100. The official app appears to
> work this way (one beep at connect, none at brew). If it does not, the
> recipe is not acknowledged and the brew fails as `rejected` after
> `RECIPE_ACK_MS` with nothing poured.
>
> The `4B 1F` frame with no payload is event **8011**, which the table above
> names "Machine Awake". It arrives right after the handshake. The parser used
> to read every `0x4B` frame as a water weight and logged this one as
> unreadable; it now reads a `0x4B` frame with no float as an event.

> **The info blob is not a heartbeat.** Sources describe 40521 as streaming
> periodically. On hardware (2026-09-01, V12.0D.500) it does not: a tank
> refilled after connect still read Low in XBRW++ until the app asked again.
> (Superseded 2026-10-19: "asked again" was a handshake, which pushes the
> blob. XBRW++ now refreshes only on Refresh, on a stale or missing reading
> at BREW, and on a cached low tank at BREW. See the note above.)

> **The grind dial after a brew is no longer asked for (2026-10-19).**
> The dial is an override: where it is set changes how the machine grinds
> without the app being told, and it is turned before a brew, not during one.
> XBRW++ used to read it again once a brew ended and store it as `dialAfter`
> beside the pre-send `dialBefore`. That read sent bare 40521s, which
> V12.0D.500 ignores (the three requests at 05:31:40-48 above), and the only
> working alternative is a handshake, which beeps after every brew. So
> `readDialAfterBrew` sends nothing now: it keeps a `dialAfter` only when the
> machine reported its vitals after the pour began by some other route, and
> otherwise leaves the field absent, which records already read as "not taken".
>
> **Still unsettled, and it needs hardware.** Nobody has checked whether the
> blob reports the *physical dial* or the value the app last sent in the recipe
> blob. If it echoes the app's own value, the reading tells us nothing new for
> a grinder-on brew, though it would still be the only source of truth for a
> grinder-off one, which is the case the feature was asked for. The test: set
> the dial to a known position, send a grinder-on recipe asking for a
> *different* grind size, and read the blob after the brew. Whichever of the
> two numbers comes back is the answer.

| Pour events | Event-driven | 40510 per pour | pour_index in payload |
| Brew lifecycle | Event-driven | 40502, 40507, 40510, 40511, 40512, 40513 | Grinder start, stop, bloom, brewer stop, enjoy |
| Error events | Event-driven | 40517, 8203, 8204 | Idling error, gear position, dose/water (40522 is the tank flag, not an error) |
| Scale events | Event-driven | 9002 (In Scale), 9008 (Scale Out) | Object placed/removed |
| Grinder events | Event-driven | 9003, 40507, 40505 | Grinder begin, stop, gear report |
| Mode ACK | On command | 11511 notification | Status C2 confirms mode change |

**Key implication for XBRW++:** Live brew progress is fully available. The water and coffee weight streams at 10×/s are sufficient to show a real-time pour graph. The 40510 pour-index notification marks each pour boundary. The state machine (0x57 frames) provides structured lifecycle events. All of this is available without polling — the machine pushes it continuously.

**Scale accuracy note:** brAzzi64 observed a ~15–19g fixed thermal offset when weighing hot water. The machine scale is less accurate during hot brews; the gap is thermal (load cell heating), not proportional to volume. `spec`

**Firmware tare during bloom:** The firmware auto-tares the scale 2–3 times during the first ~4 seconds of a bloom pour (no-grind path). brAzzi64's `BrewWeightTracker` class handles this with a 10-second detection window and offset accumulation. `spec`

---

## D. Connection Lifecycle

### UUIDs `spec`
- Service: `0000E0FF-3C17-D293-8E48-14FE2E4DA212`
- Command (write): `0000FFE1-0000-1000-8000-00805F9B34FB`
- Status (notify): `0000FFE2-0000-1000-8000-00805F9B34FB`
- Aux: `0000FFE3-0000-1000-8000-00805F9B34FB`

### Post-Connect Handshake (Required) `spec`
1. Connect to device (by service UUID or name prefix `XBLOOM`).
2. Subscribe to FFE2 notifications.
3. Send handshake (command 8100) within ~200ms of connect:
   ```
   580101A41F1400000001B900000001000000BDD1
   ```
   = `build_packet_type1(8100, [185, 1])`
4. Machine display wakes, BLE indicator appears, status notifications begin.
5. **Not optional — inter-frame pacing is required.** `corroborated` (XBRW++, observed on hardware 2026-09-01) These are Write Without Response frames, so nothing flow-controls them. A single command lands reliably; a burst of five is dropped almost entirely, and the machine reports nothing at all — which a client sees only as a recipe that never reaches `loading`. `xbloom.py`'s `run_brew` sleeps **2.0 s after every packet**, including the handshake, and re-sends the handshake at the start of each brew. XBRW++ initially sent the brew sequence back-to-back and could not brew at all, while single console commands worked; spacing the frames is what the fix consisted of. Do not treat this as an optimisation to remove.
6. **Optional settle:** Janczykkkko recommends a ~2s settle after sending `a4` + `0x56` status query before sending recipe frames, to let the machine leave its post-connect transitional state. Without this settle, recipe loads may never reach the armed state. `single-source` (Janczykkkko, observed on hardware)

### Single-Client Limit `spec`
The machine allows **one BLE link at a time**. The official app holds the link when running; the third-party client must disconnect (or the official app must be closed and Bluetooth turned off on the phone) before connecting. No protocol-level indication of rejection — it simply fails to connect or ignores commands.

### Multiple Simultaneous Clients
**Not possible.** Single connection architecture. `spec`

> **But on Android two apps can share the one link (owner log, 2026-10-19,
> Galaxy Z Fold, machine "Work" V12.0D.210 updated to V12.0D.500).** XBRW++
> held the link with a brew loaded, went to the back, and the owner opened the
> official app and ran a firmware update. Android keeps one physical connection
> per device and hands notifications to every app subscribed to the
> characteristic, so XBRW++'s log recorded the official app's side of the
> conversation without having sent anything:
>
> ```
> 04:14:55.968  active brew went to the back, keeping the link
> 04:15:13.176  <-ffe2  event 8100 + 40521 info   (no send logged: the official app's connect handshake)
> 04:15:13.722  state 0x1d / 04:15:13.976 event 8022 / 04:15:14.924 state 0x01
>                         (8022 "back to home" is what the official app sends on connect;
>                          XBRW++ only sends 8022 after a 40519, and none was logged)
> 04:15:38.474  <-ffe2  event 8101
> 04:15:39.000  <-ffe2  06 43
> 04:15:39.517 .. 04:16:06.542  <-ffe2  06   (one every ~0.6 s)
> 04:17:21.795-.803  <-ffe2  06 x ~60 (burst), 15, 06 43, 06
> 04:17:21.858  link dropped by the radio
> ```
>
> The official app's screenshots put "Update Success, Version 12.0D.500" at
> 15:17:14 local (04:17:14 UTC), and the machine came back on V12.0D.500. The
> single bytes match XMODEM-CRC flow control from a bootloader (inferred):
> `43` ('C') asks the sender to start with CRC blocks, `06` (ACK) accepts a
> block, `15` (NAK) asks for one again. The burst and the drop are the end of
> the transfer and the reboot. So `8101` is very probably the official app's
> "enter firmware update" command (inferred, one observation, payload not
> seen because the official app's writes are not visible to us). The `06`
> stream is not the machine waiting for XBRW++, and it is unrelated to the
> brew the owner stopped.
>
> The parser is fine with these: a frame under 12 bytes or without the
> `58 02 07` header comes back as `unknown` with its bytes intact, which is how
> they reached the log.
>
> **TODO, not fixed:** XBRW++ cannot tell its own link from a shared one, and
> anything it wrote during that transfer (a settings-screen refresh, a cancel)
> would have landed in the middle of a firmware image. Nothing was written
> this time. A guard that goes quiet once raw `06`/`15`/`43` frames appear
> would be the obvious shape, but it needs a capture of an update to design
> against, not one log.

### Keepalive
No periodic keepalive is needed. The machine maintains the connection without pings. The app sends none. `corroborated`

### Held Session Mode `single-source` (Janczykkkko, Alshekhi)
The `a4` session-start frame doubles as a held-session marker. Sending it on connect and keeping the FFE2 subscription active causes the machine to show its "connected" icon and stay warm between brews. This avoids the per-brew connect+handshake overhead. The Alshekhi integration uses a "connect-on-demand" model (BLE only during active brew) while Janczykkkko's TUI uses a persistent held session.

### Pairing/Bonding
Not required. All sources connect without bonding. `corroborated`

### Timeout/Reconnection
No explicit timeout documented. The machine will disconnect after an extended idle period (duration not measured). No reconnection protocol documented; reconnect by repeating the full connect + handshake sequence.

XBRW++ propagates `RadioUnavailableError` immediately when the phone's Bluetooth
adapter is off, turning off, unauthorized or unsupported: these radio failures
bypass both the remembered-device scan fallback and connection retry delays.
A starting radio (`unknown`, `resetting` or `turning_on`) is still waited for by
the transport. Ordinary connection failures retain the stale-device scan
fallback and retries.

---

## E. Easy Mode Slots

### Slot Count: 3 (A, B, C) `corroborated`
The machine has exactly three on-board recipe slots. Confirmed across all sources. No source has discovered additional slots.

### Write-Only (No Read-Back) `corroborated`
The machine does NOT report the current slot contents over BLE. The only way to know what's in a slot is to track what was last written. Alshekhi and saya6k both store the last-written slot contents in HA's config entry because the machine cannot be queried.

### Slot Payload Format `corroborated`
Command 11510, Type 2 packet:
```
[slot_index (0–2)] [flags (1 byte)] [recipe_blob]
```
**Flags byte:**
- Bit 4 (0x10): Scale ON. User-selectable per ordinary slot in XBRW++,
  off by default (including historical snapshots without a scale setting).
  The intended hardware behavior is automatic tare when that slot is started;
  this new control still needs physical qualification, including tea.
- Bits 1–3: cup/mode selector, **not grinder control**, recovered from the
  developer-distributed Android APK on 2026-10-10. XPod `0x00`, xDripper
  `0x02`, Other `0x04`, Tea `0x0C`.
- Bit 0 (0x01): bypass enabled.
- For tea, add `(steep_count - 1) * 0x20`. One steep is `0x0C`, two
  `0x2C`, three `0x4C`, before scale/bypass additions. These three
  scale-off selectors were successfully tested on hardware on 2026-10-11.
  Scale-on and arbitrary steep counts are not covered by that trial.

The earlier public `SLOT_GRINDER_OFF = 0x04` interpretation was incorrect.
The APK selects `0x04` for the Other cup type and handles grinder-off
separately by replacing the blob's penultimate byte with `0xFE`.
See the artifact provenance and complete tea conversion below.

> **Observed on hardware 2026-10-08 (V12.0D.500): `0x02` defers to the blob.**
> Slot C went up grinder-**off** under `0x02` and displays the grinder off;
> slots A and B went up grinder-**on** under the same `0x02` and both display
> a grind size. So under `0x02` the `0xFE` grind byte inside the blob decides,
> which is the field C5 already settled, and Janczykkkko's constants are safe.
>
> **Observed on hardware 2026-10-10: `0x04` also preserves grinder-on.**
> Reference-matrix C carried grind size 50 under `0x04` and displayed
> a grind setting. This rejects a grinder-off override; it does not mean
> the lower nibble is inert. The APK identifies its separate cup/mode role.
>
> **The working rule until then: send `0x02` (or `0x12` with the scale) and
> let the blob carry the grinder.** That is the one combination proven in both
> directions. This remains the current app's qualified coffee behavior,
> not a claim that `0x02` represents every cup type. Changing cup/overflow
> semantics requires a separate implementation and hardware qualification.

### Batch-Write Requirement `corroborated`
Send all three slots (A, B, C) to complete a confirmed set. Writing only one or
two leaves the machine temporarily at state `0x43` (saving_slots). On the tested
machine this clears after approximately one minute, or immediately with 40526.
Neither exit establishes which slot contents survived. There is no separate
"commit" frame in the tested three-slot sequence; completion is observed after
all three 11510 frames have been received. Partial-write atomicity is not proven.
Sequence:
1. ~~Switch to PRO mode (11511, `"00000000"`) — slot writes are only accepted in PRO mode. In AUTO mode the machine sits at state `0x41` and rejects saves.~~ **Not required.** On hardware 2026-10-08, V12.0D.500, the batch behaved identically with and without the mode switch. The switch is still acknowledged; it just is not a precondition. Sending it is harmless, and an implementation that skips it has one fewer way to leave a machine in a mode its owner did not ask for.
2. Send 11510 × 3 (slots A, B, C in order).
3. Machine ACKs each with a 11510 notification (status C2).
4. Machine progresses: state `0x43` (saving) → `0x25` (saved) → `0x01` (idle), confirmed by an `0xF8` notify.

> **Observed on hardware 2026-10-08 (V12.0D.500): the hang is recoverable, and
> finishing the batch is the recovery.** Slot A alone put the machine into an
> unresponsive state with a looping animation on its display. Slot B changed
> nothing visible; this did not establish atomicity of the stored contents.
> Slot C released it, and the slot it had written was correct. So a write
> interrupted after one or two frames is not a brick and does not need a power
> cycle. Sending the remaining frames completes the set. The later timeout and
> 40526 tests below also release the saving display without completing the set.
>
> That is worth knowing before building this, because the obvious failure mode
> is a BLE drop halfway through three frames. The repair is to send the rest,
> which means an implementation should hold all three blobs before it sends the
> first, and should retry the batch from where it stopped rather than from the
> beginning.

> **A slot write leaves the machine in EASY/Auto**, hardware 2026-10-08,
> V12.0D.500. The session began in PRO, was explicitly sent the PRO switch, and
> ended in EASY. Normal brewing from the app still worked afterwards, so this
> is not a trap, but it is a visible change to somebody's machine that they did
> not ask for and an implementation should say so before it writes.
>
> **The machine's slot display is a poor witness.** It shows the ratio and the
> grind size and nothing else: no dose, no volume, no temperature. The three
> recipes this was tested with were 15 g/225 ml, 18 g/270 ml and 20 g/300 ml,
> which are all ratio 15, so the display agreed with all three and distinguished
> none of them. A future check of what actually landed in a slot wants three
> **different ratios**, and even then it can only confirm two fields.

### Recipe Order 11512 `APK-derived`
The inspected APK defines `BleCodeFactory.easyModeRecipesOrder` and a
`sendRecipeOrderToBLE` helper with payload `03 00 01 02`. However, the
inspected `EasyModeViewModel.syncRecipes` path does **not** call that helper:
it sends three 11510 frames, then updates local/cloud metadata. A defined
helper is not evidence of a required post-write call. Our hardware batch
already completed without 11512; do not add it as a speculative tea fix.

### Tea and stage capacity clarification (2026-10-10)

The official app can write tea to Easy Mode slots, reported by the user. Our
tea exclusion was an implementation-evidence gate, not a measured firmware
refusal. NFC tea encoding does not settle this: the card carries a cup-type
nibble, whereas the documented 11510 slot payload carries no cup type.
Ordinary BLE tea uses separate commands 4513/4512 and different steep-time
bytes; substituting that blob into a coffee slot frame has not been verified.

Public source inspection found no tea discriminator in the slot builders:
[brAzzi64's slot packet/flags](https://github.com/brAzzi64/xbloom-ble/blob/840a1974c1e28629083b954c74c506bd64b463db/python/xbloom.py#L399-L414),
[HomoLand's slot builder](https://github.com/HomoLand/xbloom-studio-brew/blob/fd2cdc5eb3d035dd2d78700ad9065a14a45aeb6b/packages/core/xbloom_ble/protocol.py#L1001),
and [saya6k's slot writer](https://github.com/saya6k/hacs-xbloom/blob/722fd94959683c10c0c9a7094781baf0ee52fdcd/custom_components/xbloom/brewing.py#L695-L757).
The latter two separately implement ordinary tea brewing. The Java decompile
cited by brAzzi64 is a local path, not published source; its existence does not
give us access to the official slot builder.

#### Official Android tea slot writer recovered (2026-10-10)

**Current status (2026-10-11):** the APK-derived one-, two- and three-steep
scale-off candidates worked on hardware, reported by the tester.
The failed trials below remain historical hardware evidence, not the current
state of protocol knowledge. Ordinary tea assignment is now enabled through
the same validated snapshot, database and three-slot writer as coffee.
See the production integration below for the supported bounds.

**Artifact provenance**

- Developer help article:
  <https://tbdxsupport.zendesk.com/hc/en-us/articles/14021922246939>.
  Its public article body links directly to the binary below.
- Download:
  <https://tbdprodproducts.s3.amazonaws.com/downloads/xbloom_coffee_release.apk>.
- Package `com.xbloom.tbdx`, version **2.2.2**, version code **2002033**,
  size **99,750,594 bytes**. This is the developer-hosted build, not a
  claim that it is the latest Google Play build.
- APK SHA-256:
  `29624db558917e6a975cd58a3123c240950d200a3adc4efe8ffef222e1b14c6e`.
- Signing certificate SHA-256:
  `564b7a6176102a00849b0413f58e8fadba256e9e6d790a4cb40ca8edc1909624`.
  Google's `apksig` 8.13.0 verified the APK's v2 signature with no errors
  or warnings. This checks artifact integrity, not a comparison against
  a separately obtained Play signing identity.
- Inspected locally using JADX 1.5.6, Androguard DEX decoding and
  Capstone AArch64 disassembly. JADX reported 163 errors across the
  full app; the selector was independently checked against its DEX
  instructions, not inferred from a broken decompilation.

**Actual call path**

`EasyModeViewModel.getRecipeHex` supplies cup type, grind size, `grandWater`,
RPM and pour data to `EasyModeRecipeCodeTransfer`. For tea that transfer
chooses the local `GetRecipeCodeService.executeClient` builder even when
online. No cloud response or privileged account is needed to build tea.
It then calls `JNITools.teaRecipeCreate` with the baseline blob and a
concatenation of three-digit decimal steep times.

The JNI implementation in `lib/arm64-v8a/libnative-lib.so` rewrites the
pause/dose byte pair to retain minute-scale steep duration. Native symbol
`TeaRecipe::TeaRecipeCreate` starts at ELF virtual address `0x1E0FC`.
The arithmetic at `0x1E414–0x1E468` divides by 60, negates the remaining
seconds and adds minutes times 32 to the following byte. It rejects a
duration of 361 seconds or more at `0x1E400`; this is a builder boundary,
not a firmware capacity measurement. The Java baseline clips tea waits
above 120 seconds before the native rewrite. The app gates longer tea
waits on a Studio version string at least `V12.0D.400`.

After that rewrite, `getRecipeHex` applies grinder-off and optional bypass,
computes the selector described above, adds the scale bit, and prefixes
slot index. `BleCodeFactory.easyModeRecipe` dispatches it through command
11510 using the ordinary Type 2 wrapper. Marker `0x01` stays unchanged.
There is no separate tea command in this inspected slot-writing path.

Independent DEX check: `classes4.dex`,
`EasyModeViewModel$getRecipeHex$1.invoke(EasyModeRecipeCodeResponse)`,
code-item offset `0x47BAE4`. Bytecode offsets `0x029E–0x02BC` load
pour-list size, subtract one, multiply by 32 and add 12. Scale addition
and slot/flags formatting follow at `0x02BE–0x0306`. These offsets are
specific to this APK, not stable identifiers for later versions.

**The supplied official one-steep reference**

The Java builder retains the 90 ml programmed stage. It encodes no
additional 30 ml drain stage; `teaRecipePerVolumn` is not an input to
this slot builder. Its suffix uses `grandWater * 10`, narrowed to a byte,
not the app's ratio recomputed from programmed volume and dose. For the
supplied reference, `grandWater = 15` gives `150`, while
`isSetGrinderSize = 2` overrides stored grind size 50 to `254`.

The independently reconstructed one-steep, scale-off payload is:

```text
slot A: 00 0C 08 5A 5C 02 00 EC 00 78 23 FE 96
```

That is slot 0, tea selector `0x0C`, an eight-byte stage, 90 ml, 92 C,
spiral, no vibration, 20 seconds, zero minute/dose byte, RPM 120,
3.5 ml/s, grinder off and suffix 150. With scale on the selector is
`0x1C`. It differs from the failed reference-matrix B in the selector,
not volume, timing or suffix. This was independently reconstructed, not
captured from the official app. The corresponding one-steep LAB candidate
subsequently worked on hardware on 2026-10-11.

Steep-count packing does not establish a hardware maximum. Do not infer
arbitrary stage capacity or silently wrap an overflowing selector.

**Separate recovery lead**

The official `syncRecipesFailed` path calls
`BleCodeFactory.backToNormalState`, which sends **40526** with no payload
through a Type 1 wrapper. Its constant happens to be named
`RD_CurrentGrinder`; the caller uses it to leave a failed slot write.
The tester successfully used it from the raw console on 2026-10-11 to release
incomplete slot saving. This does not prove rollback, an atomic cancel or safe
use while a native write is pending. No automatic recovery command was added.

All binary/decompiled artifacts and local inspection scripts are retained
outside the repository. These notes are an independently written description
of protocol behavior; no APK, proprietary implementation, account data or
credentials are distributed. A public protocol should label static findings,
fixture checks and hardware confirmation separately.

#### Source-backed LAB controls (2026-10-10)

Easy Mode's LAB now offers two separately identified, development-only trials.
They can be selected directly after any active trial has been resolved and its
originals restored; the historical flag probes do not need to be repeated.
Each new lab runs once per retained machine record. Restored trials are
archived with their exact evidence and observations before the other begins.

- `tea-slot-apk-steeps-abc-v1`: writes A/B/C with respectively one, two
  and three 90 ml, 92 C, 20-second steeps, spiral, no vibration, flow
  3.5 ml/s, RPM 120 only in stage one, grinder off and suffix 150.
  Scale is off. Selectors are `0x0C`, `0x2C`, `0x4C`. Record each slot's
  overview, actual steep timing and drain behavior separately. No brew
  is started by the app. Allow for firmware drain water, particularly
  the approximately 360 ml finished volume of C.
- `slot-apk-recovery-40526-v1`: preserves a complete original coffee set,
  resends **only original A**, waits for its 11510 receipt, then deliberately
  leaves the journal at `acknowledged: 1`. B/C remain unsent but their exact
  frames are durable. There is no final-save claim. A second explicit
  confirmation sends Type 1 command 40526 with no payload, while the machine
  may still show its saving animation. A command receipt records only the
  reply and the observed state before/after, not operability or rollback.

The recovery command is refused if A's receipt is unknown, a native operation
is still pending, the peripheral/serial changes, or an ordinary brew owns the
transport. It is bounded by the existing dispatch and receipt timeouts. Its
receipt never clears the journal. Check the machine's physical controls and
record its responsiveness in the observation note. MACHINE IS USABLE requires
explicit confirmation and a matching shared lease in a **known** normal state
before clearing the phone-side pending write. Slot contents then remain
unconfirmed until RESTORE ORIGINAL SET finishes all three receipts and final save.

If 40526 is refused, times out or does not release the saving display, close
LAB and use RETRY WRITE to finish the retained B/C frames. Then restore the
original set through LAB. An uncertain native send still requires settlement
or reconnect before either path. An app restart retains the trial and journal;
production builds retain recovery/restore access but offer no fresh labs.
All observations and both new trials are included in COPY PROBE EVIDENCE.

#### Hardware qualification update (2026-10-11)

The tester reported that the A/B/C steep tests worked, confirming tea
functionality for the exact one-, two- and three-steep scale-off candidates.
This report does not add stopwatch measurements or qualify scale-on,
long steeps, bypass or additional steep counts.

The tester also wrote one slot from the machine console and observed the
incomplete saving display return to normal after approximately one minute.
The complete raw Type 1 recovery frame was then tested successfully while
incomplete saving was active:

```text
58 01 01 4E 9E 0C 00 00 00 01 6C 7F
```

The recovery result is a hardware observation, not a captured reply log;
no rollback or slot-content readback was reported. The firmware timeout was
estimated, not measured, and must not be used as an automatic journal-clearing
timer. A return to normal establishes operability, not that the set was saved.

The LAB single-slot and recovery actions were difficult to trigger in the app;
the successful raw-console route qualifies the command, **not** the end-to-end
LAB controls. That UI issue remains open. Normal app brewing still respects
the durable pending-write guard until the write is completed or explicitly
cancelled against a known-normal machine. Incomplete-write copy is now neutral
and explains the temporary saving display instead of implying a permanent lock.

#### Production integration (2026-10-11)

Ordinary tea recipes now use their complete local stages with the official tea
selector and no bypass. Scale is off by default and can now be enabled per
ordinary slot: coffee `0x02` becomes `0x12`; tea `0x0C`/`0x2C`/`0x4C`
becomes `0x1C`/`0x3C`/`0x5C`. This changes only flag bit `0x10`, not the recipe
blob, cup selector or grinder bytes. Scale choices are local drafts until
WRITE TO MACHINE commits the three-slot set, survive recipe replacement and
library updates, and are included in exact recovery frames. Fixed historical
probes remain unchanged and do not offer the control. Scale ON/OFF and automatic
tare on hardware, including tea, still need qualification; the earlier
scale-off tea trial does not establish that behavior.

The existing tea limits apply: one to three
steeps, 1–90 ml each, 39–99 C and 0–360 seconds, with integer encoded fields.
The grinder is always off, as in ordinary BLE tea brewing; the model's
hidden coffee-grinder toggle is not a request to grind tea. Stages retain their
pattern, agitation, temperature and flow, with RPM only in the first stage.
No synthetic 30 ml drain stage is added.

Timing uses the shared `teaSteepBytes`. The suffix intentionally differs from
ordinary BLE tea: the official slot builder's `grandWater * 10`, narrowed to
u8, is represented by `Math.trunc(recipe.ratio * 10) % 256`. This is explicit
wire arithmetic, not a saturation or an overflow accident. `recipe.ratio` is
the app's current local value, not preserved remote metadata. The tested
fixed LAB suffix was 150; other local values follow the recovered builder,
but have not all been individually run on hardware.

The transport checks firmware before dispatching any set with steeps longer
than 120 seconds: it requires reported V12.0D.400 or newer. Unknown firmware
is not treated as compatible. Short-steep tea and coffee remain available.
Coffee's existing `0x02` selector and blob are unchanged. Snapshot equality
now includes the selector as well as blob bytes, so switching identical
coffee bytes to tea still produces NOT WRITTEN and RECIPE UPDATED.

STOP THIS WRITE is the normal, explicitly confirmed recovery action. It
acquires the existing journal through the shared machine owner, which still
rejects active brews, mismatched identity and pending native operations. If
the machine is known-normal already, it clears the journal without a send.
Otherwise it requires a known saving state, sends 40526, waits for its reply
and a post-dispatch normal-state notification, then clears the journal.
Failure at any step retains the unfinished write. Slot contents remain
unconfirmed; drafts are preserved and no saved-set success is shown.
RETRY WRITE remains available to finish or restart the full set.

The route no longer provides the LAB entry or new-test actions, in development
or production. Historical trials and their exact validation remain readable;
any active trial exposes RESTORE ORIGINAL SET directly on the normal screen
after its pending write is completed or stopped. Disabling LAB does not discard
its originals or silently promote a candidate to a saved personal assignment.

#### Historical bounded tea slot probe (2026-10-10): **SAVED, NOT TEA**

The first physical trial on V12.0D.500 saved all three slots: the retained
journal records three receipts followed by final-save confirmation. Its
one-steep A payload was `[0, 0x02, 8, 60, 70, 0, 0, 0, 32, 120, 30, 254, 120]`
(slot, flags, blob). The user then invoked and manually ran A with the Omni
Tea Brewer. Unlike tea slots from the official app, its loaded overview showed
no steep counter. It delivered water, waited approximately one minute, beeped
and finished, **without a tea siphon/drain cycle**.

This rejects the hypothesis that the tea timing blob under slot flags `0x02`
alone selects tea on this firmware. Storage acceptance and timing execution
do not establish tea mode. These are user-reported physical observations;
the supplied evidence is a durable write journal, not captured execution
notifications, and its observation field had not yet been populated.

No additional flag or mode command was tested. The tea selector remains
unknown. The user subsequently confirmed successful RESTORE ORIGINAL SET.
Preserve this trial's evidence before another separately identified candidate.

The user supplied a public official single-steep share recipe,
`https://share-h5.xbloom.com/?id=lRU%2FNUodjN5PzwxNQaOxeA%3D%3D`.
Its detail response identifies `cupType: 4`, `cupTypeName: "TEA"`,
`isSetGrinderSize: 2`, `subSetType: 2` and one 90 ml, 92 C, 20-second stage.
This supplies an official API tea discriminator independent of the grinder
setting; it does **not** establish that the slot flags byte carries cup type.
It makes interpreting the lower nibble as necessarily grinder-only less
convincing, but API-to-wire mapping still needs a physical test.

The next user-approved candidate changes **only A's flags to `0x04`** with the
same 60 ml, 70 C, 60-second blob. B/C remain `0x02` with exact original bytes.
Candidate `tea-slot-0x04-one-steep-v1` was subsequently tried as recorded below. The prior
restored trial must be archived intact before preparation, and no third
candidate is authorised. No additional mode or execution commands are added.

**Second physical result (2026-10-10): saved, still not tea.** The user supplied
the second trial's journal: A's flag is `0x04`, its unchanged blob is
`[8, 60, 70, 0, 0, 0, 32, 120, 30, 254, 120]`, and three receipts precede final
save. The user reported the same absence of a tea overview and drain cycle.
This excludes neither all flag encodings nor a different official tea blob:
both tested candidates shared a synthetic 60 ml blob, not an exact official
recipe encoding.

The user correctly challenged that experimental volume. Their official
reference has a 90 ml programmed stage and `teaRecipePerVolumn: "120"`;
they report a further 30 ml to initiate draining. The ordinary tea encoder
encodes programmed stages only, with no explicit drain pour. HomoLand's
`build_tea_recipe_code` likewise describes the approximately 120 ml finished
volume and siphon as firmware behavior rather than an extra encoded stage.
That supports keeping brew-stage volume distinct from finished volume, but
does not prove a 60 ml test is valid for the slot firmware.

There is also an unqualified suffix difference: the public builder retains
the official `grinderSize` and `grandWater` fields; our ordinary tea encoder
forces `0xFE` and derives ratio from stage volume/dose. For the supplied official
reference these would be `50, 150` versus our derived `254, 44` (30 multiplied
by ten and narrowed to a byte). The probe had `254, 120`. Neither the synthetic
probe nor the existing ordinary tea encoder should be described as byte-exact
official slot encoding. Audit the complete official recipe conversion before
another candidate, including volume, suffix, mode selector and drain behavior.

**Reference-derived A/B/C overview result (2026-10-10).** The user reported
that none of the three loaded slots displayed as tea. A and B displayed
grinder off; C displayed a grind setting. The user did not execute any of
them, so no timing, water volume or drain observation exists for this batch.
The matrix used the reference-derived 90 ml, 92 C, 20-second stage:
A flags `0x02` with suffix `254,150`; B flags `0x04` with `254,150`;
C flags `0x04` with `50,150`.

C's overview supports the earlier finding that `0x04` does not force the
grinder off when the blob carries a grind setting, on this firmware. Neither
tested flag nor the preserved official suffix selected a tea overview.
This still does not establish the actual tea slot selector; no further
candidate is authorised by this result. Restore the original set after the
batch and retain display-only observations as such, never as executed trials.

Candidate `tea-slot-0x02-one-steep-v1` is a hypothesis, not production tea slot
support. Easy Mode -> TEA SLOT PROBE -> WRITE PROBE prepares exactly A = one
60 ml, 70 C, 60 s steep, grinder OFF, no agitation or bypass, using the existing
tea encoder inside `11510 [slot, 0x02, blob]`. Nominal encoded dose is 5 g;
physical testing uses **no leaves**. B/C preserve the exact validated originals.
No extra mode/tea-execute command, flag sweep, automatic brew or retry is added.

New trials are development-only. A retained experiment remains accessible
from Easy Mode in production builds for recovery, RESTORE ORIGINAL SET,
manual observations and COPY PROBE EVIDENCE. One trial is allowed per retained
machine record; confirmed restoration keeps the evidence and never permits
an implicit replacement trial. General tea picker assignment remains blocked.

The shared writer acquires a matching device/serial in known normal state
before any fresh-trial journal or original-set preparation. It then preserves
the app's last-written A/B/C (or a complete draft set) atomically before dispatch.
These are app-recorded originals, not a readback of official-app changes.
Pending write/brew/native operations are excluded through the existing owner.
An active trial blocks ordinary slot assignment/writing until restoration.
Cancellation means **candidate-unconfirmed**, not a successful candidate save.

Hardware procedure used for this candidate:

1. Connect the recorded machine, wait for normal state and a reported serial,
   inspect the original names/provenance, then explicitly WRITE PROBE. Keep the
   app foregrounded and wait for all receipts **and final save confirmation**.
2. Stop after refusal or ambiguous/incomplete saving. Do not start A. Resolve
   the immutable journal through the existing RETRY WRITE / CANCEL THIS WRITE
   ceremony before restoration; restoration cannot bypass pending recovery.
3. After confirmed storage, inspect A manually on the machine, including
   grinder OFF and whatever values its display actually exposes. Only then
   start A **manually**, with the Omni Tea Brewer, no leaves, an empty receiving
   vessel, adequate water and the user present. Follow the device's physical
   safety instructions; do not touch or move the hot brewer. Stop on unexpected
   behavior rather than exploring another candidate.
4. Record actual display, held seconds (blank = unknown), whether it drained
   as tea (Unknown/Yes/No), and notes using SAVE OBSERVATION. A successful write
   or tea-looking display is not proof of hold/drain behavior.
5. Explicitly RESTORE ORIGINAL SET, confirm final saving and inspect A/B/C.
   COPY PROBE EVIDENCE copies retained machine/firmware readings when available,
   exact prepared frames, dispatch/receipt/save history and separately saved
   observations. Phone drafts remain distinct from restored machine snapshots.

Physical execution failed to demonstrate tea behavior as recorded above.
The user confirmed restoration after this trial. A successful future single-steep trial
would qualify only that candidate on the tested machine/firmware, not
multi-steep or general tea slots.

The measured ten-stage ceiling belongs to NFC cards only. Coffee BLE stage
bodies have a one-byte byte-count prefix: at most 255 segment bytes, not ten
stages. A stage takes eight bytes plus four bytes for each additional 127 ml
volume chunk. Thus 31 small stages fit the representation, but this is not
firmware proof of 31-stage slots. A full 11510 frame has 17 bytes outside the
segment body; a 244-byte link budget is consequently tighter than the body's
255-byte ceiling. Validate every frame in the set before sending A.

---

## F. Capabilities Beyond Basic Brew

These exist in the protocol but a simple "brew a recipe" feature wouldn't need them:

### FreeSolo Brewer (Standalone Hot Water Dispense) `single-source` (HomoLand)
Commands 8007 (enter), 4506 (start), 4507 (stop), 8013 (quit), 8019 (pause), 8021 (resume), 8016 (set pattern live), 4510 (set temperature live).  
`build_brewer_start` takes volume (ml), temperature (°C), flow rate (ml/s), pattern, and water source. RT mode uses temperature = 20°C (sentinel). This is a standalone water dispenser, completely independent of the recipe system.

### FreeSolo Grinder (Standalone Grind) `spec`
Commands 8006 (enter), 3500 (start), 3505 (stop), 8012 (quit), 8018 (pause), 8020 (resume).  
`build_grinder_start` takes grind size (1–80) and RPM (60–120, 10-step). The machine grinds for as long as desired (no timer in the command; machine runs until stop command or manual intervention).

### Scale Mode `spec`
Commands 8003 (enter), 8014 (exit), 8500 (tare). Continuous weight stream on FFE2 (0x15/0x4B frames). Object presence events (9002 In Scale, 9008 Scale Out). Full standalone scale with tare.

### Machine Settings (Persistent) `corroborated`
- Weight unit (8005): g / oz / ml — values disputed (see C5)
- Temperature display unit (8010): °C / °F — values disputed (see C6)
- Water source (4508): tank / tap
- LED/Display brightness (8103): low(1) / medium(8) / high(15)

### Mechanical Calibration `single-source` (HomoLand)
- Pour radius (11506 read, 11507 write): 400–1000, step 80. The arm's sweep radius. Default baseline 560–840 per unit. Type 2 frames.
- Vibration amplitude (11508 read, 11509 write): 1000–1500, step 100. Type 2 frames.  
These are accessed via HomoLand as `ATTR_POUR_RADIUS_LEVEL` and `ATTR_VIBRATION_AMPLITUDE_LEVEL` in HA services.

### Firmware / Machine Info `spec`
Command 40521 notification: 61-byte blob with serial number, model, firmware version, and all persistent settings. Streams periodically while connected. No write equivalent documented.

### Grinder Calibration Sweep `single-source` (saya6k)
Referenced in the LLM prompt as `calibrate_xbloom_grinder` — "runs the grinder's gear-position calibration sweep (~2 minutes, runs on its own)." The BLE command backing this is not fully documented in any source; it may relate to the gear report command 40505 or a separate undocumented command.

### Tea Mode `corroborated`
Commands 4513 (upload tea recipe blob) + 4512 (execute). Tea blob uses the same chunked pour encoding but with a different pause byte scheme and a soak-byte in the timing block position [1] (which is 0x00 for coffee). The machine has a dedicated Omni Tea Brewer mode with siphon/drain cycles. Parameters: leaf weight 3–5g, 1–4 steeps, 40–100ml per steep, 70–99°C. See CONTRADICTION C11 for unresolved tea pause encoding dispute.

### Bypass Pour `spec`
Command 8102 carries a bypass volume and temperature (floats). When bypass is enabled, the machine dispenses a separate volume of water at a specified temperature alongside the main recipe (used for dilution/bypass brewing like Aeropress). Sending 0,0 for bypass args disables it while still communicating the dose weight.

### Cloud Recipe Sync `corroborated` (Janczykkkko, Alshekhi, saya6k)
The xBloom app has an unofficial cloud REST API at `https://...xbloom.com`. Janczykkkko's package and both HA integrations can authenticate (email + password, with RSA-encrypted credential exchange) and sync/create/delete recipes in the user's cloud account. This is not BLE — it's HTTPS. The community recipe hub (`collective.xbloom.com`) is a separate, unauthenticated API for browsing public recipes. **These APIs are unofficial and undocumented by xBloom; they could change or be locked without notice.**

---

## G. Implementation Technique Flags (Attribution / Permission)

The following non-obvious implementation approaches are distinctive enough that XBRW++ would want to note attribution if reusing the specific technique (vs. independently arriving at the same conclusion):

1. **`BrewWeightTracker` (tare compensation)** — `brAzzi64/xbloom-ble:python/xbloom.py`. The specific 10-second window + offset-accumulation approach for compensating firmware-triggered auto-tares during bloom is a non-obvious choice. The technique (detect drop > 1g, accumulate offset, monotonic clamp) is specific enough to merit acknowledgment if adopted verbatim.

2. **Batch-of-three slot requirement discovery** — `Janczykkkko/xbloom-ble:xbloom_ble/client.py` / `xbloom_ble/protocol.py`. The `save_slots()` method and the comment explaining WHY (machine hangs at 0x43 if fewer than 3 slots written) represents original testing. The knowledge is now documented in multiple sources, but Janczykkkko appears to have been the first to document the batch requirement clearly in code.

3. **Ratio byte ceil (not round) fix** — `saya6k/hacs-xbloom:custom_components/xbloom/brewing.py`. The discovery that truncation/rounding can cause silent grind-skip and that ceiling is required is a hardware-verified finding by saya6k. The comment is very specific with the root-cause example. Worth acknowledging if used.

4. **`_tea_pause_bytes` split encoding** — `HomoLand/xbloom-studio-brew:packages/core/xbloom_ble/protocol.py`. The specific `divmod(seconds, 60)` → `((-remainder)&0xFF, (minutes*32)&0xFF)` derivation claims to be a port of the official Android app's `TeaRecipeCreate` native pause transform. If correct, this is the authoritative encoding.

5. **0.6 soak-time scaling for tea** — `saya6k/hacs-xbloom:brewing.py`. The empirical `soak_byte = max(1, min(round(pour.pausing * 0.6), 255))` constant was derived from two stopwatch measurements. It is an approximation and self-described as such. Do not adopt as authoritative.

---

## H. Gaps, Uncertainties, and Suggested Follow-Up

1. ~~**C4/C10 (40518 behavior)** is the most operationally dangerous gap.~~ **Settled on hardware 2026-10-08:** 40518 is Pause and 40524 is Resume, they are inert when they do not apply, and a resumed brew continues. The live hazard moved to `8019`, which reads like a pause in every source and actually abandons the recipe for a water pour.

2. **C5/C6 (unit command payload values)** are a direct conflict with no hardware resolution. A simple test (send each value, observe machine display) would resolve in under a minute.

3. **C3 (8104 Set Cup values)** — the field's semantics are unknown. The machine brews without it (tested by brAzzi64). XBRW++ could safely omit this command initially and add it once semantics are understood.

4. **Tea protocol** was the least verified area overall. C11 (pause encoding) is now resolved in HomoLand's favour by a stopwatched steep on hardware (2026-09-01, V12.0D.500). Multi-steep tea beyond a single steep is still unverified.

5. **FFE3 (aux characteristic)** — no source documents what this is used for. All implementations ignore it.

6. **Firmware versions** — all testing is against V12.0D.500. Protocol may differ on other versions. No cross-firmware comparison exists.

7. **Slot read-back** — confirmed impossible over BLE. Apps must track slot state locally.

8. **8102 bypass semantics** — the exact meaning of `bypass_temp * 10` (is it temp in tenths of a degree, or temp × 10 in Celsius?) and how the machine uses bypass volume are not documented beyond the packet format.

9. **Scale Enter (8003)** — confirmed from APK decompile by saya6k (2026-07-19), not yet confirmed by hardware test in any documented session.

10. **Grinder calibration command** — referenced in saya6k's LLM prompt but the underlying BLE command is not documented.

11. **Pour radius / vibration amplitude reads** — the notify response format for commands 11506 and 11508 (read requests) is not documented by HomoLand. `inferred` that the machine returns a value in a notification but the notification format is unknown.
